global.File = class File {};
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const LOCAL_API_URL = 'http://127.0.0.1:8080/api/notify';
const FANBOX_USER = 'koinoya-mai';
const ICON_URL = './icon.ico';
const PUBLIC_URL = `https://www.fanbox.cc/@${FANBOX_USER}`;
const POLL_INTERVAL = 3 * 60 * 1000;
const STATE_FILE = path.resolve(__dirname, 'fanbox-state.json');
const NOTIFY_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null;

let lastMaxId = loadState().lastMaxId || 0;

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
            console.log('[Puppeteer/Fanbox] Initializing shared browser instance...');
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
                console.warn('[Puppeteer/Fanbox] Browser disconnected, will reinitialize on next use');
                sharedBrowser = null;
                browserInitPromise = null;
            });

            console.log('[Puppeteer/Fanbox] Shared browser ready');
            return sharedBrowser;
        } catch (e) {
            console.error('[Puppeteer/Fanbox] Failed to initialize browser:', e);
            browserInitPromise = null;
            throw e;
        }
    })();

    return await browserInitPromise;
}

// プロセス終了時にブラウザをクリーンアップ
process.on('SIGINT', async () => {
    console.log('\n[Shutdown/Fanbox] Closing browser...');
    if (sharedBrowser) {
        await sharedBrowser.close();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[Shutdown/Fanbox] Closing browser...');
    if (sharedBrowser) {
        await sharedBrowser.close();
    }
    process.exit(0);
});

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {};
    }
  } catch (e) {
    console.error('state load err', e);
  }
  return {};
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastMaxId }), 'utf8');
  } catch (e) {
    console.error('state save err', e);
  }
}

// 🔧 修正: ブラウザを再利用
async function checkFanboxPosts() {
  console.log(`Fanbox Puppeteer scraping: ${PUBLIC_URL}`);

  let page;
  try {
    const browser = await getSharedBrowser();
    page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.goto(PUBLIC_URL, { waitUntil: 'networkidle0' });

    const html = await page.content();

    const $ = cheerio.load(html);

    const postMatches = html.match(/\/posts\/(\d+)/g) || [];
    if (postMatches.length === 0) {
      console.warn('Fanbox: 投稿URLを抽出できませんでした');
      return;
    }

    let maxId = 0;
    postMatches.forEach(match => {
      const num = parseInt(match.replace('/posts/', ''), 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    });

    if (maxId === 0) {
      console.warn('Fanbox: 有効な投稿IDが見つかりませんでした');
      return;
    }

    const newPostPath = `/posts/${maxId}`;
    const newPostUrl = `https://www.fanbox.cc/@${FANBOX_USER}${newPostPath}`;

    let newPostTitle = 'FANBOX新着投稿';
    const descriptionMeta = $('meta[name="description"]').attr('content') || '';
    const cleanedDescription = descriptionMeta
        .replace(/https?:\/\/.*?\/posts\/\d+/, '')
        .replace(/\r?\n|\r/g, ' ')
        .trim();
    if (cleanedDescription.length > 0) newPostTitle = cleanedDescription.substring(0, 50).trim() + '...';
    const pageTitle = $('title').text().replace('|pixivFANBOX', '').trim();
    if (pageTitle.length > 0) newPostTitle = '【Fanbox】'+ pageTitle;

    console.log(`✅ 最新投稿判定: ${newPostPath} (maxId=${maxId})`);
    console.log(`推定タイトル: ${newPostTitle}`);
    console.log(`過去最大ID: ${lastMaxId}`);

    if (!lastMaxId || lastMaxId === 0) {
      lastMaxId = maxId;
      saveState();
      console.log('初回起動: 最新投稿IDを記録のみ:', lastMaxId);
      return;
    }

    if (maxId <= lastMaxId) {
      console.log('Fanbox: 新しい投稿はありません(maxId <= 過去最大)');
      return;
    }

    console.log('Fanbox: 新しい投稿発見:', newPostTitle, newPostUrl);
    const payload = {
      type: 'fanbox',
      settingKey: 'fanbox',
      data: {
        title: newPostTitle,
        url: newPostUrl,
        icon: ICON_URL,
        published: new Date().toISOString()
      }
    };

    try {
      await axios.post(LOCAL_API_URL, payload, { 
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Notify-Token': NOTIFY_TOKEN
        }
      });
      console.log('Fanbox -> /api/notify sent:', newPostUrl);

      lastMaxId = maxId;
      saveState();
    } catch (e) {
      console.error('Fanbox notify failed:', e.message || e);
    }
  } catch (e) {
    console.error('Fanbox check error:', e.message || e);
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.warn('[Fanbox] Failed to close page:', e.message);
      }
    }
  }
}

function startPolling(interval = POLL_INTERVAL) {
  console.log(`Fanbox polling started for @${FANBOX_USER} (interval: ${interval/1000}s)`);
  
  // 初回実行
  checkFanboxPosts().catch(e => console.error('Fanbox initial check error:', e));
  
  // 定期実行
  setInterval(() => {
    checkFanboxPosts().catch(e => console.error('Fanbox check error:', e));
  }, interval);
}

// 直接実行された場合は自動起動
if (require.main === module) {
  (async () => {
    await checkFanboxPosts();
    setInterval(checkFanboxPosts, POLL_INTERVAL);
    console.log(`Fanbox Puppeteer scraper running for @${FANBOX_USER}`);
  })();
}

module.exports = { startPolling, checkFanboxPosts };