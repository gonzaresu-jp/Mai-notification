const http = require('http');
const https = require('https');
const { URL } = require('url');
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || null;

const SEEN_PATH = path.join(__dirname, 'twicas_seen.json');
const CONFIG_PATH = path.join(__dirname, 'twitcasting-token.json');
const HEADLESS = true;
const CHECK_INTERVAL_MS = 5 * 1000;
const MAX_AGE_HOURS = 24;
const NOTIFY_ENDPOINT = 'http://localhost:8080/api/notify';
const ICON_URL = './icon.webp';
const NOTIFY_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null;

const API_BASE_URL = 'https://apiv2.twitcasting.tv';
const CLIENT_ID = process.env.TWITCASTING_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCASTING_CLIENT_SECRET;

// 🔧 ブラウザインスタンスを再利用するためのグローバル変数
let sharedBrowser = null;
let browserInitPromise = null;

// ブラウザの初期化（1度だけ起動）
async function getSharedBrowser() {
    if (sharedBrowser && sharedBrowser.isConnected()) {
        return sharedBrowser;
    }

    // 既に初期化中の場合は待つ
    if (browserInitPromise) {
        return await browserInitPromise;
    }

    browserInitPromise = (async () => {
        try {
            console.log('[Puppeteer] Initializing shared browser instance...');
            if (PUPPETEER_EXECUTABLE_PATH) {
                console.log('[Puppeteer] Using executablePath:', PUPPETEER_EXECUTABLE_PATH);
            }
            sharedBrowser = await puppeteer.launch({
                executablePath: PUPPETEER_EXECUTABLE_PATH || undefined,
                headless: HEADLESS,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // メモリ節約
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    // 🔧 ディスク書き込み抑制
                    '--disk-cache-size=0',           // ディスクキャッシュを無効化
                    '--media-cache-size=0',          // メディアキャッシュを無効化
                    '--disable-application-cache',   // アプリケーションキャッシュを無効化
                    '--disable-background-networking', // バックグラウンド通信を無効化
                    '--disable-sync',                // 同期を無効化
                    '--disable-translate',           // 翻訳機能を無効化
                    '--disable-extensions',          // 拡張機能を無効化
                    '--blink-settings=imagesEnabled=false' // 画像読み込みを無効化（軽量化）
                ]
            });

            // ブラウザが予期せず終了した場合の処理
            sharedBrowser.on('disconnected', () => {
                console.warn('[Puppeteer] Browser disconnected, will reinitialize on next use');
                sharedBrowser = null;
                browserInitPromise = null;
            });

            console.log('[Puppeteer] Shared browser ready');
            return sharedBrowser;
        } catch (e) {
            console.error('[Puppeteer] Failed to initialize browser:', e);
            browserInitPromise = null;
            throw e;
        }
    })();

    return await browserInitPromise;
}

// プロセス終了時にブラウザをクリーンアップ
process.on('SIGINT', async () => {
    console.log('\n[Shutdown] Closing browser...');
    if (sharedBrowser) {
        await sharedBrowser.close();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[Shutdown] Closing browser...');
    if (sharedBrowser) {
        await sharedBrowser.close();
    }
    process.exit(0);
});

let accessToken = process.env.TWITCASTING_ACCESS_TOKEN || null;

const DISABLE_NOTIFICATIONS = process.env.DISABLE_NOTIFICATIONS === '1' || process.env.DISABLE_NOTIFICATIONS === 'true';
if (DISABLE_NOTIFICATIONS) console.log('TwitCasting: notifications disabled via DISABLE_NOTIFICATIONS');

if (!accessToken) {
    try {
        const configText = fs.readFileSync(CONFIG_PATH, 'utf8');
        const config = JSON.parse(configText);
        accessToken = config.TWITCASTING_ACCESS_TOKEN || config.access_token || config.accessToken || null; 
        if (accessToken) {
            console.log('Access token successfully loaded from twitcasting-token.json.');
        }
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn(`[Config Load Warning] Error reading twitcasting-token.json: ${e.message}`);
        }
    }
}

const lastLiveStatus = new Map();

function loadSeen() {
    try { return JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')); } catch { return {}; }
}
function saveSeen(state) {
    try { fs.writeFileSync(SEEN_PATH, JSON.stringify(state, null, 2)); } catch(e){ console.error('seen.json write error:', e); }
}

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

async function sendNotify(screenId, movieId, title = '【ツイキャス】ライブ配信', body = '') {
    if (DISABLE_NOTIFICATIONS) {
        console.log(`[${screenId}] notify suppressed (DISABLE_NOTIFICATIONS) - movie ${movieId}`);
        return;
    }
    
    if (!NOTIFY_TOKEN || !NOTIFY_ENDPOINT) {
        console.log(`[${screenId}] notify skipped (missing token or endpoint) - movie ${movieId}`);
        return;
    }

    const payload = {
        data: {
            title: title,
            body: body,
            url: `https://twitcasting.tv/${screenId}/movie/${movieId}`,
            icon: 'https://twitcasting.tv/favicon.ico'
        },
        type: 'twitcasting',
        settingKey: screenId
    };

    let agent;
    try {
        const parsed = new URL(NOTIFY_ENDPOINT);
        agent = parsed.protocol === 'https:' 
            ? new https.Agent({keepAlive: false}) 
            : new http.Agent({keepAlive: false});
    } catch(e) { 
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
            agent,
            timeout: 15000
        }), 3, 300);
        
        if (!res.ok) {
            const text = await res.text().catch(() => '<no body>');
            console.error(`[${screenId}] notify failed:`, res.status, text);
        } else {
            console.log(`[${screenId}] notify sent for movie ${movieId}`);
        }
    } catch(e) { 
        console.error(`[${screenId}] notify error:`, e.stack || e); 
    }
}

