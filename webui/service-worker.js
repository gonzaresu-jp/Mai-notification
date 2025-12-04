// service-worker.js (iOS対応版 v3.4)
const VERSION = 'v3.4';
const ALWAYS_OPEN_NEW_TAB = false;

// iOS対応: キャッシュ設定
const CACHE_NAME = 'mai-notification-v1';
const urlsToCache = [
  '/',
  './index.html',
  './style.css',
  './main.js',
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

// --- install & activate ---
self.addEventListener('install', event => {
    console.log('[SW] install start');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] caching files:', urlsToCache);
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('[SW] install success');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('[SW] install failed:', err);
            })
    );
});


self.addEventListener('activate', event => {
  console.log(`[SW ${VERSION}] ⚡ Activating...`);
  
  // iOS対応: 古いキャッシュ削除
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[SW ${VERSION}] 🗑️ Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// iOS対応: オフライン対応のフェッチイベント
self.addEventListener('fetch', event => {
  // すぐに非同期関数を作ってその Promise を渡す（reject を絶対に外に出さない）
  event.respondWith((async () => {
    try {
      // まず通常のネットワークフェッチを試みる
      const networkResponse = await fetch(event.request);
      // 成功ならそのまま返す（必要ならキャッシュへ保存する処理をここに追加）
      return networkResponse;
    } catch (err) {
      // ネットワーク失敗時のフォールバック処理
      console.warn('SW fetch failed for', event.request.url, err);

// ① キャッシュにフォールバックがあれば返す（推奨）
try {
  // 修正 1: 'static-v1' を CACHE_NAME に変更
  const cache = await caches.open(CACHE_NAME); 
  const cached = await cache.match(event.request);
  if (cached) return cached;
} catch (cacheErr) {
  // ...
}

// ② 特定リソース（アイコン等）用の固定フォールバックを返す
if (event.request.url.endsWith('/icon.ico')) {
  // ...
  try {
    // 修正 2: 'static-v1' を CACHE_NAME に変更
    const cache = await caches.open(CACHE_NAME);
    // 補足: /fallback-icon.ico はキャッシュされていないため、キャッシュした './icon.ico' をマッチさせます。
    const fallback = await cache.match('./icon.ico'); 
    if (fallback) return fallback;
  } catch (e) { /* ignore */ }
}

      // ③ 最終的なデフォルトレスポンス（404 や空のレスポンスなど）
      return new Response('', { status: 503, statusText: 'Service Unavailable' });
    }
  })());
});

// --- push event ---
self.addEventListener('push', event => {
  console.log(`[SW ${VERSION}] ========== PUSH EVENT RECEIVED ==========`);
  
  if (isProcessingPush) {
    console.warn(`[SW ${VERSION}] ⚠️ Already processing push, ignoring duplicate`);
    return;
  }
  isProcessingPush = true;

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      const textData = event.data.text ? event.data.text() : null;
      data = { title: textData || '通知' };
    }
  }

  // title, body, icon, url を抽出
  let title = '通知', body = '通知内容', icon = './icon.ico', url = null;
  if (data.data && typeof data.data === 'object') {
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

  // 重複チェック用ハッシュ
  const now = Date.now();
  const notificationHash = `${title}:${url}:${Math.floor(now/1000)}`;
  
  if (processedNotifications.has(notificationHash)) {
    console.warn(`[SW ${VERSION}] ⚠️ DUPLICATE DETECTED, ignoring`);
    isProcessingPush = false;
    return;
  }
  
  processedNotifications.set(notificationHash, now);

  // 古いキャッシュ削除
  const cutoff = now - NOTIFICATION_CACHE_TIME;
  for (const [hash, ts] of processedNotifications.entries()) {
    if (ts < cutoff) processedNotifications.delete(hash);
  }

  const uniqueTag = 'mai-push-' + now;
  
  // iOS対応: 通知オプションを最適化
  const options = { 
    body, 
    icon: icon || './icon-192.webp', // iOS用にPNG優先
    data: { url, timestamp: now, notificationId: uniqueTag },
    requireInteraction: false,
    tag: uniqueTag,
    renotify: false,
    vibrate: [200, 100, 200],
    timestamp: now, // iOS対応: タイムスタンプ追加
    silent: false // iOS対応: サイレント通知を防ぐ
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      console.log(`[SW ${VERSION}] ✅ Notification shown`);
      setTimeout(() => { isProcessingPush = false; }, 1000);
    }).catch(err => {
      console.error(`[SW ${VERSION}] ❌ Failed to show notification`, err);
      isProcessingPush = false;
    })
  );
});

