// twitter.js（通知送信付き・設定キー対応版） - 修正版（取得ツイートのログ出力を追加）
const http = require('http');
const https = require('https');
const { URL } = require('url');
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
const NOTIFY_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null;

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

// --- 汎用 retry ヘルパ ---
async function retryAsync(fn, retries = 3, baseDelay = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const m = (err && (err.message || String(err))) || '';
      const transient = /socket_not_connected|ERR_SOCKET_NOT_CONNECTED|ECONNRESET|ETIMEDOUT|EPIPE|ENOTCONN|ECONNREFUSED|ENETUNREACH/i.test(m);
      if (i === retries - 1 || !transient) throw err;
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`retryAsync: transient error (${m}). retry ${i+1}/${retries} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// --- ISO 日付パース ---
function parseISO(s) { try { return new Date(s); } catch { return null; } }

// --- ログ用ヘルパ（テキスト要約） ---
function summarizeText(s, max = 120) {
  if (!s) return '';
  const single = s.replace(/\s+/g, ' ').trim();
  if (single.length <= max) return single;
  return single.slice(0, max) + '…';
}

function summarizeTweetForLog(t) {
  const idShort = (t.id || '').toString().substring(0, 10) + (t.id ? '...' : '');
  const textPreview = summarizeText(t.text || '', 120).replace(/\n/g, ' ');
  return `${idShort} "${textPreview}"`;
}

// --- 通知送信 ---
async function sendNotify(username, tweet, settingKey, sendText) {
  const notificationBody = (sendText && tweet.text)
        ? tweet.text.replace(/\s+/g, ' ').trim().slice(0, 200) + (tweet.text.length > 200 ? '…' : '')
        : "クリックでツイートを開きます";

  const payload = {
    type: "twitter",
    settingKey: settingKey,
    data: {
      title: `新着ツイート (@${username})`,
      body: notificationBody,
      url: `https://x.com/${username}/status/${tweet.id}`,
      icon: ICON_URL
    }
  };

  // agent を送信先プロトコルに合わせて選択（NOTIFY_ENDPOINT が http/https によって切替）
  let agent;
  try {
    const parsed = new URL(NOTIFY_ENDPOINT);
    if (parsed.protocol === 'https:') agent = new https.Agent({ keepAlive: false });
    else if (parsed.protocol === 'http:') agent = new http.Agent({ keepAlive: false });
  } catch (e) {
    console.warn('sendNotify: failed to parse NOTIFY_ENDPOINT, proceeding without custom agent', e && e.message);
    agent = undefined;
  }

  try {
    const res = await retryAsync(() => fetch(NOTIFY_ENDPOINT, {
      method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'X-Notify-Token': NOTIFY_TOKEN
      },
      body: JSON.stringify(payload),
      agent,                 // protocol に合わせた agent（なければ undefined）
      timeout: 15000
    }), 3, 300);

    if (!res.ok) {
      const text = await res.text().catch(()=>'<no body>');
      console.error(`[${username}] notify failed:`, res.status, text);
    } else {
      console.log(`[${username}] notify sent for tweet ${tweet.id}`);
    }
  } catch (e) {
    console.error(`[${username}] notify error:`, e.stack || e);
  }
}

// --- 単一ユーザのチェック ---
async function checkOneUser(page, username, seenState) {
  try {
    // ページ遷移を retry でラップ（瞬断吸収）
    await retryAsync(async () => {
      await page.goto(`https://x.com/${username}`, { waitUntil: 'networkidle2', timeout: 60000 });
      // ページ安定待ち
      await new Promise(r => setTimeout(r, 2500));
      
      // ▼▼▼【追加部分】ここから ▼▼▼
      // 2000ピクセルほどスクロールして追加読み込みを誘発
      await page.evaluate(() => {
        window.scrollBy(0, 2000);
      });
      // 追加読み込み完了まで少し待機（2秒）
      await new Promise(r => setTimeout(r, 2000));
      // ▲▲▲【追加部分】ここまで ▲▲▲

    }, 3, 500);


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
async function check(username, isRetry = false) {
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

    // --- 追加ログ: 取得できた最新のツイートを要約してログに残す ---
    try {
      if (Array.isArray(normalTweets) && normalTweets.length > 0) {
        const samples = normalTweets.slice(0, 2).map(summarizeTweetForLog);
        console.log(`[${username}] fetched ${normalTweets.length} tweets. latest: ${samples.join(' | ')}`);
      } else {
        console.log(`[${username}] fetched 0 tweets.`);
        
        // ✅ 0件取得かつ初回チェックの場合、5秒後に再チェック
        if (!isRetry) {
          console.log(`[${username}] ⚠️  0件取得のため5秒後に再チェックします...`);
          await browser.close();
          await new Promise(r => setTimeout(r, 5000));
          return await check(username, true); // 再帰呼び出し（再チェック）
        } else {
          console.log(`[${username}] ⚠️  再チェックでも0件でした。次の定期チェックまで待機します。`);
        }
      }
    } catch (e) {
      console.warn(`[${username}] failed to log fetched tweets:`, e && e.message ? e.message : e);
    }

    if (seenState[username].firstRun) {
      seenState[username].ids = normalTweets.map(t => t.id);
      seenState[username].firstRun = false;
      saveSeen(seenState);
      console.log(`[${username}] 初回実行: ${normalTweets.length}件を既読として記録`);
    } else if (newTweets.length > 0) {
      const idsToAdd = normalTweets.map(t => t.id);
      seenState[username].ids = Array.from(new Set([...idsToAdd, ...seenState[username].ids])).slice(0, 200);
      saveSeen(seenState);

      let settingKey = null;
      let sendText = true;

      const lowerUsername = username.toLowerCase();
      if (lowerUsername === 'koinoya_mai') {
          settingKey = 'twitterMain';
          sendText = true;
      } else if (lowerUsername === 'koinoyamai17') {
          settingKey = 'twitterSub';
          sendText = false;
      } else {
          settingKey = 'twitterMain';
          sendText = false;
      }

      console.log(`[${username}] 新着ツイート ${newTweets.length}件 (settingKey: ${settingKey})`);

      for (const t of newTweets.slice().reverse()) {
        console.log(`[${username}] 新しいツイート: ${summarizeTweetForLog(t)}`);
        await sendNotify(username, t, settingKey, sendText);
      }
    } else {
      if (Array.isArray(normalTweets) && normalTweets.length > 0) {
        console.log(`[${username}] 新着なし。直近取得: ${summarizeTweetForLog(normalTweets[0])}`);
      } else {
        console.log(`[${username}] 新着なし。取得ツイートなし`);
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
