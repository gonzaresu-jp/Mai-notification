const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, Notification, session, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const sharp = require('sharp');

const HELPER_EXE = path.join(__dirname, 'toast-helper.exe');
const SNORETOAST = path.join(path.dirname(require.resolve('node-notifier')), 'vendor', 'snoretoast', process.arch === 'x64' ? 'snoretoast-x64.exe' : 'snoretoast-x86.exe');

app.name = 'まいちゃん通知';
const DEFAULT_URL = 'https://mai.honna-yuzuki.com';
// const DEFAULT_URL = 'data:text/html,<h1>Hello Electron</h1><script>console.log("Page JS works")</script>';
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const SSE_PATH = '/api/events/stream';
const HISTORY_PATH = '/api/history?limit=5&offset=0';
const FALLBACK_INTERVAL = 30000;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let lastNotifId = 0;
let sseTimer = null;
let pushEnabled = false;

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH))
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (e) {}
  return { url: DEFAULT_URL };
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
  } catch (e) {}
}

function loadURLSafe(wc, url) {
  wc.loadURL(url).catch(() => wc.loadFile(path.join(__dirname, 'settings.html')));
}

// --- Pre-grant notification permission ---
function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'notifications') return callback(true);
    callback(false);
  });
  ses.setPermissionCheckHandler((wc, permission) => {
    return permission === 'notifications';
  });
}

// --- Initialize lastNotifId to skip existing notifications ---
async function initializeLastId(baseUrl) {
  try {
    const url = baseUrl.replace(/\/+$/, '') + HISTORY_PATH;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.logs && data.logs.length)
      lastNotifId = Math.max(...data.logs.map(l => l.id));
  } catch (e) {}
}

// --- SSE Client (real-time) ---
async function connectSSE(baseUrl) {
  const url = baseUrl.replace(/\/+$/, '') + SSE_PATH;
  let resp;
  try {
    resp = await fetch(url, {
      headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch (e) {
    if (!isQuitting) setTimeout(() => connectSSE(baseUrl), 3000);
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', dataLine = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) dataLine = line.slice(6);
        else if (line === '' && dataLine) {
          try {
            const ev = JSON.parse(dataLine);
            if (ev.type === 'history-updated' && ev.added && ev.added.length)
              checkNewNotifications(baseUrl);
          } catch (e) {}
          dataLine = '';
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError' || isQuitting) return;
  }
  if (!isQuitting) setTimeout(() => connectSSE(baseUrl), 3000);
}

async function checkNewNotifications(baseUrl) {
  try {
    const url = baseUrl.replace(/\/+$/, '') + HISTORY_PATH;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.logs || !data.logs.length) return;
    const maxId = Math.max(...data.logs.map(l => l.id));
    if (maxId <= lastNotifId) return;
    const newLogs = data.logs.filter(l => l.id > lastNotifId).sort((a, b) => a.id - b.id);
    for (const log of newLogs) showNotification(log);
    lastNotifId = maxId;
  } catch (e) {}
}

function startRealTime(baseUrl) {
  if (!pushEnabled) return;
  if (sseTimer) clearInterval(sseTimer);
  sseTimer = setInterval(() => checkNewNotifications(baseUrl), FALLBACK_INTERVAL);
  connectSSE(baseUrl);
}

function stopRealTime() {
  if (sseTimer) { clearInterval(sseTimer); sseTimer = null; }
}

// --- Show notification: native + renderer (with image) ---
function resolveUrl(p, base) {
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const b = base.replace(/\/+$/, '');
  if (p.startsWith('/')) return b + p;
  return b + '/' + p;
}

function showNotification(log) {
  const baseUrl = (loadSettings().url || DEFAULT_URL).replace(/\/+$/, '');
  const imgUrl = log.media_url && log.media_type === 'image' ? log.media_url : log.image;

  const data = {
    title: log.title || 'Mai Push',
    body: log.body || '',
    icon: resolveUrl(log.icon || '', baseUrl),
    image: resolveUrl(imgUrl || '', baseUrl),
    url: log.url || '',
  };

  showNativeNotif(data);
}

let injectPending = [];

function ensureAumid() {
  try {
    execFileSync(SNORETOAST, ['-install', 'まいちゃん通知', HELPER_EXE, 'MaiPush.Desktop'], { windowsHide: true, timeout: 10000 });
    const lnkPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'まいちゃん通知.lnk');
    const appIcon = iconLocalPath();
    if (require('fs').existsSync(lnkPath)) {
      execFileSync('powershell', ['-NoProfile', '-Command',
        `$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('${lnkPath.Replace(/'/g, "''")}'); $sc.IconLocation = '${appIcon.Replace(/'/g, "''")},0'; $sc.Save()`
      ], { windowsHide: true, timeout: 10000 });
      console.log('[AUMID] shortcut icon set');
    }
    console.log('[AUMID] registered');
  } catch (err) {
    console.error('[AUMID] register failed:', err.message);
  }
}

function navigateToUrl(url) {
  if (url && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    } else {
      const baseUrl = (loadSettings().url || DEFAULT_URL).replace(/\/+$/, '');
      loadURLSafe(mainWindow.webContents, baseUrl + url);
    }
  }
}

function iconPath() {
  const src = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'icons', 'icon.png')
    : path.join(__dirname, 'icons', 'icon.png');
  const dst = path.join(app.getPath('temp'), 'mai-push-icon.png');
  try {
    if (!require('fs').existsSync(src)) {
      console.error('[Icon] source not found:', src);
    } else {
      require('fs').copyFileSync(src, dst);
      console.log('[Icon] copied:', src, '->', dst);
    }
  } catch (e) {
    console.error('[Icon] copy failed:', e.message);
  }
  return dst;
}

