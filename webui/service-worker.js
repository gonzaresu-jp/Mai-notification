// service-worker.js (整理版 v3.0)
const VERSION = 'v3.0';
const ALWAYS_OPEN_NEW_TAB = false;

console.log(`[SW ${VERSION}] ========== Service Worker loaded ==========`);

// 二重通知防止
let isProcessingPush = false;
const processedNotifications = new Map();
const NOTIFICATION_CACHE_TIME = 60000; // 60秒

// --- install & activate ---
self.addEventListener('install', event => {
  console.log(`[SW ${VERSION}] 🔧 Installing...`);
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log(`[SW ${VERSION}] ⚡ Activating...`);
  event.waitUntil(self.clients.claim());
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
  const options = { 
    body, 
    icon, 
    data: { url, timestamp: now, notificationId: uniqueTag },
    requireInteraction: false,
    tag: uniqueTag,
    renotify: false,
    vibrate: [200,100,200]
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

  let targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const fullUrl = new URL(targetUrl, self.location.origin).href;

  if (ALWAYS_OPEN_NEW_TAB) {
    event.waitUntil(clients.openWindow(fullUrl));
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === new URL(fullUrl).origin) {
            client.postMessage({ type:'NAVIGATE', url: fullUrl });
            return client.focus().then(() => {});
          }
        } catch(e) {}
      }
      return clients.openWindow(fullUrl);
    })
  );
});
