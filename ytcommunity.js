// ytcommunity.js - ブラウザ再利用最適化版
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

let notifyConfig = null;
let defaultFilePath = path.join(__dirname, 'community.json');
let autoSave = false;

// 🔧 ブラウザインスタンスを再利用するためのグローバル変数
let sharedBrowser = null;
let browserInitPromise = null;

// ブラウザの初期化（1度だけ起動）
async function getSharedBrowser() {
    if (sharedBrowser && sharedBrowser.isConnected()) {
        return sharedBrowser;
    }

    if (browserInitPromise) {
        return await browserInitPromise;
    }

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
                    '--disk-cache-size=0',             // キャッシュサイズを0にする
                    '--disable-application-cache',     // キャッシュ無効化
                    '--incognito'                      // シークレットモードでキャッシュを書き込まない
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

// プロセス終了時にブラウザをクリーンアップ
process.on('SIGINT', async () => {
    console.log('\n[Shutdown/YT] Closing browser...');
    if (sharedBrowser) {
        await sharedBrowser.close();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[Shutdown/YT] Closing browser...');
    if (sharedBrowser) {
        await sharedBrowser.close();
    }
    process.exit(0);
});

function init(config) {
  notifyConfig = config || {};
  if (config && config.filePath) defaultFilePath = path.resolve(config.filePath);
  if (config && typeof config.autoSave !== 'undefined') autoSave = !!config.autoSave;
  const dir = path.dirname(defaultFilePath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pageSleep(page, ms) {
  if (page && typeof page.waitForTimeout === 'function') {
    return page.waitForTimeout(ms);
  }
  return sleep(ms);
}

function safeWriteJson(filePath, obj) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmpPath, filePath);
}

function loadPosts(filePath = defaultFilePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return Object.values(data);
  } catch (e) {
    console.error('loadPosts error:', e.message);
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
        const normalized = {
          postId: p.postId,
          postUrl: p.postUrl || `https://www.youtube.com/post/${p.postId}`,
          author: p.author || 'Unknown',
          content: p.content || '',
          publishedTime: p.publishedTime || '',
          scrapedAt: new Date().toISOString(),
        };
        map.set(p.postId, normalized);
        addedCount++;
      } else {
        const existingItem = map.get(p.postId);
        if (!existingItem.postUrl && p.postUrl) existingItem.postUrl = p.postUrl;
        if (!existingItem.content && p.content) existingItem.content = p.content;
        if (!existingItem.publishedTime && p.publishedTime) existingItem.publishedTime = p.publishedTime;
      }
    }

    const merged = Array.from(map.values()).sort((a, b) => {
      if (a.publishedTime && b.publishedTime) return a.publishedTime.localeCompare(b.publishedTime);
      return a.postId.localeCompare(b.postId);
    });

    safeWriteJson(filePath, merged);
    return { saved: true, addedCount, totalCount: merged.length };
  } catch (e) {
    console.error('savePosts error:', e.message);
    return { saved: false, addedCount: 0, totalCount: 0, error: e.message };
  }
}

async function parseCommunity(htmlPath) {
  const posts = [];
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');

    const jsonRegex = /var ytInitialData = (\{.*?\});/s;
    const match = html.match(jsonRegex);
    if (!match) {
      const altRegex = /window\["ytInitialData"\]\s*=\s*(\{.*?\});/s;
      const altMatch = html.match(altRegex);
      if (!altMatch) return posts;
      try {
        const data = JSON.parse(altMatch[1]);
        return _extractFromData(data, posts);
      } catch (e) {
        console.error('parseCommunity alt JSON parse error:', e.message);
        return posts;
      }
    }

    try {
      const data = JSON.parse(match[1]);
      _extractFromData(data, posts);
    } catch (e) {
      console.error('parseCommunity JSON parse error:', e.message);
    }
  } catch (e) {
    console.error('parseCommunity read error:', e.message);
  }

  if (autoSave && posts.length > 0) {
    const res = savePosts(posts);
    return { posts, saveResult: res };
  }

  return { posts, saveResult: null };
}

function _extractFromData(data, posts) {
  try {
    const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!contents) return posts;

    contents.forEach(item => {
      const postRenderer = item?.backstagePostThreadRenderer || item?.backstagePostRenderer;
      if (!postRenderer) return;

      const postId = postRenderer.post?.postId || postRenderer.postId;
      if (!postId) return;

      const author = postRenderer.authorText?.simpleText || (postRenderer.authorText?.runs?.map(r => r.text).join('')) || 'Unknown';
      const content = postRenderer.contentText?.runs?.map(r => r.text).join('') || '';
      const publishedTime = postRenderer.publishedTimeText?.runs?.map(r => r.text).join('') || '';
      const postUrl = `https://www.youtube.com/post/${postId}`;

      posts.push({ postId, postUrl, author, content, publishedTime });
    });
  } catch (e) {
    console.error('_extractFromData error:', e.message);
  }
  return posts;
}

// 🔧 修正: ブラウザを再利用
async function startPolling(handle) {
  let page;
  try {
    const browser = await getSharedBrowser();
    page = await browser.newPage();
    const url = `https://www.youtube.com/${handle}/posts`;

    await page.goto(url, { waitUntil: 'networkidle2' });

    let previousHeight = 0;
    while (true) {
      const height = await page.evaluate('document.body.scrollHeight');
      if (height === previousHeight) break;
      previousHeight = height;
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await pageSleep(page, 1000);
    }

    const postUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href^="/post/"]'))
        .map(a => a.href)
        .filter((v, i, self) => self.indexOf(v) === i);
    });

    return postUrls;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.warn('[YT] Failed to close page:', e.message);
      }
    }
  }
}

// 🔧 修正: ブラウザを再利用
async function fetchPostsFromHandleAndSave(handle) {
  let page;
  try {
    const browser = await getSharedBrowser();
    page = await browser.newPage();
    const url = `https://www.youtube.com/${handle}/posts`;
    await page.goto(url, { waitUntil: 'networkidle2' });

    let previousHeight = 0;
    while (true) {
      const height = await page.evaluate('document.body.scrollHeight');
      if (height === previousHeight) break;
      previousHeight = height;
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await pageSleep(page, 1000);
    }

    const html = await page.content();

    const tmpHtmlPath = path.join(require('os').tmpdir(), `ytposts_${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, html, 'utf8');
    const result = await parseCommunity(tmpHtmlPath);
    try { fs.unlinkSync(tmpHtmlPath); } catch (e) { /* ignore */ }

    return result;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.warn('[YT] Failed to close page:', e.message);
      }
    }
  }
}

module.exports = {
  init,
  startPolling,
  parseCommunity,
  fetchPostsFromHandleAndSave,
  loadPosts,
  savePosts,
};