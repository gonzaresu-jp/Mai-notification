// main.js - 起動専用版(改良版 + notifyConfig 注入 + listen修正)
require('dotenv').config({ path: '/var/www/html/mai-push/.env' });
const path = require('path');
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const youtube = require('./youtube');
const youtubeCommunity = require('./ytcommunity');
const { startBilibiliWatcher } = require('./bilibili-live');
const { startBilibiliDynamicWatcher } = require('./bilibili-dynamic');
const twitcasting = require('./twitcasting');
const twitter = require('./twitter');
const fanbox = require('./fanbox');
const MilestoneScheduler = require('./milestone');
const gipt = require('./gipt');
const { startTwitchPolling } = require('./twitch');
const { closeAllBrowsers } = require('./browser');
const discordAlert = require('./discord-alert');

// 致命的なクラッシュの監視を開始
discordAlert.attachGlobalCrashHandlers();

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const YT_WEBHOOK_PORT = process.env.YT_WEBHOOK_PORT ? Number(process.env.YT_WEBHOOK_PORT) : 3001;
const LOCAL_API_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null;
const MONITOR_TWITTER = ['koinoyamai17', 'koinoya_mai'];

let started = false;
let server = null;
let milestoneScheduler = null;
let db = null;

// --- VAPID 設定読み込み ---
let vapidConfig = null;
try {
  const vapidPath = path.join(__dirname, 'vapid.json');
  if (fs.existsSync(vapidPath)) {
    const raw = fs.readFileSync(vapidPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.vapidPublicKey) {
      vapidConfig = parsed;
      console.log('VAPID 設定読み込み完了');
    } else {
      console.warn('vapid.json に必要なキーがありません。マイルストーン通知は無効です。');
    }
  } else {
    console.warn('vapid.json が見つかりません。マイルストーン通知は無効です。');
  }
} catch (err) {
  console.error('vapid.json の読み込み/パースに失敗しました:', err && err.message ? err.message : err);
}

// --- API (モジュールからの POST を受ける) ---
app.post('/api/notify', (req, res) => {
  if (LOCAL_API_TOKEN) {
    const token = (req.headers['x-local-api-token'] || req.headers['x-notify-token'] || req.body?.token);
    if (!token || token !== LOCAL_API_TOKEN) {
      console.warn('Unauthorized /api/notify attempt');
      return res.status(401).send('Unauthorized');
    }
  }
  console.log('[API通知] 受信:', req.body);
  res.status(200).send('OK');
});


// Puppeteer の SingletonLock 一括クリーンアップ
function cleanupPuppeteerLocks() {
  const dirs = [
    '/dev/shm/puppeteer-profile-fanbox',
    '/dev/shm/puppeteer-profile-gipt',
    '/dev/shm/puppeteer-profile-twitcasting',
    '/var/lib/mai-push/puppeteer-profile',
  ];
  const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const dir of dirs) {
    for (const lock of locks) {
      const p = path.join(dir, lock);
      try { fs.unlinkSync(p); console.log(`[Cleanup] Removed ${p}`); } catch (_) { /* なければ無視 */ }
    }
  }
}