// --- notificationclick ---
self.addEventListener('notificationclick', event => {
  console.log(`[SW ${VERSION}] 🖱️ Notification clicked`);
  event.notification.close();

  // service-worker.js の 'notificationclick' イベント内
let notificationData = event.notification.data || {};
// 'url'プロパティか、または'data.url'プロパティからURLを探す
let targetUrl = notificationData.url || (notificationData.data && notificationData.data.url) || '/';
  const ua = self.navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  
  // 🌟 デバッグログ 1: 変換前のURLとデバイス判定の確認 🌟
  console.log(`[SW ${VERSION}] Debug 1: Target URL (Pre-conversion): ${targetUrl}`);
  console.log(`[SW ${VERSION}] Debug 1: Is Android: ${isAndroid}, Is iOS: ${isIOS}`);

// --- Android 用: ドメインに基づいて開くURLを決定 ---
if (isAndroid && targetUrl) {
    // pushweb を開くべきドメインのリスト
    const pushWebDomains = [
        'youtube.com',
        'youtu.be', // YouTubeの短縮URL用
        'x.com', 
        'twitter.com',
        'twitcasting.tv',
        'fanbox.cc'
    ];
    
    // 開くべき最終的なURLを決定する変数
    let finalUrl = targetUrl;
    
    // ターゲットURLが pushWebDomains のいずれかに含まれているかチェック
    const shouldOpenPushWeb = pushWebDomains.some(domain => targetUrl.includes(domain));
    
    // YouTube, X, TwitCasting, Fanbox の場合
    if (shouldOpenPushWeb) {
        // 固定の pushweb URL に書き換え
        finalUrl = '/';
        console.log(`[SW ${VERSION}] Info: Target URL is a special domain. Opening fixed pushweb URL -> ${finalUrl}`);
    } else {
        // その他の直リンク
        console.log(`[SW ${VERSION}] Info: Target URL is direct. Opening original URL -> ${finalUrl}`);
    }

    event.waitUntil(
        (async () => {
            try {
                // 決定した finalUrl を開く
                console.log(`[SW ${VERSION}] Debug: opening Android URL -> ${finalUrl}`);
                await clients.openWindow(finalUrl);
                console.log(`[SW ${VERSION}] Debug: URL open requested for: ${finalUrl}`);
            } catch (e) {
                console.warn(`[SW ${VERSION}] openWindow failed, attempting client messaging fallback:`, e);

                // フォールバックロジックはそのまま維持
                try {
                    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
                    if (windowClients && windowClients.length > 0) {
                        const sameOrigin = windowClients.find(c => {
                            try { return new URL(c.url).origin === self.location.origin; } catch(e){ return false; }
                        }) || windowClients[0];

                        try {
                            await sameOrigin.focus();
                            // フォールバックでも finalUrl を使用
                            sameOrigin.postMessage({ type: 'OPEN_URL', url: finalUrl });
                            console.log(`[SW ${VERSION}] Debug: posted OPEN_URL to client for: ${finalUrl}`);
                        } catch (e) {
                            console.warn(`[SW ${VERSION}] client messaging fallback failed:`, e);
                        }
                    }
                } catch (e) {
                    console.warn(`[SW ${VERSION}] matchAll fallback failed:`, e);
                }
            }
        })()
    );

    return; // Android ブロック終了
}

  // 🌟 Debug 2 が出力されなかった場合、targetUrl は https:// のままです


  // --- 2. iOSの場合 (アプリ起動スキームへ変換) ---
  else if (isIOS) {
     if (targetUrl.includes('twitter.com') || targetUrl.includes('x.com')) {
        const match = targetUrl.match(/\/status\/(\d+)/);
        if (match) targetUrl = `x://status?id=${match[1]}`;
     }
     else if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
        let vId = null;
        if (targetUrl.includes('v=')) vId = new URL(targetUrl).searchParams.get('v');
        else if (targetUrl.includes('youtu.be/')) vId = targetUrl.split('youtu.be/')[1]?.split('?')[0];
        
        if (vId) targetUrl = `youtube://${vId}`;
     }
  }

  // --- 3. 開く処理 ---
  
  // Intent(Android) や アプリスキーム(iOS) の場合
  if (targetUrl.startsWith('intent://') || targetUrl.startsWith('x://') || targetUrl.startsWith('youtube://')) {
    // 🌟 デバッグログ 3: Intent/Schemeで開くロジックに進んだ 🌟
    console.log(`[SW ${VERSION}] Debug 3: Opening Intent/Scheme URL: ${targetUrl}`);
    event.waitUntil(clients.openWindow(targetUrl));
    return;
  }

  // PCや通常のWebリンクの場合
  const fullUrl = new URL(targetUrl, self.location.origin).href;
  // 🌟 デバッグログ 4: 通常のWeb URLで開くロジックに進んだ 🌟
  console.log(`[SW ${VERSION}] Debug 4: Opening Full Web URL: ${fullUrl}`);
  if (ALWAYS_OPEN_NEW_TAB) {
      event.waitUntil(clients.openWindow(fullUrl));
      return;
  }

  if (ALWAYS_OPEN_NEW_TAB) {
    event.waitUntil(clients.openWindow(fullUrl));
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // 既存のタブを探す
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === new URL(fullUrl).origin) {
            // iOS対応: メッセージ送信とフォーカス
            client.postMessage({ type: 'NAVIGATE', url: fullUrl });
            return client.focus().then(() => {
              console.log(`[SW ${VERSION}] ✅ Focused existing tab`);
            });
          }
        } catch(e) {
          console.error(`[SW ${VERSION}] ❌ Error focusing tab:`, e);
        }
      }
      // タブがない場合は新規作成
      return clients.openWindow(fullUrl).then(client => {
        console.log(`[SW ${VERSION}] ✅ Opened new tab`);
        return client;
      });
    })
  );
});

// iOS対応: メッセージ受信（フォアグラウンド通知用）
self.addEventListener('message', event => {
  console.log(`[SW ${VERSION}] 📨 Message received:`, event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// iOS対応: バックグラウンド同期（将来的な拡張用）
self.addEventListener('sync', event => {
  console.log(`[SW ${VERSION}] 🔄 Background sync:`, event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      fetch('/api/history?limit=5')
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