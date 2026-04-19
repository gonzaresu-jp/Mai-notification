global.File = class File { };
const { getSharedBrowser, closeSharedBrowser } = require('./browser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const LOCAL_API_URL = 'http://127.0.0.1:8080/api/notify';
const FANBOX_USER = 'koinoya-mai';
const ICON_URL = './icon.webp';
const PUBLIC_URL = `https://www.fanbox.cc/@${FANBOX_USER}`;
const POLL_INTERVAL = 3 * 60 * 1000;
const STATE_FILE = path.resolve(__dirname, 'fanbox-state.json');
const NOTIFY_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null;

// 既知の投稿IDセット（IDの大小ではなく集合で管理）
let knownIds = new Set(loadState().knownIds || []);

// (プロセス終了時のクリーンアップ処理は main.js で一元管理するように変更しました)

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
    fs.writeFileSync(STATE_FILE, JSON.stringify({ knownIds: Array.from(knownIds) }), 'utf8');
  } catch (e) {
    console.error('state save err', e);
  }
}

// 🔧 既知IDセット方式: IDの大小ではなく「初見かどうか」で新投稿を判定
async function checkFanboxPosts() {
  console.log(`Fanbox Puppeteer scraping: ${PUBLIC_URL}`);

  let page;
  try {
    const browser = await getSharedBrowser({
      userDataDir: process.platform === 'linux'
        ? '/dev/shm/puppeteer-profile-shared'
        : path.join(__dirname, 'tmp', 'puppeteer-shared'),
      ephemeral: true
    });
    page = await browser.newPage();

    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.goto(PUBLIC_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // JSの描画を待機（SPAのため）
    await new Promise(r => setTimeout(r, 4000));

    const html = await page.content();
    const $ = cheerio.load(html);

    // ページ上の全投稿IDとタイトルを収集
    const postTitleMap = new Map();
    $('a[href*="/posts/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/posts\/(\d+)/);
      if (!match) return;
      const id = parseInt(match[1], 10);
      if (!id) return;
      const title = $(el).text().trim();
      if (title && !postTitleMap.has(id)) postTitleMap.set(id, title);
    });
    const currentIds = [...new Set(
      [...postTitleMap.keys()].filter(n => n > 0)
    )];

    if (currentIds.length === 0) {
      console.warn('Fanbox: 投稿URLを抽出できませんでした');
      return;
    }

    console.log(`Fanbox: ページ上の投稿ID一覧: ${currentIds.join(', ')}`);
    console.log(`Fanbox: 既知ID数: ${knownIds.size}`);

    // 初回起動: 現在見えている全IDを「既知」として記録し通知しない
    if (knownIds.size === 0) {
      currentIds.forEach(id => knownIds.add(id));
      saveState();
      console.log(`初回起動: ${knownIds.size}件の投稿IDを既知として記録しました`);
      return;
    }

    // 既知セットにないIDを「新投稿」とみなす
    const newIds = currentIds.filter(id => !knownIds.has(id));

    if (newIds.length === 0) {
      console.log('Fanbox: 新しい投稿はありません');
      return;
    }

    console.log(`Fanbox: 新投稿ID発見: ${newIds.join(', ')}`);

    const pageTitle = $('title').text().replace('|pixivFANBOX', '').trim();

    // 新投稿それぞれについて通知
    for (const newId of newIds) {
      const newPostUrl = `https://www.fanbox.cc/@${FANBOX_USER}/posts/${newId}`;
      const postTitle = postTitleMap.get(newId) || pageTitle || '';

      console.log('Fanbox: 新しい投稿発見:', postTitle, newPostUrl);
      const payload = {
        type: 'fanbox',
        settingKey: 'fanbox',
        data: {
          title: '【Fanbox】恋乃夜まい｜pixivFANBOX',
          body: postTitle || undefined,
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
      } catch (e) {
        console.error('Fanbox notify failed:', e.message || e);
      }
    }

    // 通知後、新IDをすべて既知セットに追加して保存
    newIds.forEach(id => knownIds.add(id));
    saveState();

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
  console.log(`Fanbox polling started for @${FANBOX_USER} (interval: ${interval / 1000}s)`);

  let running = false;

  const loop = async () => {
    if (running) return;
    running = true;
    try {
      await checkFanboxPosts();
    } catch (e) {
      console.error('Fanbox check error:', e);
    } finally {
      running = false;
    }

    const t = setTimeout(loop, interval);
    if (t && typeof t.unref === 'function') t.unref();
  };

  loop();
}

// 直接実行された場合は自動起動
if (require.main === module) {
  startPolling(POLL_INTERVAL);
  console.log(`Fanbox Puppeteer scraper running for @${FANBOX_USER}`);
}

module.exports = { startPolling, checkFanboxPosts };