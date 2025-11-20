const http = require('http');
const https = require('https');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SEEN_PATH = path.join(__dirname, 'twicas_seen.json');
const CONFIG_PATH = path.join(__dirname, 'twitcasting-token.json'); // トークンファイルパスを定義
const HEADLESS = true; // 💡 修正: ここを true から false に変更
const CHECK_INTERVAL_MS = 5 * 1000;
const MAX_AGE_HOURS = 24;
const NOTIFY_ENDPOINT = 'http://localhost:8080/api/notify';
const ICON_URL = 'https://elza.poitou-mora.ts.net/pushweb/icon.ico';
const NOTIFY_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null;

const API_BASE_URL = 'https://apiv2.twitcasting.tv';
const CLIENT_ID = process.env.TWITCASTING_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCASTING_CLIENT_SECRET;

// --------------------------------------------------------
// アクセストークンの読み込みロジック (グローバルスコープで即時実行)
// 1. 環境変数から読み込み
// 2. なければ twitcasting-token.json から読み込み、 access_token フィールドもチェックする
let accessToken = process.env.TWITCASTING_ACCESS_TOKEN || null; // グローバルで初期化

// 通知一時無効フラグ（環境変数で制御）
const DISABLE_NOTIFICATIONS = process.env.DISABLE_NOTIFICATIONS === '1' || process.env.DISABLE_NOTIFICATIONS === 'true';
if (DISABLE_NOTIFICATIONS) console.log('TwitCasting: notifications disabled via DISABLE_NOTIFICATIONS');

if (!accessToken) {
    try {
        const configText = fs.readFileSync(CONFIG_PATH, 'utf8');
        const config = JSON.parse(configText);
        // TWITCASTING_ACCESS_TOKEN, access_token (APIレスポンス形式), または accessToken キーを探す
        accessToken = config.TWITCASTING_ACCESS_TOKEN || config.access_token || config.accessToken || null; 
        if (accessToken) {
            console.log('Access token successfully loaded from twitcasting-token.json.');
        }
    } catch (e) {
        // twitcasting-token.json が存在しない、または無効な場合は警告を出すが、処理は続行
        if (e.code !== 'ENOENT') {
            console.warn(`[Config Load Warning] Error reading twitcasting-token.json: ${e.message}`);
        }
    }
}
// --------------------------------------------------------

// 🔴 修正: lastLiveId をアカウントIDごとに管理する Map に変更
const lastLiveStatus = new Map();