// 起動処理
async function main() {
  if (started) return;
  started = true;

  cleanupPuppeteerLocks();

  // データベース初期化
  const dbPath = path.join(__dirname, 'data.db');
  db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS scraper_status (
      id TEXT PRIMARY KEY,
      name TEXT,
      last_run DATETIME,
      status TEXT,
      message TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('scraper_status table init error (main):', err.message);
      else console.log('scraper_status table ensured (main)');
    });
  });

  // 通知設定を一元化して注入
  const notifyConfig = {
    token: LOCAL_API_TOKEN,
    hmacSecret: process.env.NOTIFY_HMAC_SECRET || null,
    apiUrl: process.env.NOTIFY_API_URL || `http://localhost:${PORT}/api/notify`,
    notifyFn: async (payload) => {
      try {
        const bodyString = JSON.stringify(payload || {});
        const headers = {
          'Content-Type': 'application/json',
          'X-Notify-Token': LOCAL_API_TOKEN || ''
        };

        if (process.env.NOTIFY_HMAC_SECRET) {
          const hmac = crypto.createHmac('sha256', process.env.NOTIFY_HMAC_SECRET);
          hmac.update(bodyString);
          headers['X-Signature'] = `sha256=${hmac.digest('hex')}`;
        }

        await axios.post(process.env.NOTIFY_API_URL || `http://localhost:${PORT}/api/notify`, payload, {
          headers,
          timeout: 8000
        });
      } catch (e) {
        console.error('notifyFn failed:', e?.message || e);
      }
    }
  };

  const sendNotifyApi = async (payload) => {
    try {
      const bodyString = JSON.stringify(payload || {});
      const headers = {
        'Content-Type': 'application/json',
        'X-Notify-Token': notifyConfig.token || ''
      };

      if (notifyConfig.hmacSecret) {
        const hmac = crypto.createHmac('sha256', notifyConfig.hmacSecret);
        hmac.update(bodyString);
        headers['X-Signature'] = `sha256=${hmac.digest('hex')}`;
      }

      await axios.post(notifyConfig.apiUrl, payload, {
        headers,
        timeout: 8000
      });
      return true;
    } catch (e) {
      console.error('notify failed:', e?.message || e);
      return false;
    }
  };

  const sendStatusUpdate = async (id, name, status, message = null) => {
    if (!db) return;
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO scraper_status (id, name, last_run, status, message, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         last_run = excluded.last_run,
         status = excluded.status,
         message = excluded.message,
         updated_at = excluded.updated_at`,
      [id, name, now, status, message, now],
      (err) => {
        if (err) console.error(`[StatusReport] Direct DB write failed for ${id}:`, err.message);
        
        // エラー状態になった場合、Discordへ通知を飛ばす
        if (status === 'error') {
           discordAlert.sendDiscordAlert(
             `🚨 スクレイパー異常発生: ${name}`,
             `システムコンポーネント **${name}** でエラーが発生しました。\n\n**詳細:**\n\`\`\`\n${message || '不明なエラー'}\n\`\`\``,
             'ERROR',
             `scraper_error_${id}` // スパム防止のため、同じIDのエラーはレート制限
           );
        }
      }
    );
  };