function iconLocalPath() {
  const file = 'icon.ico';
  let src;
  if (app.isPackaged) {
    src = path.join(process.resourcesPath, 'app.asar.unpacked', 'icons', file);
  } else {
    src = path.join(__dirname, 'icons', file);
  }
  const dst = path.join(app.getPath('temp'), 'mai-push-icon.ico');
  try { if (!require('fs').existsSync(dst)) require('fs').copyFileSync(src, dst); } catch {}
  return dst;
}

function showHelperNotif(data, imgPath) {
  const icon = iconPath();
  const args = [data.title, data.body || '', imgPath || '', 'MaiPush.Desktop', data.url || '', icon];
  const child = execFile(HELPER_EXE, args);
  const cleanup = () => { if (imgPath) try { fs.unlinkSync(imgPath); } catch {} };
  child.on('exit', (code) => {
    console.log('[Helper] exit code:', code);
    cleanup();
    if (code === 1 && data.url) {
      navigateToUrl(data.url);
    }
  });
  child.on('error', (e) => {
    console.error('[Helper] spawn error:', e.message);
    cleanup();
    const n = new Notification({ title: data.title, body: data.body, icon });
    n.show();
    if (data.url) n.on('click', () => navigateToUrl(data.url));
  });
  setTimeout(cleanup, 60000);
}

