global.File = class File {};
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const LOCAL_API_URL = 'http://127.0.0.1:8080/api/notify';
const FANBOX_USER = 'koinoya-mai';
const ICON_URL = 'https://elza.poitou-mora.ts.net/pushweb/icon.ico';
const PUBLIC_URL = `https://www.fanbox.cc/@${FANBOX_USER}`;
const POLL_INTERVAL = 3 * 60 * 1000;
const STATE_FILE = path.resolve(__dirname, 'fanbox-state.json');

// 状態: 過去の最大投稿IDを保持する
let lastMaxId = loadState().lastMaxId || 0;

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

async function checkFanboxPosts() {
  console.log(`Fanbox Puppeteer scraping: ${PUBLIC_URL}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  await page.goto(PUBLIC_URL, { waitUntil: 'networkidle0' });

  const html = await page.content();
  fs.writeFileSync('fanbox.html', html, 'utf8');

  const $ = cheerio.load(html);

  // --- 全URL抽出 ---
  const postMatches = html.match(/\/posts\/(\d+)/g) || [];
  if (postMatches.length === 0) {
    console.warn('Fanbox: 投稿URLを抽出できませんでした');
    await browser.close();
    return;
  }

  // 数字部分を比較して最大のものを選ぶ
  let maxId = 0;
  postMatches.forEach(match => {
    const num = parseInt(match.replace('/posts/', ''), 10);
    if (!isNaN(num) && num > maxId) maxId = num;
  });

  if (maxId === 0) {
    console.warn('Fanbox: 有効な投稿IDが見つかりませんでした');
    await browser.close();
    return;
  }

  const newPostPath = `/posts/${maxId}`;
  const newPostUrl = `https://www.fanbox.cc/@${FANBOX_USER}${newPostPath}`;

  // タイトル生成
  let newPostTitle = 'FANBOX新着投稿';
  const descriptionMeta = $('meta[name="description"]').attr('content') || '';
  const cleanedDescription = descriptionMeta
      .replace(/https?:\/\/.*?\/posts\/\d+/, '')
      .replace(/\r?\n|\r/g, ' ')
      .trim();
  if (cleanedDescription.length > 0) newPostTitle = cleanedDescription.substring(0, 50).trim() + '...';
  const pageTitle = $('title').text().replace('｜pixivFANBOX', '').trim();
  if (pageTitle.length > 0) newPostTitle = '【Fanbox】'+ pageTitle;

  console.log(`✅ 最新投稿判定: ${newPostPath} (maxId=${maxId})`);
  console.log(`推定タイトル: ${newPostTitle}`);
  console.log(`過去最大ID: ${lastMaxId}`);

  // 初回起動: 記録のみ（通知しない）
  if (!lastMaxId || lastMaxId === 0) {
    lastMaxId = maxId;
    saveState();
    console.log('初回起動: 最新投稿IDを記録のみ:', lastMaxId);
    await browser.close();
    return;
  }

  // 通知条件: 今回の maxId が過去の最大値を上回る場合のみ
  if (maxId <= lastMaxId) {
    console.log('Fanbox: 新しい投稿はありません（maxId <= 過去最大）');
    await browser.close();
    return;
  }

  // 新着通知（maxId > lastMaxId のときだけここに来る）
  console.log('Fanbox: 新しい投稿発見:', newPostTitle, newPostUrl);
  const payload = {
    type: 'fanbox',
    data: {
      title: newPostTitle,
      url: newPostUrl,
      icon: ICON_URL,
      published: new Date().toISOString()
    }
  };

  try {
    await axios.post(LOCAL_API_URL, payload, { timeout: 10000 });
    console.log('Fanbox -> /api/notify sent:', newPostUrl);

    // 状態更新
    lastMaxId = maxId;
    saveState();
  } catch (e) {
    console.error('Fanbox notify failed:', e.message || e);
  }

  await browser.close();
}

(async () => {
  await checkFanboxPosts();
  setInterval(checkFanboxPosts, POLL_INTERVAL);
  console.log(`Fanbox Puppeteer scraper running for @${FANBOX_USER}`);
})();