// --- Twitch 設定 ---
  const twitchConfig = {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET, // ★追加
    appAccessToken: process.env.TWITCH_APP_ACCESS_TOKEN,
    twitchUrl: process.env.TWITCH_URL || 'https://www.twitch.tv/koinoya_mai',
    notifyConfig,
    interval: 1000, // ★1秒間隔に設定
  };


  console.log('ADMIN_NOTIFY_TOKEN:', process.env.ADMIN_NOTIFY_TOKEN);
  console.log("Worker notify token:", notifyConfig.token);
  console.log('notifyConfig.token (masked):', notifyConfig.token ? `${notifyConfig.token.slice(0,8)}...` : 'null');

  // ✅ HTTP サーバー起動 (1回だけ)
  server = app.listen(PORT, () => {
    console.log(`APIサーバー 起動 on port ${PORT}`);
  });

  // ✅ テスト通知 (必要に応じてコメント解除)
  /*
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (notifyConfig.token) {
    try {
      const payload = {
        data: {
          title: 'テスト通知',
          body: '通知が届くか確認',
          url: 'https://example.com',
          icon: 'https://example.com/icon.png'
        },
        type: 'test',
        settingKey: 'test'
      };

      const fetch = global.fetch || (await import('node-fetch')).then(mod => mod.default);

      console.log('[DEBUG] Sending test notification to:', notifyConfig.apiUrl);
      console.log('[DEBUG] Token (first 10):', notifyConfig.token.substring(0, 10));

      const res = await fetch(notifyConfig.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Notify-Token': notifyConfig.token.trim()
        },
        body: JSON.stringify(payload)
      });

      const responseText = await res.text();
      console.log('[DEBUG] notify API response:', res.status);
      console.log('[DEBUG] notify API body:', responseText);
    } catch (err) {
      console.error('[DEBUG] notify API error:', err);
    }
  }
  */

  // 各モジュールに init があれば注入
  try { if (typeof youtube.init === 'function') youtube.init(notifyConfig); } catch(e){ console.error('youtube.init err', e && e.message ? e.message : e); }
  try { if (typeof youtubeCommunity.init === 'function') youtubeCommunity.init(notifyConfig); } catch(e){ console.error('youtubeCommunity.init err', e && e.message ? e.message : e); }

  try { if (typeof twitcasting.init === 'function') twitcasting.init(notifyConfig); } catch(e){ console.error('twitcasting.init err', e && e.message ? e.message : e); }
  try { if (typeof twitter.init === 'function') twitter.init(notifyConfig); } catch(e){ console.error('twitter.init err', e && e.message ? e.message : e); }
  try { if (typeof fanbox.init === 'function') fanbox.init(notifyConfig); } catch(e){ console.error('fanbox.init err', e && e.message ? e.message : e); }
  try {
  if (typeof gipt.init === 'function') {
    gipt.init({
      statePath: path.join(__dirname, 'gipt_state.json'),
      debugDir: path.join(__dirname, 'gipt_debug'),
      notifyFn: async (payload) => {
        const fetch = global.fetch || (await import('node-fetch')).then(m => m.default);
        const res = await fetch(notifyConfig.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Notify-Token': notifyConfig.token
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`notify api failed: ${res.status} ${await res.text()}`);
      }
    });
    console.log('gipt.init 完了');
  }
} catch (e) {
  console.error('gipt.init err', e && e.message ? e.message : e);
}

  const startPromises = [];

  // YouTube webhook 起動
 try {
  if (typeof youtube.startWebhook === 'function') {
   startPromises.push(
    (async () => {
     try {
      await youtube.startWebhook(YT_WEBHOOK_PORT);
      console.log(`YouTube webhook 起動 on ${YT_WEBHOOK_PORT}`);

      // ★★★ 起動直後の初回購読リクエストを追加 ★★★
      if (typeof youtube.subscribeAllChannels === 'function') {
       await youtube.subscribeAllChannels();
       console.log('✅ YouTube チャンネルの初回購読リクエストを送信しました。');
      }
      // ★★★ 追加ここまで ★★★

     } catch (e) {
      console.error('YouTube webhook 起動エラー:', e && e.message ? e.message : e);
      throw e;
     }
    })()
   );
  } else {
   console.log('youtube.startWebhook 未定義。');
  }
 } catch (e) {
  console.error('YouTube 起動ハンドルエラー:', e);
 }

// youtubeCommunity
// 監視対象 YouTube ハンドル
const MONITOR_YT_COMMUNITY = ['@koinoyamaich', '@koinoyamaisub'];

// モジュール初期化（保存先と自動保存を設定）
youtubeCommunity.init({
  filePath: path.join(__dirname, 'data', 'community.json'),
  autoSave: true
});

if (typeof youtubeCommunity.pollAndNotify === 'function') {
  startPromises.push(
    (async () => {

      const intervalMs = 5 * 60 * 1000; // ★ 5分

      const run = async () => {
        for (const handle of MONITOR_YT_COMMUNITY) {
          try {
            await youtubeCommunity.pollAndNotify(handle);
          } catch (e) {
            console.error(`[${handle}] poll error:`, e?.message || e);
          }
        }
      };

      await sendStatusUpdate('youtube_community', 'YouTube Community', 'running');
      await run(); // 起動直後1回
      await sendStatusUpdate('youtube_community', 'YouTube Community', 'success');

      const schedule = async () => {
        await sendStatusUpdate('youtube_community', 'YouTube Community', 'running');
        await run();
        await sendStatusUpdate('youtube_community', 'YouTube Community', 'success');
        const t = setTimeout(schedule, intervalMs);
        if (t && typeof t.unref === 'function') t.unref();
      };

      const t = setTimeout(schedule, intervalMs);
      if (t && typeof t.unref === 'function') t.unref();

      console.log(`YouTube Community polling 起動 (${intervalMs/60000} min)`);

    })()
  );
}

