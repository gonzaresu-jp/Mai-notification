const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, Notification, session, net, screen, dialog, WebContentsView } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const http = require('http');
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
// アプリ更新チェック用フィード（MAI_UPDATE_FEED_URL で差し替え可＝検証用）
const UPDATE_FEED_URL = process.env.MAI_UPDATE_FEED_URL || 'https://mai.honna-yuzuki.com/dl/desktop.json';
const UPDATE_CHECK_DELAY_MS = 30 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let lastNotifId = 0;
let sseTimer = null;
let pushEnabled = false;
let pendingAuthUrl = null;

// ── タブ管理 ──
const TAB_STRIP_HEIGHT = 40;
let tabStripView = null;
let tabs = []; // { id, view, title, favicon }
let activeTabId = null;
let nextTabId = 1;
let realtimeStarted = false;

function getBaseUrl() {
  return (loadSettings().url || DEFAULT_URL).replace(/\/+$/, '');
}

function activeTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

function tabsState() {
  return tabs.map(x => {
    let url = '';
    try { url = x.view.webContents.getURL(); } catch (e) {}
    let title = x.title;
    if (!title) {
      try {
        const u = new URL(url);
        title = (u.hostname || '') + (u.pathname && u.pathname !== '/' ? u.pathname : '');
      } catch (e) { title = url; }
    }
    return { id: x.id, title: title || '新しいタブ', favicon: x.favicon || '', url, active: x.id === activeTabId };
  });
}

function notifyTabs() {
  try {
    if (tabStripView && !tabStripView.webContents.isDestroyed())
      tabStripView.webContents.send('tabs:update', tabsState());
  } catch (e) {}
}

function layoutViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const { width, height } = mainWindow.getContentBounds();
    if (tabStripView && !tabStripView.webContents.isDestroyed())
      tabStripView.setBounds({ x: 0, y: 0, width, height: TAB_STRIP_HEIGHT });
    const t = activeTab();
    if (t && !t.view.webContents.isDestroyed())
      t.view.setBounds({ x: 0, y: TAB_STRIP_HEIGHT, width, height: Math.max(0, height - TAB_STRIP_HEIGHT) });
  } catch (e) {}
}

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
// 再接続: 指数バックオフ。429 は Retry-After を優先。
// 無通信タイムアウト: ハートビート(25秒)が来ない接続は 60秒で中断して張り直す。
const SSE_RETRY_BASE_MS = 3000;
const SSE_RETRY_MAX_MS = 60000;
const SSE_IDLE_TIMEOUT_MS = 60000;
let sseRetryAttempt = 0;
let sseReconnectTimer = null;
let sseGeneration = 0;

function scheduleSseReconnect(baseUrl, delayMs) {
  if (isQuitting) return;
  if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
  const delay = delayMs != null
    ? delayMs
    : Math.min(SSE_RETRY_BASE_MS * Math.pow(2, sseRetryAttempt), SSE_RETRY_MAX_MS);
  sseRetryAttempt++;
  sseReconnectTimer = setTimeout(() => {
    sseReconnectTimer = null;
    connectSSE(baseUrl);
  }, delay);
}

async function connectSSE(baseUrl) {
  const gen = sseGeneration;
  const url = baseUrl.replace(/\/+$/, '') + SSE_PATH;
  const ac = new AbortController();
  let resp;
  let retryAfterMs = null;
  try {
    resp = await fetch(url, {
      headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
      signal: ac.signal,
    });
    if (!resp.ok) {
      if (resp.status === 429) {
        const ra = parseInt(resp.headers.get('Retry-After'), 10);
        if (ra > 0) retryAfterMs = ra * 1000;
      }
      try { await resp.text(); } catch (e) {}
      throw new Error(`HTTP ${resp.status}`);
    }
  } catch (e) {
    if (isQuitting || gen !== sseGeneration) return;
    scheduleSseReconnect(baseUrl, retryAfterMs);
    return;
  }

  sseRetryAttempt = 0;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', dataLine = '';
  let idleTimer = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      try { ac.abort(); } catch (e) {}
    }, SSE_IDLE_TIMEOUT_MS);
  };
  resetIdle();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
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
    if (idleTimer) clearTimeout(idleTimer);
    if (isQuitting || gen !== sseGeneration) return;
    // 接続済みだったためバックオフは頭出し（AbortError=idleタイムアウト含む）
    scheduleSseReconnect(baseUrl, SSE_RETRY_BASE_MS);
    return;
  }
  if (idleTimer) clearTimeout(idleTimer);
  if (!isQuitting && gen === sseGeneration) scheduleSseReconnect(baseUrl, SSE_RETRY_BASE_MS);
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
  if (sseReconnectTimer) { clearTimeout(sseReconnectTimer); sseReconnectTimer = null; }
  sseGeneration++;
  sseRetryAttempt = 0;
  sseTimer = setInterval(() => checkNewNotifications(baseUrl), FALLBACK_INTERVAL);
  connectSSE(baseUrl);
}

