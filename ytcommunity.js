// ytcommunity.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');

let notifyConfig = null;
let defaultFilePath = path.join(__dirname, 'community.json');
let stateFilePath = path.join(__dirname, 'ytcommunity_state.json');
let autoSave = false;
let debugDirDefault = path.join(__dirname, 'ytcommunity_debug');

// ブラウザインスタンス再利用
let sharedBrowser = null;
let browserInitPromise = null;

const ICON_URL = './icon.webp';

// 二重実行抑止（同一プロセス内）
const inFlight = new Set();

// ============ Browser ============
async function getSharedBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  if (browserInitPromise) return await browserInitPromise;

  browserInitPromise = (async () => {
    try {
      console.log('[Puppeteer/YT] Initializing shared browser instance...');
      sharedBrowser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disk-cache-size=0',
          '--disable-application-cache',
          '--incognito'
        ]
      });

      sharedBrowser.on('disconnected', () => {
        console.warn('[Puppeteer/YT] Browser disconnected, will reinitialize on next use');
        sharedBrowser = null;
        browserInitPromise = null;
      });

      console.log('[Puppeteer/YT] Shared browser ready');
      return sharedBrowser;
    } catch (e) {
      console.error('[Puppeteer/YT] Failed to initialize browser:', e);
      browserInitPromise = null;
      throw e;
    }
  })();

  return await browserInitPromise;
}

async function closeSharedBrowser() {
  if (sharedBrowser) {
    try { await sharedBrowser.close(); } catch {}
  }
  sharedBrowser = null;
  browserInitPromise = null;
}

process.on('SIGINT', async () => {
  console.log('\n[Shutdown/YT] Closing browser...');
  await closeSharedBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Shutdown/YT] Closing browser...');
  await closeSharedBrowser();
  process.exit(0);
});

// ============ init ============
function init(config) {
  notifyConfig = config || {};
  if (config && config.filePath) defaultFilePath = path.resolve(config.filePath);
  if (config && config.statePath) stateFilePath = path.resolve(config.statePath);
  if (config && typeof config.autoSave !== 'undefined') autoSave = !!config.autoSave;
  if (config && config.debugDir) debugDirDefault = path.resolve(config.debugDir);

  // ディレクトリ作成
  try { fs.mkdirSync(path.dirname(defaultFilePath), { recursive: true }); } catch {}
  try { fs.mkdirSync(path.dirname(stateFilePath), { recursive: true }); } catch {}
  try { fs.mkdirSync(debugDirDefault, { recursive: true }); } catch {}
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pageSleep(page, ms) {
  if (page && typeof page.waitForTimeout === 'function') return page.waitForTimeout(ms);
  return sleep(ms);
}

function safeWriteJson(filePath, obj) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmpPath, filePath);
}

// ============ handle/url ============
function normalizeHandle(handle) {
  const h = (handle || '').trim();
  if (!h) return '';
  if (h.startsWith('@')) return h;
  return `@${h}`;
}

function buildUrlPosts(handle) {
  const h = normalizeHandle(handle);
  return `https://www.youtube.com/${h}/posts`; // 要件: /posts 固定
}

// ============ state (初回/既知ID) ============
function loadState() {
  try {
    if (!fs.existsSync(stateFilePath)) {
      return {
        initialized: false,   // 初回かどうか
        knownPostIds: {},     // { postId: firstSeenISO }
        updatedAt: null
      };
    }
    const raw = fs.readFileSync(stateFilePath, 'utf8');
    const data = JSON.parse(raw);

    return {
      initialized: !!data.initialized,
      knownPostIds: (data && typeof data.knownPostIds === 'object' && data.knownPostIds) ? data.knownPostIds : {},
      updatedAt: data.updatedAt || null
    };
  } catch (e) {
    console.warn('[YT] loadState failed, resetting:', e.message);
    return {
      initialized: false,
      knownPostIds: {},
      updatedAt: null
    };
  }
}

function saveState(state) {
  const out = {
    initialized: !!state.initialized,
    knownPostIds: state.knownPostIds || {},
    updatedAt: new Date().toISOString()
  };
  safeWriteJson(stateFilePath, out);
  return out;
}

