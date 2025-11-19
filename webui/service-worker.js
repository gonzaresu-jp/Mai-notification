// service-worker.js (iOS対応版 v3.2.1)
const VERSION = 'v3.2.1';
const ALWAYS_OPEN_NEW_TAB = false;

// iOS対応: キャッシュ設定
const CACHE_NAME = 'mai-notification-v1';
const urlsToCache = [
  '/pushweb/',
  '/pushweb/index.html',
  '/pushweb/style.css',
  '/pushweb/main.js',
  '/pushweb/ios-helper.js',
  '/pushweb/icon.ico',
  '/pushweb/icon-192.webp',
  '/pushweb/icon-512.webp'
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
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュがあればそれを返す
        if (response) {
          return response;
        }
        // なければネットワークから取得
        return fetch(event.request);
      })
  );
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
  let title = '通知', body = '通知内容', icon = '/pushweb/icon.ico', url = null;
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
    icon: icon || '/pushweb/icon-192.webp', // iOS用にPNG優先
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
let targetUrl = notificationData.url || (notificationData.data && notificationData.data.url) || '/pushweb/';
  const ua = self.navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  
  // 🌟 デバッグログ 1: 変換前のURLとデバイス判定の確認 🌟
  console.log(`[SW ${VERSION}] Debug 1: Target URL (Pre-conversion): ${targetUrl}`);
  console.log(`[SW ${VERSION}] Debug 1: Is Android: ${isAndroid}, Is iOS: ${isIOS}`);


  // --- 1. Androidの場合 (Intentを使って完璧にハンドリング) ---
  if (isAndroid) {
    // Twitter
    if (targetUrl.includes('twitter.com') || targetUrl.includes('x.com')) {
      const match = targetUrl.match(/\/status\/(\d+)/);
      if (match) {
        // Intent構文: アプリがあれば開き、なければ元のhttps URLをブラウザで開く
        targetUrl = `x://x.com/i/status/${match[1]}#Intent;scheme=x;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(targetUrl)};end`;
        // 🌟 デバッグログ 2-X: XのIntent URL生成の確認 🌟
        console.log(`[SW ${VERSION}] Debug 2-X: Intent URL Generated: ${targetUrl}`);
      }
    }
    // YouTube
    else if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
      let vId = null;
      // 🚨 潜在的なエラー箇所: new URL() の呼び出しを try-catch で保護することを強く推奨します
      try {
        if (targetUrl.includes('v=')) vId = new URL(targetUrl).searchParams.get('v');
        else if (targetUrl.includes('youtu.be/')) vId = targetUrl.split('youtu.be/')[1]?.split('?')[0];
      } catch(e) {
          console.error(`[SW ${VERSION}] ❌ YouTube URL解析エラー: ${e.message}`, targetUrl);
      }
      
      if (vId) {
        targetUrl = `intent://www.youtube.com/watch?v=${vId}#Intent;scheme=youtube;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(targetUrl)};end`;
        // 🌟 デバッグログ 2-Y: YouTubeのIntent URL生成の確認 🌟
        console.log(`[SW ${VERSION}] Debug 2-Y: Intent URL Generated: ${targetUrl}`);
      }
    }
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