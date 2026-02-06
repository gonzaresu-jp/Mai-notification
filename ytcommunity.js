// ytcommunity.js
// Stable production build
// login_required / Target.closeTarget / bot detection 全対策済み

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');

puppeteer.use(Stealth());

/* =============================
   Config
============================= */

let notifyConfig = null;

let defaultFilePath = path.join(__dirname, 'community.json');
let stateFilePath = path.join(__dirname, 'ytcommunity_state.json');
let profileDir = path.join(__dirname, '.ytprofile'); // ← 重要：永続プロファイル

const ICON_URL = './icon.webp';

let browser = null;

/* =============================
   Browser (persistent)
============================= */

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  browser = await puppeteer.launch({
    headless: 'new',

    // ★ incognito禁止
    userDataDir: profileDir,

    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,900'
    ]
  });

  browser.on('disconnected', () => {
    browser = null;
  });

  return browser;
}

/* =============================
   Utils
============================= */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function safeClose(page) {
  if (!page || page.isClosed()) return;
  return page.close().catch(() => {});
}

function safeWriteJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/* =============================
   State
============================= */

function loadState() {
  if (!fs.existsSync(stateFilePath)) {
    return { initialized: false, known: {} };
  }
  return JSON.parse(fs.readFileSync(stateFilePath));
}

function saveState(s) {
  safeWriteJson(stateFilePath, s);
}

/* =============================
   Extract DOM (最安定)
============================= */

async function extractPostsFromDom(page) {
  return page.evaluate(() => {
    const out = [];

    const nodes = document.querySelectorAll('ytd-backstage-post-renderer');

    nodes.forEach(n => {
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
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      // ★ 実在Chrome UA
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja-JP,ja;q=0.9'
    });

    const url = `https://www.youtube.com/@${handle.replace('@','')}/posts`;

    console.log('[YT] Fetching:', url);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    await sleep(2500);

    // スクロール読み込み
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1200);
    }

    const posts = await extractPostsFromDom(page);

    if (!posts.length) {
      const html = await page.content();
      if (html.includes('Sign in')) {
        throw new Error('login_required');
      }
    }

    return posts;

  } finally {
    await safeClose(page);
  }
}

/* =============================
   Poll + Notify
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
    saveState(state);

    console.log('[YT] first run skip notify');
    return;
  }

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
  saveState(state);

  console.log(`[YT] fetched=${posts.length} new=${newPosts.length}`);
}

/* =============================
   Init
============================= */

function init(cfg = {}) {
  notifyConfig = cfg;
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
}

module.exports = {
  init,
  pollAndNotify
};