function stopRealTime() {
  if (sseTimer) { clearInterval(sseTimer); sseTimer = null; }
  if (sseReconnectTimer) { clearTimeout(sseReconnectTimer); sseReconnectTimer = null; }
  sseGeneration++;
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
      const t = activeTab();
      if (t && !t.view.webContents.isDestroyed()) loadURLSafe(t.view.webContents, baseUrl + url);
      else newTab(baseUrl + url);
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
function injectPushOverride(wc) {
  if (!wc || wc.isDestroyed()) return;
  wc.executeJavaScript(`
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
  const startHidden = app.getLoginItemSettings().wasOpenedAtLogin
    || process.argv.includes('--hidden')
    || process.env.MAI_START_HIDDEN === '1';
  console.log('[mai-push] startHidden:', startHidden,
    '| argv:', process.argv.slice(),
    '| wasOpenedAtLogin:', app.getLoginItemSettings().wasOpenedAtLogin,
    '| env.MAI_START_HIDDEN:', process.env.MAI_START_HIDDEN);

  mainWindow = new BrowserWindow({
    width: 960, height: 540,
    minWidth: 480, minHeight: 270,
    title: 'まいちゃん通知',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#1a1a2e',
    autoHideMenuBar: true,
    show: false, // ready-to-show で手動表示（自動起動時は表示しない）
  });

  // 通常起動のときだけウィンドウを表示。ログイン自動起動時はトレイに格納したまま。
  // （ページの読み込み自体は非表示でも進むので、通知の監視は裏で動き続ける）
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });

  mainWindow.setMenu(null);

  // セッション共通設定（全タブで共有・一度だけ）
  const ses = session.defaultSession;
  // Client Hints ヘッダーを設定（Google が Electron を検知しないように）
  // Google のログイン画面だけが対象。以前は全リクエストをメインプロセス経由で書き換えていて、
  // ページ読み込みのたびに数十本のリクエストが IPC 往復を挟んでいた。
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*.google.com/*', '*://*.googleusercontent.com/*', '*://*.gstatic.com/*'] }, (details, callback) => {
    details.requestHeaders['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
    details.requestHeaders['sec-ch-ua-mobile'] = '?0';
    details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';
    callback({ requestHeaders: details.requestHeaders });
  });

  // タブストリップ（上部40px・ローカルHTML）
  tabStripView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'tabs-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });
  mainWindow.contentView.addChildView(tabStripView);
  tabStripView.webContents.loadURL(pathToFileURL(path.join(__dirname, 'tabs.html')).href);
  tabStripView.webContents.on('did-finish-load', () => notifyTabs());

  // SW/キャッシュのクリアはアプリを更新した初回だけ行う。
  // 以前は起動のたびに消していたため、毎回 Service Worker の再インストールと
  // 全ファイルの再ダウンロードが発生し、起動直後の表示が遅くなっていた。
  const openHome = () => {
    if (tabs.length === 0) newTab(settings.url);
    startRealtimeOnce(baseUrl);
  };
  const appVersion = app.getVersion();
  if (settings.cacheClearedFor !== appVersion) {
    ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
      .catch(() => {})
      .then(() => {
        try { const s = loadSettings(); s.cacheClearedFor = appVersion; saveSettings(s); } catch (e) {}
        openHome();
      });
  } else {
    openHome();
  }

  mainWindow.on('resize', layoutViews);

  mainWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; tabs = []; activeTabId = null; tabStripView = null; });
  layoutViews();
}

// 通知監視は全タブで共有・最初のタブ確定時に一度だけ開始
function startRealtimeOnce(baseUrl) {
  if (realtimeStarted) return;
  realtimeStarted = true;
  initializeLastId(baseUrl).then(() => startRealTime(baseUrl));
}

// ── タブ操作 ──
function newTab(url, opts = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });
  const tab = { id: nextTabId++, view, title: '', favicon: '' };
  setupTabContents(tab);
  tabs.push(tab);
  loadURLSafe(view.webContents, url || getBaseUrl());
  if (opts.activate === false) notifyTabs();
  else activateTab(tab.id);
  console.log(`[tabs] new #${tab.id}: ${url}`);
  return tab.id;
}

function activateTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab || !mainWindow || mainWindow.isDestroyed()) return;
  if (tab.view.webContents.isDestroyed()) return;
  const cur = activeTab();
  if (cur && cur.id !== id) {
    try { mainWindow.contentView.removeChildView(cur.view); } catch (e) {}
  }
  activeTabId = id;
  try {
    if (!mainWindow.contentView.children.includes(tab.view))
      mainWindow.contentView.addChildView(tab.view);
  } catch (e) {}
  layoutViews();
  notifyTabs();
  console.log(`[tabs] activate #${id}`);
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const [tab] = tabs.splice(idx, 1);
  if (activeTabId === id) {
    try { mainWindow.contentView.removeChildView(tab.view); } catch (e) {}
    activeTabId = null;
  }
  try { tab.view.webContents.destroy(); } catch (e) {}
  console.log(`[tabs] closed #${id}`);
  if (tabs.length === 0) {
    newTab(getBaseUrl());
  } else if (activeTabId === null) {
    activateTab(tabs[Math.max(0, idx - 1)].id);
  } else {
    notifyTabs();
  }
}

