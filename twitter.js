// twitter.js（通知送信付き・設定キー対応版）

const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const os = require('os');
const fs = require('fs');

const PROFILE_PATH = path.join(os.homedir(), '.mozilla/firefox/j4gdqxur.default-release');
const COOKIE_DB = path.join(PROFILE_PATH, 'cookies.sqlite');
const TMP_DB = path.join(os.tmpdir(), 'cookies_temp_twitter.sqlite');
const SEEN_PATH = path.join(__dirname, 'seen.json');
const HEADLESS = true;
const MAX_AGE_HOURS = 24;
const CHECK_INTERVAL_MS = 60 * 1000;
const NOTIFY_ENDPOINT = 'http://localhost:8080/api/notify';
const ICON_URL = 'https://elza.poitou-mora.ts.net/pushweb/icon.ico';

// --- seen.json の読み書き ---
function loadSeen() {
  try {
    const raw = fs.readFileSync(SEEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveSeen(state) {
  try {
    fs.writeFileSync(SEEN_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('seen.json write error:', e);
  }
}

// --- cookie DB コピー ---
async function copyCookieDb() {
  try {
    fs.copyFileSync(COOKIE_DB, TMP_DB);
  } catch (e) {
    console.error('cookie DB copy failed:', e.message || e);
  }
}

// --- cookie 読み込み ---
async function getCookies() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(TMP_DB)) return resolve([]);
    const db = new sqlite3.Database(TMP_DB, sqlite3.OPEN_READONLY, err => { if(err) reject(err); });
    db.all("SELECT host, name, value, path, isSecure, expiry FROM moz_cookies", [], (err, rows) => {
      if(err){ db.close(); return reject(err); }
      const cookies = rows.map(r => ({
        name: r.name,
        value: r.value,
        domain: r.host.startsWith('.') ? r.host.slice(1) : r.host,
        path: r.path,
        secure: r.isSecure === 1,
        httpOnly: false,
        expires: r.expiry
      }));
      db.close();
      resolve(cookies);
    });
  });
}

// --- ISO 日付パース ---
function parseISO(s) { try { return new Date(s); } catch { return null; } }

// --- 通知送信 ---
async function sendNotify(username, tweet, settingKey, sendText) {
  // body に入れるテキストは sendText フラグと tweet.text の有無に依存
  const notificationBody = (sendText && tweet.text) 
        ? tweet.text.replace(/\s+/g, ' ').trim().slice(0, 200) + (tweet.text.length > 200 ? '…' : '') 
        : "クリックでツイートを開きます";

  const payload = {
    type: "twitter",
    settingKey: settingKey, // server.js がこの設定キーで DB を参照
    data: {
      title: `新着ツイート (@${username})`,
      body: notificationBody,
      url: `https://x.com/${username}/status/${tweet.id}`,
      icon: ICON_URL
    }
  };

  try {
    const res = await fetch(NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error(`[${username}] notify failed:`, res.status, await res.text());
    } else {
      console.log(`[${username}] notify sent for tweet ${tweet.id}`);
    }
  } catch (e) {
    console.error(`[${username}] notify error:`, e.message || e);
  }
}

// --- 単一ユーザのチェック ---
async function checkOneUser(page, username, seenState) {
  try {
    await page.goto(`https://x.com/${username}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));

    const tweets = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article'));
      const seen = new Set();
      const out = [];
      for (const article of articles) {
        const link = article.querySelector('a[href*="/status/"]');
        if (!link) continue;
        const href = link.getAttribute('href') || '';
        const id = href.split('/').filter(Boolean).pop();
        if (!id) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        const timeEl = article.querySelector('time');
        const datetime = timeEl ? timeEl.getAttribute('datetime') : null;
        let text = '';
        const tweetText = article.querySelector('div[lang]') || article;
        text = tweetText ? tweetText.innerText : article.innerText;
        out.push({ id, text, datetime });
      }
      return out.filter(t => !t.text.includes('固定'));
    });

    const now = Date.now();
    const maxAgeMs = MAX_AGE_HOURS * 3600 * 1000;
    const seenIds = seenState.ids || [];
    const newTweets = [];

    for (const t of tweets) {
      if (seenIds.includes(t.id)) continue;
      const createdAt = t.datetime ? parseISO(t.datetime) : null;
      const ageOk = createdAt ? ((now - createdAt.getTime()) <= maxAgeMs) : true;
      if (ageOk) newTweets.push(t);
    }

    return { newTweets, normalTweets: tweets };

  } catch (err) {
    return { newTweets: [], normalTweets: [], error: err.message };
  }
}

// --- main check 関数 ---
async function check(username) {
  const seenState = loadSeen();
  await copyCookieDb();
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: HEADLESS, 
      product: 'firefox', 
      args: ['--no-sandbox','--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();

    const cookies = await getCookies();
    if (cookies.length) {
      try { await page.setCookie(...cookies); } catch (e) { /* ignore cookie set errors */ }
    }

    if (!seenState[username]) seenState[username] = { ids: [], firstRun: true };

    const { newTweets, normalTweets, error } = await checkOneUser(page, username, seenState[username]);

    if (seenState[username].firstRun) {
      // 初回は既存ツイートを既読扱いにして通知しない
      seenState[username].ids = normalTweets.map(t => t.id);
      seenState[username].firstRun = false;
      saveSeen(seenState);
      console.log(`[${username}] 初回実行: ${normalTweets.length}件を既読として記録`);
    } else if (newTweets.length > 0) {
      // 新着があれば先に seen を更新してから通知
      const idsToAdd = normalTweets.map(t => t.id);
      seenState[username].ids = Array.from(new Set([...idsToAdd, ...seenState[username].ids])).slice(0, 200);
      saveSeen(seenState);
      
      let settingKey = null;
      let sendText = true;

      // アカウント名に応じて設定キーを決定（キャメルケースに統一）
      const lowerUsername = username.toLowerCase();
      if (lowerUsername === 'koinoya_mai') {
          settingKey = 'twitterMain'; // ✅ キャメルケース
          sendText = true;
      } else if (lowerUsername === 'koinoyamai17') {
          settingKey = 'twitterSub'; // ✅ キャメルケース
          sendText = false;
      } else {
          // その他のアカウント（デフォルト）
          settingKey = 'twitterMain';
          sendText = false; 
      }
      
      console.log(`[${username}] 新着ツイート ${newTweets.length}件 (settingKey: ${settingKey})`);
      
      for (const t of newTweets.slice().reverse()) { // 古い順に送る
        console.log(`[${username}] 新しいツイート: ${t.id.substring(0, 10)}...`);
        await sendNotify(username, t, settingKey, sendText);
      }
    }

    return { username, newTweets, error };

  } catch (e) {
    console.error(`[${username}] check error:`, e.message);
    return { username, newTweets: [], error: e.message };
  } finally {
    if (browser) await browser.close();
  }
}

// --- startWatcher 関数 ---
function startWatcher(username, intervalMs = CHECK_INTERVAL_MS) {
  console.log(`[Twitter] ${username} の監視を開始 (間隔: ${intervalMs/1000}秒)`);
  
  setInterval(async () => {
    try {
      const result = await check(username);
      if (result.error) {
        console.error(`[${username}] check error:`, result.error);
      }
    } catch (e) {
      console.error(`[${username}] watcher error:`, e.message);
    }
  }, intervalMs);

  // 起動直後に一回チェックする
  (async () => {
    try { 
      await check(username); 
    } catch (e) { 
      console.error(`[${username}] initial check error:`, e.message);
    }
  })();
}

// --- exports ---
module.exports = { check, startWatcher };