// --- seen.json の読み書き ---
function loadSeen() {
    try { return JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')); } catch { return {}; }
}
function saveSeen(state) {
    try { fs.writeFileSync(SEEN_PATH, JSON.stringify(state, null, 2)); } catch(e){ console.error('seen.json write error:', e); }
}

// --- retry ヘルパ ---
async function retryAsync(fn, retries=3, baseDelay=300) {
    for(let i=0;i<retries;i++){
        try{ return await fn(); } catch(err){
            const m = (err && (err.message || String(err))) || '';
            const transient = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(m); 
            if(i === retries-1 || !transient) throw err;
            const delay = baseDelay * Math.pow(2,i);
            console.warn(`retryAsync transient error (${m}), retry ${i+1}/${retries} after ${delay}ms in ${fn.name || 'anonymous function'}`);
            await new Promise(r=>setTimeout(r,delay));
        }
    }
}

// --- 通知送信 ---
// --- 通知送信 (no-op にできるように) ---
async function sendNotify(screenId, movieId, title='【ツイキャス】ライブ配信') {
    // 早期終了: 環境変数で通知を無効化している場合
    if (DISABLE_NOTIFICATIONS) {
        console.log(`[${screenId}] notify suppressed (DISABLE_NOTIFICATIONS) - movie ${movieId}`);
        return;
    }
    // 早期終了: トークンやエンドポイントが設定されていない場合も安全にスキップ
    if (!NOTIFY_TOKEN || !NOTIFY_ENDPOINT) {
        console.log(`[${screenId}] notify skipped (missing token or endpoint) - movie ${movieId}`);
        return;
    }
const payload = {
  data: {
    title: notify.title,
    body: notify.body,
    url: `https://twitcasting.tv/${screenId}/movie/${movieId}`,
    icon: 'https://twitcasting.tv/favicon.ico'
  },
  type: 'twitcasting',
  settingKey: screenId
};


    let agent;
    try{
        const parsed = new URL(NOTIFY_ENDPOINT);
        agent = parsed.protocol === 'https:' ? new https.Agent({keepAlive:false}) : new http.Agent({keepAlive:false});
    }catch(e){ agent = undefined; }

    try{
        const res = await retryAsync(()=>fetch(NOTIFY_ENDPOINT,{
            method:'POST',
            headers:{ 'Content-Type':'application/json', 'X-Notify-Token': NOTIFY_TOKEN },
            body: JSON.stringify(payload),
            agent,
            timeout:15000
        }),3,300);
        if(!res.ok){
            const text = await res.text().catch(()=>'<no body>');
            console.error(`[${screenId}] notify failed:`, res.status, text);
        } else console.log(`[${screenId}] notify sent for movie ${movieId}`);
    }catch(e){ console.error(`[${screenId}] notify error:`, e.stack||e); }
}


// --- プライベートライブ判定 ---
async function checkPrivateLive(screenId){
    const url = `https://twitcasting.tv/${screenId}/movie/latest`;
    let browser;
    try{
        // puppeteer.launch の headless オプションが false になり、ブラウザが見えるようになる
        browser = await puppeteer.launch({ headless: HEADLESS, args:['--no-sandbox','--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await retryAsync(async()=>{ await page.goto(url,{waitUntil:'domcontentloaded', timeout:60000}); await new Promise(r=>setTimeout(r,2000)); },3,500);
        const isPrivate = await page.$eval('.tw-empty-state-text', el=>el.textContent.includes('合言葉')).catch(()=>false);
        const isLiveBadge = await page.$eval('.tw-movie-thumbnail2-badge[data-status="live"]', ()=>true).catch(()=>false);
        return isPrivate && isLiveBadge;
    }catch(e){ console.error(`[${screenId}] checkPrivateLive error:`,e.stack||e); return false; }
    finally{ if(browser) await browser.close(); }
}

// --- APIライブ判定 ---
// --- APIライブ判定 (堅牢化版) ---
// --- ポーリング開始 ---
function startWatcher(screenId, intervalMs=CHECK_INTERVAL_MS){
    if (!screenId) {
        console.warn('[TwitCasting] startWatcher called with empty screenId — skipping');
        return;
    }

    console.log(`[TwitCasting] ${screenId} の監視開始 (間隔: ${intervalMs/1000}秒)`);

    setInterval(async()=>{
        try{ await checkLiveStatus(screenId); }catch(e){ console.error(`[${screenId}] watcher error:`, e && (e.stack || e.message) ? (e.stack || e.message) : e); }
    }, intervalMs);

    (async()=>{ 
        try{ await checkLiveStatus(screenId); }catch(e){ console.error(`[${screenId}] initial check error:`, e && (e.stack || e.message) ? (e.stack || e.message) : e); } 
    })();
}

// --- APIライブ判定（タイトルを body に入れる修正版） ---
async function checkLiveStatus(screenId){
    if (!screenId) {
        console.warn('[checkLiveStatus] empty screenId provided');
        return null;
    }

    // 前回の状態を参照（null / 'private' / movieId）
    let currentLiveId = lastLiveStatus.get(screenId) || null;
    const prevLiveId = currentLiveId;

    try{
        if(!accessToken) throw new Error('TWITCASTING_ACCESS_TOKEN 未設定 (twitcasting-token.jsonまたは環境変数で設定してください)');

        const res = await axios.get(`${API_BASE_URL}/users/${screenId}/movies?limit=1&status=live`, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Api-Version':'2.0' },
            validateStatus:()=>true,
            timeout: 15000
        });

        if (!(res.status >= 200 && res.status < 300)) {
            console.warn(`[${screenId}] TwitCasting API returned status ${res.status}`);
        }

        const movie = Array.isArray(res.data?.movies) ? res.data.movies[0] : null;

        // --- APIによるライブ判定 ---
        if (movie) {
            const isLiveFlag = movie.status === 'live' || movie.is_live === true;
            // started_at の妥当性チェック
            let startedOk = true;
            if (movie.started_at) {
                const started = new Date(movie.started_at).getTime();
                const now = Date.now();
                const ageMs = now - started;
                const maxAcceptMs = (MAX_AGE_HOURS || 24) * 60 * 60 * 1000;
                if (isNaN(started) || ageMs > maxAcceptMs) {
                    startedOk = false;
                    console.warn(`[${screenId}] movie.started_at too old or invalid: ${movie.started_at}`);
                }
            }

            if (isLiveFlag && startedOk) {
                const observedTitle = movie.title || 'タイトル不明';
                console.log(
                  `[${screenId}] Polling Result: 🟢 Live (ID: ${movie.id}, Title: "${observedTitle}", status=${movie.status}, is_live=${movie.is_live})`
                );

                // 新規ライブ開始のときだけ通知
                if (movie.id !== prevLiveId) {
                    currentLiveId = movie.id;
                    lastLiveStatus.set(screenId, currentLiveId);
                    console.log(`🔴 Live started! movie_id: ${currentLiveId}`);

                    const notifyTitle = '【ツイキャス】ライブ開始';
                    const notifyBody  = observedTitle; // ← body にタイトルを入れる

                    // プレビュー用ログ
                    console.log(`[Notify Preview] screenId=${screenId}, movieId=${currentLiveId}, title="${notifyTitle}", body="${notifyBody}"`);

                    try {
                        await sendNotify(
                          screenId,
                          currentLiveId,
                          notifyTitle,
                          notifyBody
                        );
                    } catch (e) {
                        console.error(`[${screenId}] sendNotify error:`, e && (e.stack || e.message) ? (e.stack || e.message) : e);
                    }
                } else {
                    // 既に同じライブIDを保持している場合は状態維持（lastLiveStatus を最新に）
                    lastLiveStatus.set(screenId, movie.id);
                }
                return movie.id;
            } else {
                // API に movie があるがライブ確定できない場合はログにしてフォールバックへ
                console.log(`[${screenId}] API returned movie but not confirmed live (status=${movie.status}, is_live=${movie.is_live}, started_ok=${startedOk})`);
            }
        } else {
            // movies 配列が空
            console.log(`[${screenId}] API returned no movies`);
        }

        // --- APIでライブ判定できない場合はプライベート判定（Puppeteer）へフォールバック ---
        const isPrivate = await checkPrivateLive(screenId);
        if (isPrivate) {
            console.log(`[${screenId}] Polling Result: 🔒 Private Live detected (via Puppeteer)`);
            if (prevLiveId !== 'private') {
                currentLiveId = 'private';
                lastLiveStatus.set(screenId, 'private');
                console.log('🔒 プライベートライブ中！');

                const notifyTitle = '【ツイキャス】プライベートライブ';
                const notifyBody  = '(合言葉あり)'; // checkPrivateLive がタイトルを返すように拡張したらここを置き換える

                console.log(`[Notify Preview] screenId=${screenId}, movieId=private, title="${notifyTitle}", body="${notifyBody}"`);

                try {
                    await sendNotify(screenId, 'private', notifyTitle, notifyBody);
                } catch (e) {
                    console.error(`[${screenId}] sendNotify error:`, e && (e.stack || e.message) ? (e.stack || e.message) : e);
                }
            }
            return 'private';
        }

        // --- 最終的にオフライン ---
        if (prevLiveId !== null) {
            console.log(`[${screenId}] Polling Result: ⚪ Offline (No public or private live detected). previous=${prevLiveId}`);
        } else {
            console.log(`[${screenId}] Polling Result: ⚪ Offline (No public or private live detected)`);
        }
        lastLiveStatus.set(screenId, null);
        return null;

    } catch (e) {
        // transient なエラーはログにして null を返す（監視は継続）
        const msg = e && (e.message || e.stack) || String(e);
        console.error(`[${screenId}] checkLiveStatus error:`, msg);
        console.log(`[${screenId}] Polling Result: ⚠️ Error occurred`);
        return null;
    }
}



// --- ポーリング開始 ---
function startWatcher(screenId, intervalMs=CHECK_INTERVAL_MS){
    console.log(`[TwitCasting] ${screenId} の監視開始 (間隔: ${intervalMs/1000}秒)`);

    setInterval(async()=>{
        try{ await checkLiveStatus(screenId); }catch(e){ console.error(`[${screenId}] watcher error:`, e.stack||e.message); }
    }, intervalMs);

    (async()=>{ 
        try{ await checkLiveStatus(screenId); }catch(e){ console.error(`[${screenId}] initial check error:`, e.stack||e.message); } 
    })();
}

// --- exports ---
module.exports = { checkLiveStatus, startWatcher, sendNotify, checkPrivateLive };