// service-worker.js (iOS対応版 v3.54 - 履歴Invalidate/互換メッセージ付き)

const VERSION = 'v3.54';
const CACHE_NAME = `mai-notification-${VERSION}`;
const ALWAYS_OPEN_NEW_TAB = false;

// iOS対応: キャッシュ設定
const urlsToCache = [
  '/',
  './js/main.js',
  './ios-helper.js',
  './icon.ico',
  './icon-192.webp',
  './icon-512.webp'
];

console.log(`[SW ${VERSION}] ========== Service Worker loaded ==========`);

// 二重通知防止
let isProcessingPush = false;
const processedNotifications = new Map();
const NOTIFICATION_CACHE_TIME = 60000; // 60秒

// ---------- 共通ユーティリティ ----------
async function broadcastMessage(message) {
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });
  for (const client of windowClients) {
    client.postMessage(message);
  }
  return windowClients.length;
}

function cleanupProcessedNotifications(now) {
  const cutoff = now - NOTIFICATION_CACHE_TIME;
  for (const [hash, ts] of processedNotifications.entries()) {
    if (ts < cutoff) processedNotifications.delete(hash);
  }
}

async function focusOrOpen(url) {
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  // 既存タブがあればフォーカスし、必要ならナビゲート指示
  for (const client of windowClients) {
    try {
      if ('focus' in client) {
        await client.focus();
        client.postMessage({ type: 'NAVIGATE', url });
        return;
      }
    } catch (e) {
      // 失敗しても次へ
    }
  }

  // タブが無ければ新規オープン
  if (self.clients.openWindow) {
    await self.clients.openWindow(url);
  }
}

function safeMakeAbsoluteUrl(targetUrl) {
  try {
    return new URL(targetUrl, self.location.origin).href;
  } catch {
    return self.location.origin + '/';
  }
}

// ---------- install & activate ----------
self.addEventListener('install', event => {
  console.log(`[SW ${VERSION}] install start (non-blocking)`);
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // 1) 必須最小セット
    const critical = ['/', './index.php', './style.v1.9.css', './js/main.js'];
    try {
      await cache.addAll(critical);
      console.log(`[SW ${VERSION}] cached critical assets`);
    } catch (e) {
      console.warn(`[SW ${VERSION}] cache critical failed`, e);
      // インストール継続（堅牢性優先）
    }

    // 2) 残りはベストエフォート
    const rest = urlsToCache.filter(u => !critical.includes(u));
    const promises = rest.map(async (u) => {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (r.ok) {
          await cache.put(u, r.clone());
          return;
        }
        throw new Error('fetch failed: ' + u);
      } catch (err) {
        console.warn(`[SW ${VERSION}] noncritical cache failed`, u, err);
      }
    });
    await Promise.allSettled(promises);

    await self.skipWaiting();
    console.log(`[SW ${VERSION}] install finished (skipWaiting)`);
  })());
});

self.addEventListener('activate', event => {
  console.log(`[SW ${VERSION}] ⚡ Activating...`);
  event.waitUntil((async () => {
    // 古いキャッシュ削除
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(name => {
        if (name !== CACHE_NAME) {
          console.log(`[SW ${VERSION}] 🗑️ Deleting old cache: ${name}`);
          return caches.delete(name);
        }
      })
    );

    await self.clients.claim();
  })());
});