function cycleTab(dir) {
  if (tabs.length < 2 || activeTabId === null) return;
  const idx = tabs.findIndex(t => t.id === activeTabId);
  const next = tabs[(idx + dir + tabs.length) % tabs.length];
  activateTab(next.id);
}

function setupTabContents(tab) {
  const wc = tab.view.webContents;
  const baseUrl = getBaseUrl();

  wc.userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    // F5 / Ctrl+R: 現在のページを再読み込み（ホームへ戻さない）
    if ((input.key === 'F5' || (input.key === 'r' && input.control)) && !input.alt && !input.meta) {
      event.preventDefault();
      try { wc.reload(); } catch (e) {}
      return;
    }
    if (input.control && !input.alt && !input.meta) {
      const k = (input.key || '').toLowerCase();
      if (k === 't' && !input.shift) { event.preventDefault(); newTab(getBaseUrl()); }
      else if (k === 'w' && !input.shift) { event.preventDefault(); closeTab(tab.id); }
      else if (input.key === 'Tab') { event.preventDefault(); cycleTab(input.shift ? -1 : 1); }
    }
  });

  // Google/Discord ログインページへのナビゲーションをシステムブラウザに転送
  wc.on('will-navigate', (event, url) => {
    if (url.includes('/auth/google') || url.includes('/auth/discord')) {
      console.log('[mai-push] Auth navigation intercepted:', url);
      event.preventDefault();
      ensureAuthServer().then(port => {
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.set('returnTo', `http://127.0.0.1:${port}/callback`);
        console.log('[mai-push] Opening auth URL via will-navigate:', parsedUrl.toString());
        shell.openExternal(parsedUrl.toString());
      });
    }
  });

  wc.on('did-start-navigation', () => {
    injectPushOverride(wc);
  });

  const hideScrollbars = () => {
    try {
      wc.insertCSS(`
        ::-webkit-scrollbar { display: none !important; }
        * { scrollbar-width: none !important; }
      `);
    } catch (e) {}
  };
  wc.on('did-finish-load', hideScrollbars);

  wc.on('did-finish-load', () => {
    if (pendingAuthUrl) {
      const token = pendingAuthUrl;
      pendingAuthUrl = null;
      handleAuthCallback(token);
      return;
    }
    notifyTabs();
  });

  wc.on('did-fail-load', (event, code, desc) => {
    let cur = '';
    try { cur = wc.getURL(); } catch (e) {}
    if (!cur.includes('settings.html')) {
      try { wc.loadURL(pathToFileURL(path.join(__dirname, 'settings.html')).href); } catch (e) {}
    }
  });

  // 同一サイトのリンクは新しいタブで開く（ブラウザのCtrl+クリック/中クリック対応）
  wc.setWindowOpenHandler(({ url, disposition }) => {
    try {
      const target = new URL(url);
      const base = new URL(getBaseUrl());
      if (target.origin === base.origin && !url.includes('/auth/google') && !url.includes('/auth/discord')) {
        newTab(url, { activate: disposition !== 'background-tab' });
      } else if (url.includes('/auth/google') || url.includes('/auth/discord')) {
        ensureAuthServer().then(port => {
          const parsedUrl = new URL(url);
          parsedUrl.searchParams.set('returnTo', `http://127.0.0.1:${port}/callback`);
          shell.openExternal(parsedUrl.toString());
        });
      } else {
        shell.openExternal(url);
      }
    } catch (e) {
      try { shell.openExternal(url); } catch (e2) {}
    }
    return { action: 'deny' };
  });

  wc.on('page-title-updated', (e, title) => {
    tab.title = title || '';
    notifyTabs();
  });
  wc.on('page-favicon-updated', (e, favicons) => {
    if (favicons && favicons[0]) { tab.favicon = favicons[0]; notifyTabs(); }
  });
}