// 💡 新しい TwitCasting サーバーの起動
if (typeof twitcasting.startTwitcastingServer === 'function') {
    startPromises.push(
      (async () => {
        try {
          await twitcasting.startTwitcastingServer(3002); // ポート3002で独立起動
          console.log('TwitCasting API init 完了');

          // ✅ ポーリング開始（プライベート配信も対応）
          if (typeof twitcasting.startPolling === 'function') {
            await sendStatusUpdate('twitcasting_polling', 'TwitCasting Polling', 'running');
            twitcasting.startPolling('@c:koinoya_mai', 10); // 30秒間隔
            console.log('TwitCasting polling 起動');
            await sendStatusUpdate('twitcasting_polling', 'TwitCasting Polling', 'success');
          }
        } catch (e) {
          console.error('TwitCasting API init 起動エラー:', e);
          throw e;
        }
      })()
    );
}

  // TwitCasting 初期化
  if (typeof twitcasting.initTwitcastingApi === 'function') {
    startPromises.push(
      (async () => {
        try {
          await twitcasting.initTwitcastingApi();
          console.log('TwitCasting API init 完了');
        } catch (e) {
          console.error('TwitCasting API init 起動エラー:', e && e.message ? e.message : e);
          throw e;
        }
      })()
    );
  }

  // Twitter watchers
  if (typeof twitter.startWatcher === 'function') {
    startPromises.push(
      (async () => {
        const results = [];
        for (const u of MONITOR_TWITTER) {
          try {
            const id   = `twitter_${u}`;
            const name = `Twitter (@${u})`;

            // ポーリングループを main.js 側で管理し、毎回ステータスを更新する
            const poll = async () => {
              await sendStatusUpdate(id, name, 'running');
              try {
                const r = await twitter.check ? twitter.check(u) : null;
                if (r && r.error) {
                  await sendStatusUpdate(id, name, 'error', String(r.error));
                } else {
                  await sendStatusUpdate(id, name, 'success');
                }
              } catch (e) {
                await sendStatusUpdate(id, name, 'error', e?.message || String(e));
              }
            };

            // 起動直後に1回 + その後は intervalMs ごとに繰り返す
            await poll();
            const t = setInterval(poll, 60 * 1000);
            if (t && typeof t.unref === 'function') t.unref();

            results.push({ user: u, status: 'ok' });
            console.log(`twitter watcher (${u}) 起動`);
          } catch (err) {
            console.error(`twitter watcher (${u}) error:`, err?.message || err);
            results.push({ user: u, status: 'error', error: err });
            await sendStatusUpdate(`twitter_${u}`, `Twitter (@${u})`, 'error', err?.message || String(err));
          }
        }
        return results;
      })()
    );
  }

  // Twitch
  if (typeof startTwitchPolling === 'function') {
    startPromises.push(
      (async () => {
        try {
          await sendStatusUpdate('twitch', 'Twitch', 'running');
          startTwitchPolling(twitchConfig); // ここは内部で setTimeout するだけなので await 不要なはず
          console.log('Twitch polling 起動 (10s interval)');
          await sendStatusUpdate('twitch', 'Twitch', 'success');
        } catch (e) {
          console.error('Twitch polling 起動エラー:', e.message);
          await sendStatusUpdate('twitch', 'Twitch', 'error', e.message);
        }
      })()
    );
  }


  // main の startPromises 構築部分の適切な場所（例えば Twitter watchers の後）に追加
const MONITOR_TWITCASTING = ['c:koinoya_mai']; // 監視したい screenId を列挙

if (typeof twitcasting.startWatcher === 'function') {
  startPromises.push((async () => {
    const results = [];
    for (const s of MONITOR_TWITCASTING) {
      try {
        await sendStatusUpdate(`twitcasting_watcher_${s}`, `TwitCasting (@${s})`, 'running');
        // twitcasting.startWatcher(screenId, intervalMs)
        twitcasting.startWatcher(s, 5 * 1000); // 30秒間隔でポーリング
        results.push({ screen: s, status: 'ok' });
        console.log(`twitcasting.startWatcher(${s}) 起動`);
        await sendStatusUpdate(`twitcasting_watcher_${s}`, `TwitCasting (@${s})`, 'success');
      } catch (err) {
        console.error(`twitcasting.startWatcher(${s}) error:`, err && err.message ? err.message : err);
        results.push({ screen: s, status: 'error', error: err });
        await sendStatusUpdate(`twitcasting_watcher_${s}`, `TwitCasting (@${s})`, 'error', err?.message || String(err));
      }
    }
    return results;
  })());
} else {
  console.log('twitcasting.startWatcher 未定義。');
}