// ============ community.json (任意保存) ============
function loadPosts(filePath = defaultFilePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return Object.values(data);
  } catch (e) {
    console.error('[YT] loadPosts error:', e.message);
    return [];
  }
}

function savePosts(posts, filePath = defaultFilePath) {
  try {
    if (!Array.isArray(posts)) throw new Error('posts must be an array');
    const existing = loadPosts(filePath);
    const map = new Map();
    existing.forEach(p => { if (p && p.postId) map.set(p.postId, p); });

    let addedCount = 0;
    for (const p of posts) {
      if (!p || !p.postId) continue;

      if (!map.has(p.postId)) {
        map.set(p.postId, {
          postId: p.postId,
          postUrl: p.postUrl || `https://www.youtube.com/post/${p.postId}`,
          author: p.author || 'Unknown',
          content: p.content || '',
          publishedTime: p.publishedTime || '',
          scrapedAt: new Date().toISOString(),
        });
        addedCount++;
      } else {
        const ex = map.get(p.postId);
        if (!ex.postUrl && p.postUrl) ex.postUrl = p.postUrl;
        if (!ex.content && p.content) ex.content = p.content;
        if (!ex.publishedTime && p.publishedTime) ex.publishedTime = p.publishedTime;
        ex.scrapedAt = new Date().toISOString();
      }
    }

    const merged = Array.from(map.values()).sort((a, b) => a.postId.localeCompare(b.postId));
    safeWriteJson(filePath, merged);
    return { saved: true, addedCount, totalCount: merged.length };
  } catch (e) {
    console.error('[YT] savePosts error:', e.message);
    return { saved: false, addedCount: 0, totalCount: 0, error: e.message };
  }
}

// ============ Parsing: ytInitialData ============
function extractYtInitialDataFromHtml(html) {
  const patterns = [
    /var\s+ytInitialData\s*=\s*(\{[\s\S]*?\});/m,
    /window\["ytInitialData"\]\s*=\s*(\{[\s\S]*?\});/m,
    /ytInitialData"\s*:\s*(\{[\s\S]*?\})\s*,\s*"ytInitialPlayerResponse"/m
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;

    const jsonText = m[1];
    try {
      return JSON.parse(jsonText);
    } catch {
      // 次へ
    }
  }
  return null;
}

async function extractPostsFromDom(page) {
  try {
    // 可能なら展開してから抜く（ここで呼ぶのが一番安全）
    await expandAllCommunityPosts(page, { maxRounds: 3 });

    const items = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      const renderers = Array.from(document.querySelectorAll('ytd-backstage-post-renderer'));
      for (const r of renderers) {
        // postId: /post/XXXX のリンクから拾う（複数あるので最初の1個で良い）
        let postId = null;
        const a = r.querySelector('a[href^="/post/"]');
        if (a) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/^\/post\/([^/?#]+)/);
          if (m && m[1]) postId = m[1];
        }
        if (!postId) continue;
        if (seen.has(postId)) continue;
        seen.add(postId);

        // author
        const author =
          (r.querySelector('#author-text span')?.textContent || '').trim() ||
          (r.querySelector('#author-text')?.textContent || '').trim() ||
          'Unknown';

        // published time（例: “7日前”）
        const publishedTime =
          (r.querySelector('#published-time-text')?.textContent || '').trim() ||
          '';

        // content-text（ここが “？？？？？？？” の実体）
        // yt-formatted-string#content-text の textContent を使うのが安定
        const content =
          (r.querySelector('yt-formatted-string#content-text')?.textContent || '').trim() ||
          (r.querySelector('#content-text')?.textContent || '').trim() ||
          '';

        results.push({
          postId,
          postUrl: `https://www.youtube.com/post/${postId}`,
          author,
          content,
          publishedTime
        });
      }

      return results;
    });

    return Array.isArray(items) ? items : [];
  } catch (e) {
    console.warn('[YT] DOM extraction failed:', e.message);
    return [];
  }
}

async function parseCommunityFromHtml(html) {
  const result = {
    posts: [],
    debug: {
      source: 'ytInitialData',
      extracted: false,
      errors: []
    }
  };

  const data = extractYtInitialDataFromHtml(html);
  if (!data) {
    result.debug.extracted = false;
    result.debug.errors.push('ytInitialData not found or JSON parse failed');
    return result;
  }

  result.posts = extractPostsFromData(data);
  result.debug.extracted = true;
  return result;
}