ipcMain.handle('tabs:get', () => tabsState());
ipcMain.handle('tab-new', (e, url) => newTab(url || getBaseUrl()));
ipcMain.handle('tab-close', (e, id) => closeTab(Number(id)));
ipcMain.handle('tab-activate', (e, id) => activateTab(Number(id)));
ipcMain.handle('tab-reload', (e, id) => {
  const tab = id != null ? tabs.find(t => t.id === Number(id)) : activeTab();
  if (tab && !tab.view.webContents.isDestroyed()) {
    try { tab.view.webContents.reload(); } catch (err) {}
  }
});

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
        // 現在のタブをそのまま再読み込み（ホームへ戻さない）
        const t = activeTab();
        if (t && !t.view.webContents.isDestroyed()) {
          try { t.view.webContents.reload(); } catch (e) {}
        }
        mainWindow.show(); mainWindow.focus();
      }
    }},
    { label: '新しいタブ', click: () => {
      if (mainWindow) { newTab(getBaseUrl()); mainWindow.show(); mainWindow.focus(); }
    }},
    { type: 'separator' },
    { type: 'checkbox', label: '自動起動', checked: autoStart, click: () => {
      const next = !app.getLoginItemSettings().openAtLogin;
      app.setLoginItemSettings({ openAtLogin: next, args: ['--hidden'] });
      updateTrayMenu();
    }},
    { label: '更新を確認', click: () => { checkForUpdates({ manual: true }); } },
    { type: 'separator' },
    { label: 'DevTools', click: () => { const t = activeTab(); if (mainWindow && t && !t.view.webContents.isDestroyed()) { t.view.webContents.openDevTools(); mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: '終了', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-url', (event, url) => {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Invalid URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('HTTPS URL required');
  const s = loadSettings(); s.url = parsed.origin; saveSettings(s);
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

// デスクトップアプリ用 Google/Discord ログイン：システムブラウザで開く
ipcMain.handle('open-login', async () => {
  console.log('[mai-push] open-login IPC called');
  if (!mainWindow || mainWindow.isDestroyed()) { console.error('[mai-push] open-login: no mainWindow'); return; }
  const settings = loadSettings();
  const baseUrl = settings.url.replace(/\/+$/, '');
  const clientId = '';
  try {
    const port = await ensureAuthServer();
    const returnTo = encodeURIComponent(`http://127.0.0.1:${port}/callback`);
    const loginUrl = `${baseUrl}/auth/google?client_id=${encodeURIComponent(clientId)}&returnTo=${returnTo}`;
    console.log('[mai-push] Opening login in system browser:', loginUrl);
    const result = await shell.openExternal(loginUrl);
    console.log('[mai-push] shell.openExternal result:', result);
  } catch (e) {
    console.error('[mai-push] Failed to start auth server or open browser:', e);
  }
});

app.whenReady().then(() => {
  ensureAumid();
  setupPermissions();
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe'),
    args: ['--hidden'],
    env: { MAI_START_HIDDEN: '1' },
  });
  createWindow();
  createTray();
  scheduleUpdateChecks();
  app.on('activate', () => { if (mainWindow) mainWindow.show(); });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (sseTimer) clearInterval(sseTimer);
  if (authHttpServer) { try { authHttpServer.close(); } catch {} }
});

// ── ローカルHTTPサーバー：Google/Discord ログインコールバック受信用 ──
let authHttpServer = null;
let authHttpPort = 0;

function ensureAuthServer() {
  if (authHttpServer) return Promise.resolve(authHttpPort);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        if (code) {
          const baseUrl = (loadSettings().url || DEFAULT_URL).replace(/\/+$/, '');
          fetch(`${baseUrl}/auth/token-exchange`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
          }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then(({ token }) => { if (token) handleAuthCallback(token); })
            .catch(e => console.error('[mai-push] Auth code exchange failed:', e.message));
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#1a1a2e;color:#fff">'
            + '<h2>ログイン完了</h2><p>このウィンドウを閉じて、アプリに戻ってください。</p>'
            + '<script>setTimeout(function(){window.close()},2000)</script></body></html>');
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body><h2>エラー：トークンがありません</h2></body></html>');
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, '127.0.0.1', () => {
      authHttpPort = server.address().port;
      authHttpServer = server;
      console.log('[mai-push] Auth callback server on port', authHttpPort);
      resolve(authHttpPort);
    });
    server.on('error', reject);
  });
}