// bilibili
if (typeof startBilibiliWatcher === 'function' && process.env.BILIBILI_ROOM_ID) {
  startPromises.push((async () => {
    try {
      await sendStatusUpdate('bilibili_live', 'Bilibili Live', 'running');
      startBilibiliWatcher({
        roomId: process.env.BILIBILI_ROOM_ID,
        onLiveStart: async () => {
          console.log('[Notify] bilibili live start detected');
          const payload = {
            type: 'bilibili',
            settingKey: 'bilibili',
            data: {
              title: 'まいちゃん配信開始',
              body: '',
              url: `https://live.bilibili.com/${process.env.BILIBILI_ROOM_ID}`,
              icon: './icon.webp'
            }
          };
          await sendNotifyApi(payload);
        }
      });
      console.log('Bilibili live watcher 起動');
      await sendStatusUpdate('bilibili_live', 'Bilibili Live', 'success');
    } catch (e) {
      console.error('Bilibili live 起動エラー:', e && e.message ? e.message : e);
      await sendStatusUpdate('bilibili_live', 'Bilibili Live', 'error', e?.message || String(e));
    }
  })());
} else {
  console.log('Bilibili live: BILIBILI_ROOM_ID 未設定 または startBilibiliWatcher 未定義');
}
// bilibili dynamic
if (typeof startBilibiliDynamicWatcher === 'function') {
  startPromises.push((async () => {
    try {
      await sendStatusUpdate('bilibili_dynamic', 'Bilibili Dynamic', 'running');
      const started = startBilibiliDynamicWatcher({
        uid: process.env.BILI_UID,
        notifyConfig
      });
      if (started) {
        console.log('Bilibili Dynamic polling 起動');
        await sendStatusUpdate('bilibili_dynamic', 'Bilibili Dynamic', 'success');
      } else {
        console.log('Bilibili Dynamic: BILI_COOKIE 未設定のためスキップ');
        await sendStatusUpdate('bilibili_dynamic', 'Bilibili Dynamic', 'error', 'BILI_COOKIE not set');
      }
    } catch (e) {
      console.error('Bilibili Dynamic 起動エラー:', e && e.message ? e.message : e);
      await sendStatusUpdate('bilibili_dynamic', 'Bilibili Dynamic', 'error', e?.message || String(e));
      throw e;
    }
  })());
} else {
  console.log('bilibili-dynamic 未定義。');
}
  // Fanbox
  try {
    if (typeof fanbox.startPolling === 'function') {
      startPromises.push(
        (async () => {
          try {
            await sendStatusUpdate('fanbox', 'pixiv FANBOX', 'running');
            fanbox.startPolling(60 * 1000);
            console.log('Fanbox polling 起動');
            await sendStatusUpdate('fanbox', 'pixiv FANBOX', 'success');
          } catch (e) {
            console.error('Fanbox 起動エラー:', e && e.message ? e.message : e);
            await sendStatusUpdate('fanbox', 'pixiv FANBOX', 'error', e?.message || String(e));
            throw e;
          }
        })()
      );
    } else {
      console.log('Fanbox モジュールロード(内部で setInterval する実装かもしれません)');
    }
  } catch (e) {
    console.error('Fanbox watcher 起動エラー:', e && e.message ? e.message : e);
  }

