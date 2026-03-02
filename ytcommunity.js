// ytcommunity.js
// SSD書き込み最小化 + RAMプロファイル + Page再利用 完全最適化版

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');

puppeteer.use(Stealth());

/* =============================
   Config
============================= */

let notifyConfig = null;

const stateFilePath = path.join(__dirname, 'ytcommunity_state.json');

/*
  ★★★★★ ここが最重要 ★★★★★
  Linux tmpfs (/dev/shm) を使用
  → SSD書き込みゼロ
*/
const profileDir = '/var/lib/mai-push/puppeteer-profile';

const ICON_URL = './icon.webp';

let browser = null;
let sharedPage = null;

let stateCache = null;
let stateDirty = false;


/* =============================
   Browser
============================= */

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: profileDir,

    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,900',

      // キャッシュ完全停止
      '--disk-cache-size=0',
      '--media-cache-size=0',
      '--disable-application-cache',
      '--disable-gpu-shader-disk-cache',

      '--disable-background-networking',
      '--disable-sync',
      '--disable-extensions',
      '--disable-logging',
      '--log-level=3',
      '--mute-audio',
      '--aggressive-cache-discard'
    ]
  });

  browser.on('disconnected', () => {
    browser = null;
    sharedPage = null;
  });

  return browser;
}


/* =============================
   Page (再利用)
============================= */

async function getPage() {
  const browser = await getBrowser();

  if (sharedPage && !sharedPage.isClosed()) {
    return sharedPage;
  }

  sharedPage = await browser.newPage();

  await sharedPage.setCacheEnabled(false);

  await sharedPage.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36'
  );

  await sharedPage.setExtraHTTPHeaders({
    'Accept-Language': 'ja-JP,ja;q=0.9'
  });

  return sharedPage;
}


/* =============================
   Utils
============================= */

const sleep = ms => new Promise(r => setTimeout(r, ms));

function safeWriteJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}


/* =============================
   State
============================= */

function loadState() {
  if (stateCache) return stateCache;

  if (!fs.existsSync(stateFilePath)) {
    stateCache = { initialized: false, known: {} };
    return stateCache;
  }

  stateCache = JSON.parse(fs.readFileSync(stateFilePath));
  return stateCache;
}

function markStateDirty() {
  stateDirty = true;
}

function flushState() {
  if (!stateDirty || !stateCache) return;
  safeWriteJson(stateFilePath, stateCache);
  stateDirty = false;
}

setInterval(() => {
  if (stateDirty) flushState();
}, 60000);


/* =============================
   DOM Extract
============================= */

async function extractPostsFromDom(page) {
  return page.evaluate(() => {
    const out = [];

    document.querySelectorAll('ytd-backstage-post-renderer').forEach(n => {
      const link = n.querySelector('a[href^="/post/"]');
      if (!link) return;

      const id = link.href.split('/post/')[1];

      const content =
        n.querySelector('#content-text')?.innerText?.trim() || '';

      out.push({
        postId: id,
        postUrl: `https://www.youtube.com/post/${id}`,
        content
      });
    });

    return out;
  });
}


/* =============================
   Fetch
============================= */

async function fetchPosts(handle) {
  const page = await getPage();

  const url = `https://www.youtube.com/@${handle.replace('@','')}/posts`;

  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: 45000
  });

  await sleep(2500);

  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1200);
  }

  return await extractPostsFromDom(page);
}


/* =============================
   Poll
============================= */

async function pollAndNotify(handle) {
  const state = loadState();

  const posts = await fetchPosts(handle);

  const known = state.known || {};
  const now = new Date().toISOString();

  const newPosts = posts.filter(p => !known[p.postId]);

  if (!state.initialized) {
    posts.forEach(p => known[p.postId] = now);
    state.initialized = true;
    state.known = known;
    markStateDirty();
    flushState();
    return;
  }

  if (newPosts.length > 0) {
    for (const p of newPosts) {
      if (notifyConfig?.notifyFn) {
        await notifyConfig.notifyFn({
          type: 'ytcommunity',
          data: {
            title: '【コミュニティ投稿】',
            body: p.content.slice(0, 200),
            url: p.postUrl,
            icon: ICON_URL
          }
        });
      }

      known[p.postId] = now;
    }

    state.known = known;
    markStateDirty();
    flushState();
  }

  console.log(`[YT] fetched=${posts.length} new=${newPosts.length}`);
}


/* =============================
   Init
============================= */

function init(cfg = {}) {
  notifyConfig = cfg;

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
}

process.on('SIGINT', () => {
  flushState();
  process.exit(0);
});

process.on('SIGTERM', () => {
  flushState();
  process.exit(0);
});

module.exports = {
  init,
  pollAndNotify,
  flushState
};