// ============ DOM fallback ============
async function extractPostsFromDom(page) {
  try {
    const postIds = await page.evaluate(() => {
      const ids = new Set();
      document.querySelectorAll('a[href^="/post/"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const m = href.match(/^\/post\/([^/?#]+)/);
        if (m && m[1]) ids.add(m[1]);
      });
      return Array.from(ids);
    });

    return postIds.map(id => ({
      postId: id,
      postUrl: `https://www.youtube.com/post/${id}`,
      author: 'Unknown',
      content: '',
      publishedTime: ''
    }));
  } catch (e) {
    console.warn('[YT] DOM extraction failed:', e.message);
    return [];
  }
}

// ============ block reason (デバッグ用) ============
function detectBlockReason(text) {
  const t = (text || '').toLowerCase();
  if (t.includes("this page isn't available") || t.includes('このページはご利用いただけません')) return 'unavailable';
  if (t.includes('before you continue') || t.includes('consent') || t.includes('同意')) return 'consent';
  if (t.includes('unusual traffic') || t.includes('robot') || t.includes('captcha')) return 'bot_or_captcha';
  if (t.includes('sign in') || t.includes('ログイン')) return 'login_required';
  return null;
}

// ============ fetch (取得のみ) ============
async function fetchPostsFromHandle(handle, opts = {}) {
  const {
    debugDir = debugDirDefault,
    saveRawHtml = false,      // 本番は基本 false
    screenshot = false,       // 本番は基本 false
    maxScroll = 10,
    waitMs = 1200
  } = opts;

  let page;
  const now = Date.now();
  const outDir = path.resolve(debugDir);
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}

  const report = {
    handle,
    normalizedHandle: normalizeHandle(handle),
    fetchedAt: new Date(now).toISOString(),
    url: buildUrlPosts(handle),
    finalUrl: null,
    httpStatus: null,
    pageTitle: null,
    blockReason: null,
    counts: { ytInitialData: 0, dom: 0, merged: 0 },
    debug: { htmlPath: null, screenshotPath: null, parsed: null, notes: [] }
  };

  try {
    const browser = await getSharedBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });

    // 再現性
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.7,en;q=0.6' });
    } catch {}

    const url = report.url;
    console.log(`[YT] Fetching: ${url}`);

    let res = null;
    try {
      res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await pageSleep(page, waitMs);
    } catch (e) {
      report.debug.notes.push(`goto failed: ${e.message}`);
      return { posts: [], report };
    }

    report.finalUrl = page.url();
    report.httpStatus = res ? res.status() : null;
    try { report.pageTitle = await page.title(); } catch {}

    // ブロック判定
    try {
      const bodyText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 4000));
      const reason = detectBlockReason(bodyText);
      if (reason) report.blockReason = reason;
    } catch {}

    // スクロール
    let previousHeight = 0;
    for (let i = 0; i < maxScroll; i++) {
      const height = await page.evaluate(() => document.body.scrollHeight);
      if (height === previousHeight) break;
      previousHeight = height;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await pageSleep(page, waitMs);
    }

    const html = await page.content();

    // デバッグ保存（任意）
    if (saveRawHtml) {
      const htmlPath = path.join(outDir, `${handle.replace('@', '')}_${now}.html`);
      fs.writeFileSync(htmlPath, html, 'utf8');
      report.debug.htmlPath = htmlPath;
    }
    if (screenshot) {
      const pngPath = path.join(outDir, `${handle.replace('@', '')}_${now}.png`);
      try {
        await page.screenshot({ path: pngPath, fullPage: true });
        report.debug.screenshotPath = pngPath;
      } catch (e) {
        report.debug.notes.push(`screenshot failed: ${e.message}`);
      }
    }

    // ytInitialData
    const parsed = await parseCommunityFromHtml(html);
    report.debug.parsed = parsed.debug;

    // DOM fallback
    const domPosts = await extractPostsFromDom(page);

    // merge
    const map = new Map();
    for (const p of parsed.posts || []) map.set(p.postId, p);
    for (const p of domPosts || []) {
      if (!p || !p.postId) continue;
      if (!map.has(p.postId)) map.set(p.postId, p);
    }
    const merged = Array.from(map.values());

    report.counts.ytInitialData = (parsed.posts || []).length;
    report.counts.dom = domPosts.length;
    report.counts.merged = merged.length;

    return { posts: merged, report };

  } finally {
    if (page) {
      try { await page.close(); } catch (e) {
        console.warn('[YT] Failed to close page:', e.message);
      }
    }
  }
}