// ---------- fetch (オフライン対応) ----------
// 注意点:
// - 非GETはSWが横取りしない（POST等で壊れる）
// - /api は原則ネットワーク（オフライン時のキャッシュは混乱の元）
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 同一オリジン以外は触らない（CDN等を勝手にキャッシュしない）
  if (url.origin !== self.location.origin) return;

  // APIはネットワーク優先（失敗なら503）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      }
    })());
    return;
  }

  // JS/CSS/HTML は常に最新を取りに行く（HTTPキャッシュを極力回避）
  const isMutableTextAsset =
    req.destination === 'script' ||
    req.destination === 'style' ||
    req.destination === 'document' ||
    /\.(js|css|html?)$/i.test(url.pathname);

  if (isMutableTextAsset) {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch (err) {
        // オフライン時のみキャッシュを使う
        try {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(req);
          if (cached) return cached;
        } catch {
          // ignore
        }
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      }
    })());
    return;
  }

  // 画像は Cache First + 裏で更新（Stale-While-Revalidate）
  // → 一度見た画像は次回から即キャッシュで出る。ネットワークが生きてれば更新も走る。
  const isImage = req.destination === 'image'
    || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname);

  if (isImage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      // まずキャッシュがあれば即返す
      const cached = await cache.match(req);
      if (cached) {
        // 裏で更新（失敗しても無視）
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(req);
            if (fresh && fresh.ok) await cache.put(req, fresh.clone());
          } catch {
            // ignore
          }
        })());
        return cached;
      }

      // キャッシュが無ければネットワーク→成功なら保存
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        console.warn(`[SW ${VERSION}] image fetch failed`, req.url, err);
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      }
    })());
    return;
  }

  // それ以外はネットワーク優先、落ちたらキャッシュ
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (err) {
      console.warn(`[SW ${VERSION}] fetch failed for`, req.url, err);

      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
      } catch {
        // ignore
      }

      // iconのフォールバック
      if (url.pathname.endsWith('/icon.ico') || url.pathname.endsWith('icon.ico')) {
        try {
          const cache = await caches.open(CACHE_NAME);
          const fallback = await cache.match('./icon.ico');
          if (fallback) return fallback;
        } catch {
          // ignore
        }
      }

      return new Response('', { status: 503, statusText: 'Service Unavailable' });
    }
  })());
});


// ---------- push ----------
self.addEventListener('push', event => {
  console.log(`[SW ${VERSION}] ========== PUSH EVENT RECEIVED ==========`);

  if (isProcessingPush) {
    console.warn(`[SW ${VERSION}] ⚠️ Already processing push, ignoring duplicate`);
    return;
  }
  isProcessingPush = true;

  event.waitUntil((async () => {
    try {
      let data = {};
      if (event.data) {
        try {
          data = event.data.json();
        } catch (e) {
          // event.data.text() は Promise
          try {
            const textData = await event.data.text();
            data = { title: textData || '通知' };
          } catch {
            data = {};
          }
        }
      }

      // title, body, icon, url を抽出
      let title = '通知';
      let body = '通知内容';
      let icon = './icon.ico';
      let url = null;

      if (data?.data && typeof data.data === 'object') {
        title = data.data.title || data.type || title;
        body = data.data.body || data.data.title || body;
        icon = data.data.icon || icon;
        url = data.data.url || null;
      } else {
        title = data.title || title;
        body = data.body || body;
        icon = data.icon || icon;
        url = data.url || null;
      }

      const now = Date.now();

      // 重複チェック（秒単位でまとめる：短時間の同一通知連打を抑止）
      const notificationHash = `${title}:${url}:${Math.floor(now / 1000)}`;
      if (processedNotifications.has(notificationHash)) {
        console.warn(`[SW ${VERSION}] ⚠️ DUPLICATE DETECTED, ignoring`);
        return;
      }
      processedNotifications.set(notificationHash, now);
      cleanupProcessedNotifications(now);

      const uniqueTag = 'mai-push-' + now;

      // iOS/各ブラウザ差異があるので、オプションは安全側に倒す
      const options = {
        body,
        icon: icon || './icon-192.webp',
        data: { url, timestamp: now, notificationId: uniqueTag, raw: data },
        requireInteraction: false,
        tag: uniqueTag,
        renotify: false,
        timestamp: now,
        silent: false
        // vibrate は非対応環境が多い（特にiOS）。入れても害は少ないがログのノイズになるので外す。
      };

      await self.registration.showNotification(title, options);
      console.log(`[SW ${VERSION}] ✅ Notification shown`);

      // ★核心：履歴が更新された可能性 -> UI側へ無効化通知
      // 新main.jsは HISTORY_INVALIDATE を優先して扱える
      const sent = await broadcastMessage({
        type: 'HISTORY_INVALIDATE',
        timestamp: now,
        notification: { title, body, url }
      });
      console.log(`[SW ${VERSION}] 📢 HISTORY_INVALIDATE sent to ${sent} clients`);

      // 旧互換（既存main.js向け）
      await broadcastMessage({
        type: 'CLEAR_HISTORY_CACHE',
        timestamp: now,
        notification: { title, body, url }
      });

    } catch (err) {
      console.error(`[SW ${VERSION}] ❌ push handler failed`, err);
    } finally {
      // 連続push対策のロック解除
      isProcessingPush = false;
    }
  })());
});