// 🔧 修正: ブラウザを再利用し、新しいページを開いて使い回す
async function checkPrivateLive(screenId){
    const url = `https://twitcasting.tv/${screenId}/movie/latest`;
    let page;
    try{
        const browser = await getSharedBrowser();
        page = await browser.newPage();
        
        // 🔧 ディスク書き込みを最小限に抑える設定
        await page.setCacheEnabled(false);
        
        // リクエストをフィルタリング（不要なリソースをブロック）
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            // 画像、CSS、フォント、メディアをブロック（HTMLとJSのみ許可）
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        await retryAsync(async()=>{ 
            await page.goto(url, {waitUntil:'domcontentloaded', timeout:60000}); 
            await new Promise(r=>setTimeout(r,2000)); 
        }, 3, 500);
        
        const isPrivate = await page.$eval('.tw-empty-state-text', el=>el.textContent.includes('合言葉')).catch(()=>false);
        const isLiveBadge = await page.$eval('.tw-movie-thumbnail2-badge[data-status="live"]', ()=>true).catch(()=>false);
        
        return isPrivate && isLiveBadge;
    } catch(e) { 
        console.error(`[${screenId}] checkPrivateLive error:`, e.stack || e); 
        return false; 
    } finally { 
        // ブラウザは閉じず、ページだけ閉じる
        if (page) {
            try {
                await page.close();
            } catch (e) {
                console.warn(`[${screenId}] Failed to close page:`, e.message);
            }
        }
    }
}

function startWatcher(screenId, intervalMs=CHECK_INTERVAL_MS){
    if (!screenId) {
        console.warn('[TwitCasting] startWatcher called with empty screenId — skipping');
        return;
    }

    console.log(`[TwitCasting] ${screenId} の監視開始 (間隔: ${intervalMs/1000}秒)`);

    let running = false;

    const loop = async () => {
        if (running) return;
        running = true;
        try {
            await checkLiveStatus(screenId);
        } catch (e) {
            console.error(`[${screenId}] watcher error:`, e && (e.stack || e.message) ? (e.stack || e.message) : e);
        } finally {
            running = false;
        }

        const t = setTimeout(loop, intervalMs);
        if (t && typeof t.unref === 'function') t.unref();
    };

    loop();
}

async function checkLiveStatus(screenId){
    if (!screenId) {
        console.warn('[checkLiveStatus] empty screenId provided');
        return null;
    }

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

        if (movie) {
            const isLiveFlag = movie.status === 'live' || movie.is_live === true;
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

                if (movie.id !== prevLiveId) {
                    currentLiveId = movie.id;
                    lastLiveStatus.set(screenId, currentLiveId);
                    console.log(`🔴 Live started! movie_id: ${currentLiveId}`);

                    const notifyTitle = '【ツイキャス】ライブ開始';
                    const notifyBody  = observedTitle;

                    console.log(`[Notify Preview] screenId=${screenId}, movieId=${currentLiveId}, title="${notifyTitle}", body="${notifyBody}"`);

                    try {
                        await sendNotify(screenId, currentLiveId, notifyTitle, notifyBody);
                    } catch (e) {
                        console.error(`[${screenId}] sendNotify error:`, e && (e.stack || e.message) ? (e.stack || e.message) : e);
                    }
                } else {
                    lastLiveStatus.set(screenId, movie.id);
                }
                return movie.id;
            } else {
                console.log(`[${screenId}] API returned movie but not confirmed live (status=${movie.status}, is_live=${movie.is_live}, started_ok=${startedOk})`);
            }
        } else {
            console.log(`[${screenId}] API returned no movies`);
        }

        const isPrivate = await checkPrivateLive(screenId);
        if (isPrivate) {
            console.log(`[${screenId}] Polling Result: 🔒 Private Live detected (via Puppeteer)`);
            if (prevLiveId !== 'private') {
                currentLiveId = 'private';
                lastLiveStatus.set(screenId, 'private');
                console.log('🔒 プライベートライブ中！');

                const notifyTitle = '【ツイキャス】プライベートライブ';
                const notifyBody  = '(合言葉あり)';

                console.log(`[Notify Preview] screenId=${screenId}, movieId=private, title="${notifyTitle}", body="${notifyBody}"`);

                try {
                    await sendNotify(screenId, 'private', notifyTitle, notifyBody);
                } catch (e) {
                    console.error(`[${screenId}] sendNotify error:`, e && (e.stack || e.message) ? (e.stack || e.message) : e);
                }
            }
            return 'private';
        }

        if (prevLiveId !== null) {
            console.log(`[${screenId}] Polling Result: ⚪ Offline (No public or private live detected). previous=${prevLiveId}`);
        } else {
            console.log(`[${screenId}] Polling Result: ⚪ Offline (No public or private live detected)`);
        }
        lastLiveStatus.set(screenId, null);
        return null;

    } catch (e) {
        const msg = e && (e.message || e.stack) || String(e);
        console.error(`[${screenId}] checkLiveStatus error:`, msg);
        console.log(`[${screenId}] Polling Result: ⚠️ Error occurred`);
        return null;
    }
}

module.exports = { checkLiveStatus, startWatcher, sendNotify, checkPrivateLive };