/*
  // Gipt
startPromises.push((async () => {
  try {
    await sendStatusUpdate('gipt', 'Gipt', 'running');
    // 起動時に一回
    await gipt.pollAndNotify({ waitMs: 1200 });
    console.log('Gipt poll 初回実行 完了');
    await sendStatusUpdate('gipt', 'Gipt', 'success');

    // 以降は定期実行（例: 60秒）
    setInterval(async () => {
      try {
        await sendStatusUpdate('gipt', 'Gipt', 'running');
        await gipt.pollAndNotify({ waitMs: 1200 });
        await sendStatusUpdate('gipt', 'Gipt', 'success');
      } catch (e) {
        console.error('Gipt poll error:', e && e.message ? e.message : e);
        await sendStatusUpdate('gipt', 'Gipt', 'error', e?.message || String(e));
      }
    }, 5 * 1000).unref();

    console.log('Gipt polling 起動 (5s)');
  } catch (e) {
    console.error('Gipt 起動エラー:', e && e.message ? e.message : e);
    await sendStatusUpdate('gipt', 'Gipt', 'error', e?.message || String(e));
    throw e;
  }
})());
*/

  // マイルストーンスケジューラー起動
  try {
    if (vapidConfig && vapidConfig.vapidPublicKey && vapidConfig.vapidPublicKey !== 'test-key') {
      await sendStatusUpdate('milestone', 'Milestone Scheduler', 'running');
      const dbPath = path.join(__dirname, 'data.db');
      milestoneScheduler = new MilestoneScheduler(dbPath, vapidConfig);
      if (typeof milestoneScheduler.start === 'function') {
        milestoneScheduler.start();
        console.log('マイルストーン通知スケジューラー 起動');
        await sendStatusUpdate('milestone', 'Milestone Scheduler', 'success');
      } else {
        console.warn('MilestoneScheduler.start 未定義');
        await sendStatusUpdate('milestone', 'Milestone Scheduler', 'error', 'start method missing');
      }
    } else {
      console.warn('VAPID 未設定のためマイルストーン通知は無効');
    }
  } catch (e) {
    console.error('マイルストーン通知スケジューラー起動エラー:', e && e.message ? e.message : e);
    await sendStatusUpdate('milestone', 'Milestone Scheduler', 'error', e?.message || String(e));
  }

  // 全起動タスクの結果を集約
  try {
    const settled = await Promise.allSettled(startPromises);
    settled.forEach((s, i) => {
      if (s.status === 'rejected') {
        console.error(`start task ${i} rejected:`, s.reason);
      } else {
        console.log(`start task ${i} fulfilled`);
      }
    });
  } catch (e) {
    console.error('起動タスク集約中にエラー:', e && e.message ? e.message : e);
  }
  // ▼▼▼ YouTube 購読 自動更新スケジューラーの追加 ▼▼▼
  if (typeof youtube.subscribeAllChannels === 'function') {
    // 毎日午前 3:00 に実行する
    // 構文: '分 時 日 月 曜日' -> '0 3 * * *'
    cron.schedule('0 3 * * *', async () => {
      console.log('[Cron] YouTube購読の自動更新を開始します...');
      await sendStatusUpdate('youtube_webhook', 'YouTube Webhook', 'running');
      try {
        await youtube.subscribeAllChannels();
        console.log('✅ [Cron] YouTube購読の自動更新が完了しました。');
        await sendStatusUpdate('youtube_webhook', 'YouTube Webhook', 'success');
      } catch (e) {
        console.error('❌ [Cron] YouTube購読の自動更新中にエラー:', e && e.message ? e.message : e);
        await sendStatusUpdate('youtube_webhook', 'YouTube Webhook', 'error', e?.message || String(e));
      }
    });
    console.log('✅ YouTube購読自動更新スケジューラー起動 (毎日 3:00)');
  } else {
    console.warn('⚠️ youtube.subscribeAllChannels 関数が定義されていません。自動更新は無効です。');
  }
}

// 優雅なシャットダウン
async function shutdown(signal) {
  console.log(`Shutting down due to ${signal}`);
  try {
    if (milestoneScheduler && typeof milestoneScheduler.stop === 'function') {
      await milestoneScheduler.stop();
      console.log('MilestoneScheduler stopped');
    }
  } catch (e) {
    console.error('MilestoneScheduler stop エラー:', e && e.message ? e.message : e);
  }

  try {
    console.log('Closing all browsers in pool...');
    await closeAllBrowsers();
  } catch (e) {
    console.error('closeAllBrowsers エラー:', e && e.message ? e.message : e);
  }

  try {
    if (server) {
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => {
        console.warn('Forcing shutdown');
        process.exit(1);
      }, 5000).unref();
    } else {
      process.exit(0);
    }
  } catch (e) {
    console.error('シャットダウン中のエラー:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err && err.stack ? err.stack : err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

main().catch((e) => {
  console.error('main 起動エラー:', e && e.message ? e.message : e);
  process.exit(1);
});

module.exports = { start: main, app };