// ---------- notificationclick ----------
self.addEventListener('notificationclick', event => {
  console.log(`[SW ${VERSION}] 🖱️ Notification clicked`);
  event.notification.close();

  event.waitUntil((async () => {
    const notificationData = event.notification?.data || {};
    let targetUrl =
      notificationData.url ||
      (notificationData.data && notificationData.data.url) ||
      '/';

    const ua = (self.navigator && self.navigator.userAgent) ? self.navigator.userAgent : '';
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isPC = !isAndroid && !isIOS;

    console.log(`[SW ${VERSION}] Debug: targetUrl(pre)=${targetUrl} android=${isAndroid} ios=${isIOS}`);

    // クリック時は「確実に最新」へ寄せる（新/旧両方送る）
    await broadcastMessage({ type: 'HISTORY_INVALIDATE' });
    await broadcastMessage({ type: 'CLEAR_AND_RELOAD_HISTORY', url: targetUrl });

    // ===== 共通：まずURLを絶対化 =====
    const fullUrl = safeMakeAbsoluteUrl(targetUrl);

    // ===== PCだけ：外部リンクは別タブ =====
    if (isPC) {
      let isExternal = false;
      try {
        const u = new URL(fullUrl);
        isExternal = u.origin !== self.location.origin;
      } catch {
        isExternal = false;
      }

      if (isExternal) {
        console.log(`[SW ${VERSION}] PC external -> open new tab: ${fullUrl}`);
        await self.clients.openWindow(fullUrl);
        return;
      }
      // PC内部リンクは従来通り（既存タブ優先）
      console.log(`[SW ${VERSION}] PC internal -> focusOrOpen: ${fullUrl}`);
      await focusOrOpen(fullUrl);
      return;
    }

    // ===== Android =====
    if (isAndroid && targetUrl) {
      const pushWebDomains = [
        'youtube.com',
        'youtu.be',
        'x.com',
        'twitter.com',
        'twitcasting.tv',
        'fanbox.cc'
      ];

      const shouldOpenPushWeb = pushWebDomains.some(domain => targetUrl.includes(domain));
      const finalUrl = shouldOpenPushWeb ? '/' : targetUrl;

      console.log(`[SW ${VERSION}] Android: opening -> ${finalUrl}`);
      await focusOrOpen(safeMakeAbsoluteUrl(finalUrl));
      return;
    }

    // ===== iOS（アプリ起動スキームへ変換）=====
    if (isIOS && typeof targetUrl === 'string') {
      try {
        if (targetUrl.includes('twitter.com') || targetUrl.includes('x.com')) {
          const match = targetUrl.match(/\/status\/(\d+)/);
          if (match) targetUrl = `x://status?id=${match[1]}`;
        } else if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
          let vId = null;
          if (targetUrl.includes('v=')) {
            try { vId = new URL(targetUrl).searchParams.get('v'); } catch {}
          } else if (targetUrl.includes('youtu.be/')) {
            vId = targetUrl.split('youtu.be/')[1]?.split('?')[0] || null;
          }
          if (vId) targetUrl = `youtube://${vId}`;
        }
      } catch {}
    }

    // ===== intent / scheme =====
    if (
      typeof targetUrl === 'string' &&
      (targetUrl.startsWith('intent://') || targetUrl.startsWith('x://') || targetUrl.startsWith('youtube://'))
    ) {
      console.log(`[SW ${VERSION}] Opening scheme/intent: ${targetUrl}`);
      await self.clients.openWindow(targetUrl);
      return;
    }

    // ===== その他（iOSで通常URLに落ちた場合など）=====
    console.log(`[SW ${VERSION}] Non-PC web url -> focusOrOpen: ${fullUrl}`);
    await focusOrOpen(fullUrl);
  })());
});

// ---------- message ----------
self.addEventListener('message', event => {
  console.log(`[SW ${VERSION}] 📨 Message received:`, event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---------- sync (将来拡張用) ----------
self.addEventListener('sync', event => {
  console.log(`[SW ${VERSION}] 🔄 Background sync:`, event.tag);

  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      fetch('/api/history?limit=5', { cache: 'no-store' })
        .then(response => response.json())
        .then(data => {
          console.log(`[SW ${VERSION}] ✅ Synced notifications:`, data);
        })
        .catch(error => {
          console.error(`[SW ${VERSION}] ❌ Sync failed:`, error);
        })
    );
  }
});

console.log(`[SW ${VERSION}] ========== Service Worker ready ==========`);