// ============ 本番: 差分検出 + 初回抑止 + 通知 ============
async function pollAndNotify(handle, opts = {}) {
  const key = normalizeHandle(handle);
  if (inFlight.has(key)) {
    console.log(`[YT] pollAndNotify: already running for ${key}, skip`);
    return { ok: true, skipped: true, reason: 'inFlight' };
  }
  inFlight.add(key);

  try {
    const state = loadState();

    const { posts, report } = await fetchPostsFromHandle(handle, opts);

    // 取得失敗/ブロック時は状態は更新しない（原因調査優先）
    if (!posts || posts.length === 0) {
      const rp = path.join(debugDirDefault, `${key.replace('@', '')}_${Date.now()}.report.json`);
      safeWriteJson(rp, report);
      return { ok: false, error: 'no_posts', reportPath: rp, report };
    }
    if (report.blockReason) {
      const rp = path.join(debugDirDefault, `${key.replace('@', '')}_${Date.now()}.report.json`);
      safeWriteJson(rp, report);
      return { ok: false, error: `blocked:${report.blockReason}`, reportPath: rp, report };
    }

    // 新規判定
    const known = state.knownPostIds || {};
    const nowIso = new Date().toISOString();

    const newPosts = [];
    for (const p of posts) {
      if (!p || !p.postId) continue;
      if (!known[p.postId]) newPosts.push(p);
    }

    // 初回は「通知しない」だけ。既知IDを全部登録して initialized=true にする
    if (!state.initialized) {
      for (const p of posts) {
        if (p && p.postId && !known[p.postId]) known[p.postId] = nowIso;
      }
      state.knownPostIds = known;
      state.initialized = true;
      saveState(state);

      // データ保存（任意）
      if (autoSave) savePosts(posts);

      console.log(`[YT] First run for ${key}: registered ${Object.keys(known).length} posts, NO notify`);
      return { ok: true, firstRun: true, notified: 0, newCount: newPosts.length, report };
    }

    // 2回目以降：新規だけ通知 + knownへ追加
    let notified = 0;
    const notifyFn = (notifyConfig && typeof notifyConfig.notifyFn === 'function') ? notifyConfig.notifyFn : null;

    // 通知前にknown更新して落ちたら事故るので、成功した分だけ反映する方針
    // ただし「二重通知より取りこぼしが嫌」なら逆（先にknown）でも良い
    for (const p of newPosts) {
      if (!p || !p.postId) continue;

      if (notifyFn) {
        try {
          await notifyFn({
            type: 'ytcommunity',
            settingKey: 'ytcommunity',
            data: {
              title: '【コミュニティ投稿】',
              body: (p.content || '').slice(0, 300),
              url: p.postUrl,
              icon: ICON_URL
            }
          });
          notified++;
        } catch (e) {
          console.warn('[YT] notify failed:', e.message);
          // 失敗したものはknownに入れない（次回再通知になる）
          continue;
        }
      }

      known[p.postId] = nowIso;
    }

    // state保存
    state.knownPostIds = known;
    saveState(state);

    // データ保存（任意）
    if (autoSave) savePosts(posts);

    console.log(`[YT] ${key}: fetched=${posts.length} new=${newPosts.length} notified=${notified}`);
    return { ok: true, firstRun: false, fetched: posts.length, newCount: newPosts.length, notified, report };

  } finally {
    inFlight.delete(key);
  }
}

// 互換: URLだけ拾う（必要なら残す）
async function startPolling(handle) {
  const { posts } = await fetchPostsFromHandle(handle, { saveRawHtml: false, screenshot: false });
  return (posts || []).map(p => p.postUrl).filter(Boolean);
}

module.exports = {
  init,
  // 取得系
  fetchPostsFromHandle, // 通知しない（取得だけ）
  startPolling,
  // 本番用
  pollAndNotify,
  // 永続化
  loadPosts,
  savePosts,
};
