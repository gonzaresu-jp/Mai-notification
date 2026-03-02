/*****************************************************************
  bilibili Dynamic watcher (production grade)
  - polymer API only
  - zero-miss diff detection
  - type aware parsing
  - jitter + exponential backoff
  - keep alive
*****************************************************************/

const axios = require('axios');
const fs = require('fs');
const https = require('https');
require('dotenv').config();

/* =========================================================
   設定
========================================================= */

const UID = '1900434152';
const STATE_FILE = './bilibili-dynamic-state.json';

const COOKIE = process.env.BILI_COOKIE;

const BASE_INTERVAL_MS = Number(process.env.BILI_DYNAMIC_INTERVAL_MS || 90000);
const JITTER_MS = Number(process.env.BILI_DYNAMIC_JITTER_MS || 30000);
const MAX_BACKOFF_MS = Number(process.env.BILI_DYNAMIC_MAX_BACKOFF_MS || 30 * 60 * 1000);

if (!COOKIE) {
  console.error('❌ BILI_COOKIE 未設定。終了します。');
  process.exit(1);
}

/* =========================================================
   状態
========================================================= */

let lastId = null;
let timer = null;
let backoffMs = 0;

if (fs.existsSync(STATE_FILE)) {
  lastId = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).lastId || null;
}

/* =========================================================
   axios client
========================================================= */

const client = axios.create({
  timeout: 10000,
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Referer': `https://space.bilibili.com/${UID}/dynamic`,
    'Accept': 'application/json, text/plain, */*',
    'Cookie': COOKIE
  }
});

/* =========================================================
   polymer API fetch
========================================================= */

async function fetchDynamicList() {
  const res = await client.get(
    'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space',
    {
      params: {
        host_mid: UID
      }
    }
  );

  if (res.data.code !== 0) {
    throw new Error(`api rejected code=${res.data.code}`);
  }

  return res.data.data?.items || [];
}

/* =========================================================
   dynamic parser（型別）
========================================================= */

function parseDynamic(item) {
  const author = item.modules?.module_author;
  const dynamic = item.modules?.module_dynamic;

  const id = item.id_str;
  const ts = author?.pub_ts;
  const time = new Date(ts * 1000).toLocaleString();

  let text = '';

  if (!dynamic) return null;

  // 動画投稿
  if (dynamic.major?.archive) {
    text = `[動画] ${dynamic.major.archive.title}`;
  }
  // 画像投稿
  else if (dynamic.major?.draw) {
    text = `[画像] ${dynamic.desc?.text || ''}`;
  }
  // 通常テキスト
  else if (dynamic.desc?.text) {
    text = dynamic.desc.text;
  }
  // 転送
  else if (dynamic.major?.type === 'MAJOR_TYPE_FORWARD') {
    text = `[転送] ${dynamic.desc?.text || ''}`;
  }

  return {
    id,
    time,
    text: text.slice(0, 200)
  };
}

/* =========================================================
   差分検出（全件方式 ← ここが最重要）
========================================================= */

function extractNewItems(list) {
  // ===== 初回起動時 =====
  if (!lastId) {
    const first = list[0];
    lastId = first?.id_str || null;
    saveState();

    // ★ ここ追加（最新投稿をログ出力）
    const parsed = parseDynamic(first);
    if (parsed) {
      console.log('[init]');
      console.log(`latest: ${parsed.time} | ${parsed.id}`);
      console.log(parsed.text);
    }

    return [];
  }

  // ===== 通常差分 =====
  const newItems = [];

  for (const item of list) {
    if (item.id_str === lastId) break;
    newItems.push(item);
  }

  if (newItems.length) {
    lastId = newItems[0].id_str;
    saveState();
  }

  return newItems.reverse();
}

/* =========================================================
   メイン処理
========================================================= */

async function fetchDynamic() {
  try {
    const list = await fetchDynamicList();

    if (!list.length) {
      console.log('[dynamic] empty');
      backoffMs = 0;
      return;
    }

    const newItems = extractNewItems(list);

    if (!newItems.length) {
      console.log('[no change]');
      backoffMs = 0;
      return;
    }

    console.log(`🔥 NEW POSTS: ${newItems.length}`);

    for (const item of newItems) {
      const parsed = parseDynamic(item);
      if (!parsed) continue;

      console.log(`${parsed.time} | ${parsed.id}`);
      console.log(parsed.text);

      /* ===== 通知処理を書く場所 ===== */
      // notify(parsed)
    }

    backoffMs = 0;

  } catch (e) {
    const status = e.response?.status;

    const retriable =
      status === 429 ||
      status === 403 ||
      status === 412 ||
      (status >= 500 && status < 600) ||
      !status;

    if (retriable) {
      backoffMs = backoffMs
        ? Math.min(backoffMs * 2, MAX_BACKOFF_MS)
        : BASE_INTERVAL_MS;
    }

    console.error('[dynamic error]', status, e.message);
    if (retriable) {
      console.log(`backoff: ${Math.round(backoffMs / 1000)}s`);
    }
  }
}

/* =========================================================
   util
========================================================= */

function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ lastId }, null, 2)
  );
}

function getNextDelayMs() {
  if (backoffMs > 0) return backoffMs;

  const jitter = Math.floor((Math.random() * 2 - 1) * JITTER_MS);
  return Math.max(30000, BASE_INTERVAL_MS + jitter);
}

/* =========================================================
   polling loop
========================================================= */

async function runLoop() {
  await fetchDynamic();

  const delay = getNextDelayMs();
  console.log(`[next check in ${Math.round(delay / 1000)}s]`);
  timer = setTimeout(runLoop, delay);
}

runLoop();

process.on('SIGINT', () => {
  if (timer) clearTimeout(timer);
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (timer) clearTimeout(timer);
  process.exit(0);
});