function handleAuthCallback(token) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.error('[mai-push] mainWindow not ready, storing pending token');
    pendingAuthUrl = token;
    return;
  }
  const settings = loadSettings();
  const baseUrl = settings.url.replace(/\/+$/, '');
  const hostname = new URL(baseUrl).hostname;
  console.log('[mai-push] Setting cookie for domain:', hostname);
  session.defaultSession.cookies.set({
    url: baseUrl + '/',
    name: 'session',
    value: token,
    domain: hostname,
    path: '/',
    httpOnly: true,
    secure: baseUrl.startsWith('https'),
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  }).then(() => {
    console.log('[mai-push] Auth cookie set, reloading page');
    mainWindow.show();
    mainWindow.focus();
    const t = activeTab();
    if (t && !t.view.webContents.isDestroyed()) loadURLSafe(t.view.webContents, baseUrl);
    else newTab(baseUrl);
  }).catch((e) => {
    console.error('[mai-push] Failed to set auth cookie:', e);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── アプリ更新チェック：起動時(遅延)＋6時間毎＋トレイ手動 ──
function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.');
  const pb = String(b || '').replace(/^v/i, '').split('.');
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const na = parseInt(pa[i], 10), nb = parseInt(pb[i], 10);
    const va = Number.isNaN(na) ? 0 : na, vb = Number.isNaN(nb) ? 0 : nb;
    if (va !== vb) return va < vb ? -1 : 1;
  }
  return 0;
}

async function fetchUpdateFeed() {
  const url = UPDATE_FEED_URL + (UPDATE_FEED_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const info = await resp.json();
  if (!info || typeof info.version !== 'string' || typeof info.url !== 'string')
    throw new Error('invalid feed');
  return info;
}

async function checkForUpdates(opts = {}) {
  const manual = !!opts.manual;
  const current = app.getVersion();
  try {
    const info = await fetchUpdateFeed();
    console.log(`[update] current=${current} latest=${info.version}`);
    if (compareVersions(current, info.version) >= 0) {
      if (manual && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'まいちゃん通知',
          message: `お使いのバージョン（v${current}）は最新です。`,
        });
      }
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const notes = info.notes ? `\n\n${info.notes}` : '';
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'まいちゃん通知 - アップデート',
      message: `新しいバージョン v${info.version} が利用可能です（現在 v${current}）。${notes}\n\nダウンロードしますか？`,
      buttons: ['ダウンロード', '後で'],
      defaultId: 0, cancelId: 1,
    });
    if (response === 0) {
      console.log('[update] Opening download URL:', info.url);
      await shell.openExternal(info.url);
    }
  } catch (e) {
    console.error('[update] check failed:', e.message);
    if (manual && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'まいちゃん通知',
        message: `更新の確認に失敗しました。\n(${e.message})`,
      });
    }
  }
}

function scheduleUpdateChecks() {
  if (!app.isPackaged) return; // 開発実行時は自動チェックしない
  setTimeout(() => { if (!isQuitting) checkForUpdates(); }, UPDATE_CHECK_DELAY_MS);
  setInterval(() => { if (!isQuitting) checkForUpdates(); }, UPDATE_CHECK_INTERVAL_MS);
}
