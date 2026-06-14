const { contextBridge, webFrame, ipcRenderer } = require('electron');

// PushManager override をメインワールドに注入（ページスクリプトより先に実行される）
try {
  webFrame.executeJavaScript(`
      (function() {
          console.log('[Electron] Injecting PushManager override');

      class _ElectronPushManager {
        async getSubscription() {
          try {
            var raw = localStorage.getItem('pushSubscription');
            if (raw) {
              var sub = JSON.parse(raw);
              sub.unsubscribe = function() {
                localStorage.removeItem('pushSubscription');
                if (window.electronAPI && window.electronAPI.setPushEnabled) window.electronAPI.setPushEnabled(false);
                return Promise.resolve(true);
              };
              if (window.electronAPI && window.electronAPI.setPushEnabled) window.electronAPI.setPushEnabled(true);
              return sub;
            }
          } catch(e) {}
          return null;
        }
        async subscribe(o) {
          var randB64 = function(n) {
            var a = new Uint8Array(n);
            crypto.getRandomValues(a);
            return btoa(String.fromCharCode.apply(null, a));
          };
          var self = this;
          var sub = {
            endpoint: 'https://electron-fcm/mai-push/' + Date.now() + Math.random().toString(36).slice(2),
            expirationTime: null,
            keys: { auth: randB64(16), p256dh: randB64(65) },
            toJSON: function() { return { endpoint: this.endpoint, keys: this.keys, expirationTime: null }; },
            unsubscribe: function() {
              if (window.electronAPI && window.electronAPI.setPushEnabled) {
                window.electronAPI.setPushEnabled(false);
              }
              return Promise.resolve(true);
            }
          };
          console.log('[Electron] Mock subscribe OK:', sub.endpoint);
          if (window.electronAPI && window.electronAPI.setPushEnabled) {
            window.electronAPI.setPushEnabled(true);
          }
          return sub;
        }
        async permissionState() { return 'granted'; }
      }

      window.PushManager = _ElectronPushManager;
      console.log('[Electron] window.PushManager overridden');

      try {
        var desc = Object.getOwnPropertyDescriptor(ServiceWorkerRegistration.prototype, 'pushManager');
        console.log('[Electron] pushManager descriptor configurable:', desc ? String(desc.configurable) : 'no-desc');
        if (desc && desc.configurable) {
          Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', {
            get: function() { return new _ElectronPushManager(); },
            configurable: true,
            enumerable: true,
          });
          console.log('[Electron] pushManager getter overridden on ServiceWorkerRegistration.prototype');
        } else {
          console.log('[Electron] pushManager not configurable, trying ready Proxy');
          throw new Error('not configurable');
        }
      } catch(e) {
        console.warn('[Electron] pushManager override failed:', e.message);
        try {
          var scProto = Object.getPrototypeOf(navigator.serviceWorker);
          var readyDesc = Object.getOwnPropertyDescriptor(scProto, 'ready');
          console.log('[Electron] ready descriptor configurable:', readyDesc ? String(readyDesc.configurable) : 'no-desc');
          if (readyDesc && readyDesc.configurable) {
            Object.defineProperty(scProto, 'ready', {
              get: function() {
                var p = readyDesc.get.call(navigator.serviceWorker);
                return p.then(function(reg) {
                  return new Proxy(reg, {
                    get: function(t, prop) {
                      if (prop === 'pushManager') return new _ElectronPushManager();
                      var v = Reflect.get(t, prop);
                      return typeof v === 'function' ? v.bind(t) : v;
                    }
                  });
                });
              },
              configurable: true,
              enumerable: true,
            });
            console.log('[Electron] ready Proxy OK');
          } else {
            console.error('[Electron] ready also not configurable!');
          }
        } catch(e2) { console.error('[Electron] Proxy fallback failed:', e2); }
      }

      // Intercept test notification: show local notification instead of web push
      var origFetch = window.fetch;
      window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        if (url.indexOf('/api/send-test') !== -1) {
          console.log('[Electron] Intercepted send-test, showing local notification');
          if (window.electronAPI && window.electronAPI.showNotification) {
            window.electronAPI.showNotification({ title: '\u30C6\u30B9\u30C8\u901A\u77E5', body: '\u901A\u77E5\u306F\u6B63\u5E38\u306B\u6A5F\u80FD\u3057\u3066\u3044\u307E\u3059', icon: './icon.webp', image: '/testnotify.webp', url: '/test/' });
          }
          return Promise.resolve(new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        return origFetch.call(this, input, init);
      };
      console.log('[Electron] fetch override OK');
    })();
  `);
} catch(e) {
  console.error('[preload] webFrame.executeJavaScript failed:', e);
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
  showNotification: (opts) => ipcRenderer.invoke('show-notification', opts),
  setPushEnabled: (enabled) => ipcRenderer.invoke('set-push-enabled', enabled),
});