function showNativeNotif(data) {
  console.log('[Notif] data:', JSON.stringify(data));
  const icon = iconPath();
  const imgUrl = data.image || '';
  if (!imgUrl) {
    const n = new Notification({ title: data.title, body: data.body, icon });
    n.show();
    if (data.url) n.on('click', () => navigateToUrl(data.url));
    return;
  }
  const tmpPath = path.join(app.getPath('temp'), 'mai-notif-' + Date.now() + '.png');
  const showWithImg = (buf) => {
    sharp(buf).resize(520, 260, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(tmpPath).then(() => {
      const stat = fs.statSync(tmpPath);
      if (stat.size > 200 * 1024) {
        console.error('[Notif] image too large after resize:', stat.size);
        try { fs.unlinkSync(tmpPath); } catch {}
        const n = new Notification({ title: data.title, body: data.body, icon });
        n.show();
        if (data.url) n.on('click', () => navigateToUrl(data.url));
        return;
      }
      showHelperNotif(data, tmpPath);
    }).catch((e) => {
      console.error('[Notif] sharp error:', e.message);
      try { fs.unlinkSync(tmpPath); } catch {}
      const n = new Notification({ title: data.title, body: data.body, icon });
      n.show();
      if (data.url) n.on('click', () => navigateToUrl(data.url));
    });
  };
  if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
    fetch(imgUrl, { signal: AbortSignal.timeout(15000) }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then((ab) => showWithImg(Buffer.from(ab))).catch((e) => {
      console.error('[Notif] fetch error:', e.message);
      const n = new Notification({ title: data.title, body: data.body, icon });
      n.show();
      if (data.url) n.on('click', () => navigateToUrl(data.url));
    });
  } else {
    fs.readFile(imgUrl, (err, buf) => {
      if (err) {
        const n = new Notification({ title: data.title, body: data.body, icon });
        n.show();
        if (data.url) n.on('click', () => navigateToUrl(data.url));
        return;
      }
      showWithImg(buf);
    });
  }
}

// --- Inject PushManager override for web app toggle ---
function injectPushOverride() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
    if (window.__electronPushOverrideInjected) return;
    window.__electronPushOverrideInjected = true;

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
        const randB64 = (n) => {
          var a = new Uint8Array(n);
          crypto.getRandomValues(a);
          return btoa(String.fromCharCode.apply(null, a));
        };
        var sub = {
          endpoint: 'https://electron-fcm/mai-push/' + Date.now() + Math.random().toString(36).slice(2),
          expirationTime: null,
          keys: { auth: randB64(16), p256dh: randB64(65) },
          toJSON: function() { return { endpoint: this.endpoint, keys: this.keys, expirationTime: null }; },
          unsubscribe: function() {
            if (window.electronAPI && window.electronAPI.setPushEnabled) window.electronAPI.setPushEnabled(false);
            return Promise.resolve(true);
          }
        };
        if (window.electronAPI && window.electronAPI.setPushEnabled) window.electronAPI.setPushEnabled(true);
        return sub;
      }
      async permissionState() { return 'granted'; }
    }

    window.PushManager = _ElectronPushManager;

    try {
      var desc = Object.getOwnPropertyDescriptor(ServiceWorkerRegistration.prototype, 'pushManager');
      if (desc && desc.configurable) {
        Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', {
          get: function() { return new _ElectronPushManager(); },
          configurable: true,
          enumerable: true,
        });
      } else {
        try {
          var scProto = Object.getPrototypeOf(navigator.serviceWorker);
          var readyDesc = Object.getOwnPropertyDescriptor(scProto, 'ready');
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
          }
        } catch(e2) { console.warn('[Electron] ready proxy failed', e2); }
      }
    } catch(e) {
      console.warn('[Electron] pushManager override failed', e);
    }

    var _origFetch = window.fetch;
    window.fetch = function(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (url.indexOf('/api/send-test') !== -1) {
        if (window.electronAPI && window.electronAPI.showNotification) {
          window.electronAPI.showNotification({ title: '\u30C6\u30B9\u30C8\u901A\u77E5', body: '\u901A\u77E5\u306F\u6B63\u5E38\u306B\u6A5F\u80FD\u3057\u3066\u3044\u307E\u3059', icon: './icon.webp', image: './testnotify.webp', url: '/test/' });
        }
        return Promise.resolve(new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      return _origFetch.call(this, input, init);
    };
    })();
  `).catch(function() {});
}

function createWindow() {
  const settings = loadSettings();
  const baseUrl = settings.url.replace(/\/+$/, '');

  // PC起動時(ログイン自動起動) または --hidden 付き起動なら、ウィンドウを出さずトレイ常駐で始める
  const startHidden = app.getLoginItemSettings().wasOpenedAtLogin || process.argv.includes('--hidden');

  mainWindow = new BrowserWindow({
    width: 960, height: 540,
    minWidth: 480, minHeight: 270,
    title: 'まいちゃん通知',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#1a1a2e',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    show: false, // ready-to-show で手動表示（自動起動時は表示しない）
  });

  // 通常起動のときだけウィンドウを表示。ログイン自動起動時はトレイに格納したまま。
  // （ページの読み込み自体は非表示でも進むので、通知の監視は裏で動き続ける）
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });

  mainWindow.webContents.userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.key === 'F5' || (input.key === 'r' && input.control)) && input.type === 'keyDown') {
      const s = loadSettings(); loadURLSafe(mainWindow.webContents, s.url);
      initializeLastId(s.url).then(() => startRealTime(s.url));
    }
  });

  mainWindow.webContents.on('did-start-navigation', () => {
    injectPushOverride();
  });

  mainWindow.setMenu(null);

  const hideScrollbars = () => {
    try {
      mainWindow.webContents.insertCSS(`
        ::-webkit-scrollbar { display: none !important; }
        * { scrollbar-width: none !important; }
      `);
    } catch {}
  };
  mainWindow.webContents.on('did-finish-load', hideScrollbars);

  // SW/キャッシュクリア→完了後ロード
  mainWindow.webContents.session.clearStorageData({
    storages: ['serviceworkers', 'cachestorage']
  }).then(() => {
    loadURLSafe(mainWindow.webContents, settings.url);
  }).catch(() => {
    loadURLSafe(mainWindow.webContents, settings.url);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    initializeLastId(baseUrl).then(() => startRealTime(baseUrl));
  });

  mainWindow.webContents.on('did-fail-load', (event, code, desc) => {
    const cur = mainWindow.webContents.getURL();
    if (!cur.includes('settings.html'))
      mainWindow.loadFile(path.join(__dirname, 'settings.html'));
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('/test') || url.includes('settings.html')) {
      // /test はアプリ内の新しいウィンドウで開く
      const win = new BrowserWindow({ width: 600, height: 800, parent: mainWindow, title: 'まいちゃん通知' });
      win.loadURL(url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(iconPath());
  tray = new Tray(trayIcon);
  tray.setToolTip('まいちゃん通知');
  updateTrayMenu();
  tray.on('click', () => { if (mainWindow) mainWindow.show(); });
}

function updateTrayMenu() {
  if (!tray) return;
  const autoStart = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: '表示する', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: '再読み込み', click: () => {
      if (mainWindow) {
        const s = loadSettings(); loadURLSafe(mainWindow.webContents, s.url);
        mainWindow.show(); mainWindow.focus();
        initializeLastId(s.url).then(() => startRealTime(s.url));
      }
    }},
    { type: 'separator' },
    { type: 'checkbox', label: '自動起動', checked: autoStart, click: () => {
      const next = !app.getLoginItemSettings().openAtLogin;
      app.setLoginItemSettings({ openAtLogin: next, args: ['--hidden'] });
      updateTrayMenu();
    }},
    { type: 'separator' },
    { label: 'DevTools', click: () => { if (mainWindow) { mainWindow.webContents.openDevTools(); mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: '終了', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-url', (event, url) => {
  if (!url || !url.startsWith('http')) throw new Error('Invalid URL');
  const s = loadSettings(); s.url = url; saveSettings(s);
  return { success: true };
});
ipcMain.handle('show-notification', (event, { title, body, icon, image, url }) => {
  if (!pushEnabled) return;
  const data = { title: title || 'Mai Push', body: body || '', icon: resolveUrl(icon || '', DEFAULT_URL), image: resolveUrl(image || '', DEFAULT_URL), url: url || '' };
  showNativeNotif(data);
});

ipcMain.handle('set-push-enabled', (event, enabled) => {
  pushEnabled = enabled;
  if (enabled && mainWindow && !mainWindow.isDestroyed()) {
    const s = loadSettings();
    const baseUrl = s.url.replace(/\/+$/, '');
    startRealTime(baseUrl);
  } else {
    stopRealTime();
  }
});

app.whenReady().then(() => {
  ensureAumid();
  setupPermissions();
  app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
  createWindow();
  createTray();
  app.on('activate', () => { if (mainWindow) mainWindow.show(); });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (sseTimer) clearInterval(sseTimer);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
