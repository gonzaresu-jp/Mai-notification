// main.js - 起動専用版(改良版 + notifyConfig 注入 + listen修正)
require('dotenv').config({ path: '/var/www/html/mai-push/.env' });
const path = require('path');
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');

const youtube = require('./youtube');
const youtubeCommunity = require('./ytcommunity');
const bilibiliVideo = require('./bilibiliVideo');
const bilibiliDynamic = require('./bilibiliDynamic');
const twitcasting = require('./twitcasting');
const twitter = require('./twitter');
const fanbox = require('./fanbox');
const MilestoneScheduler = require('./milestone');
const gipt = require('./gipt');
const { startTwitchPolling } = require('./twitch');

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const YT_WEBHOOK_PORT = process.env.YT_WEBHOOK_PORT ? Number(process.env.YT_WEBHOOK_PORT) : 3001;
const LOCAL_API_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null;
const MONITOR_TWITTER = ['koinoyamai17', 'koinoya_mai'];

let started = false;
let server = null;
let milestoneScheduler = null;

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
      console.warn('vapid.json に必要なキーがありません。マイルストーン通知は無効化されます。');
    }
  } else {
    console.warn('vapid.json が存在しないためマイルストーン通知は無効化されています。');
  }
} catch (err) {
  console.error('vapid.json の読み込み/パースに失敗しました:', err && err.message ? err.message : err);
}

// --- API (モジュールからの POST を受ける) ---
// 既存の /api/notify の先頭付近を次に置き換え
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


// 起動処理
async function main() {
  if (started) return;
  started = true;

  // 通知設定を一元化して注入
  const notifyConfig = {
    token: LOCAL_API_TOKEN,
    hmacSecret: process.env.NOTIFY_HMAC_SECRET || null,
    apiUrl: process.env.NOTIFY_API_URL || `http://localhost:${PORT}/api/notify`,
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
  try { if (typeof bilibiliVideo.init === 'function') bilibiliVideo.init(notifyConfig); } catch(e){ console.error('bilibiliVideo.init err', e && e.message ? e.message : e); }
  try { if (typeof bilibiliDynamic.init === 'function') bilibiliDynamic.init(notifyConfig); } catch(e){ console.error('bilibiliDynamic.init err', e && e.message ? e.message : e); }
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
youtubeCommunity.init({ filePath: path.join(__dirname, 'data', 'community.json'), autoSave: true });

if (typeof youtubeCommunity.startPolling === 'function') {
  startPromises.push(
    (async () => {
      try {
        for (const handle of MONITOR_YT_COMMUNITY) {
          // チャンネルページを取得して抽出・保存まで行う（fetchPostsFromHandleAndSave は parse + save を行う想定）
          const result = await youtubeCommunity.fetchPostsFromHandleAndSave(handle.replace(/^@/, '')); // モジュールは handle を素の名前で期待する場合を考慮

          // 結果のログ
          const posts = result?.posts || [];
          const saveResult = result?.saveResult || null;
          console.log(`[${handle}] 抽出ポスト数:`, posts.length, '保存結果:', saveResult);

          // 通知送信（API が存在する・トークンがある・かつ通知すべきデータがある場合）
          if (notifyConfig.token && (posts.length > 0 || (saveResult && saveResult.addedCount > 0))) {
            const fetch = global.fetch || (await import('node-fetch')).then(mod => mod.default);
            const payload = {
              type: 'ytcommunity',
              channel: handle,
              data: {
                posts,           // 抽出した生データ（配列）
                saveResult       // 保存の成否・追加件数など
              }
            };

            await fetch(notifyConfig.apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Notify-Token': notifyConfig.token
              },
              body: JSON.stringify(payload)
            });

            console.log(`[${handle}] 通知送信完了 (added:${saveResult?.addedCount ?? 0})`);
          }
        }
      } catch (e) {
        console.error('youtubeCommunity 起動エラー:', e && e.message ? e.message : e);
        throw e;
      }
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
            twitcasting.startPolling('@c:koinoya_mai', 10); // 30秒間隔
            console.log('TwitCasting polling 起動');
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
            const r = twitter.startWatcher(u, 60 * 1000);
            if (r && typeof r.then === 'function') {
              await r;
            }
            results.push({ user: u, status: 'ok' });
            console.log(`twitter.startWatcher(${u}) 起動`);
          } catch (err) {
            console.error(`twitter.startWatcher(${u}) error:`, err && err.message ? err.message : err);
            results.push({ user: u, status: 'error', error: err });
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
          await startTwitchPolling(twitchConfig); // configを渡す
          console.log('Twitch polling 起動 (1s interval)');
        } catch (e) {
          console.error('Twitch polling 起動エラー:', e.message);
          throw e;
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
        // twitcasting.startWatcher(screenId, intervalMs)
        twitcasting.startWatcher(s, 5 * 1000); // 30秒間隔でポーリング
        results.push({ screen: s, status: 'ok' });
        console.log(`twitcasting.startWatcher(${s}) 起動`);
      } catch (err) {
        console.error(`twitcasting.startWatcher(${s}) error:`, err && err.message ? err.message : err);
        results.push({ screen: s, status: 'error', error: err });
      }
    }
    return results;
  })());
} else {
  console.log('twitcasting.startWatcher 未定義。');
}


  // bilibili watchers
  if (typeof bilibiliVideo.startWatcher === 'function') {
    startPromises.push(
      (async () => {
        try {
          bilibiliVideo.startWatcher(5 * 60 * 1000);
          console.log('bilibiliVideo startWatcher 起動');
        } catch (e) {
          console.error('bilibiliVideo watcher 起動エラー:', e && e.message ? e.message : e);
          throw e;
        }
      })()
    );
  } else {
    console.log('bilibiliVideo.startWatcher 未定義。');
  }

  if (typeof bilibiliDynamic.startWatcher === 'function') {
    startPromises.push(
      (async () => {
        try {
          bilibiliDynamic.startWatcher(60 * 1000);
          console.log('bilibiliDynamic startWatcher 起動');
        } catch (e) {
          console.error('bilibiliDynamic watcher 起動エラー:', e && e.message ? e.message : e);
          throw e;
        }
      })()
    );
  } else {
    console.log('bilibiliDynamic.startWatcher 未定義。');
  }

  // Fanbox
  try {
    if (typeof fanbox.startPolling === 'function') {
      startPromises.push(
        (async () => {
          try {
            fanbox.startPolling(60 * 1000);
            console.log('Fanbox polling 起動');
          } catch (e) {
            console.error('Fanbox 起動エラー:', e && e.message ? e.message : e);
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
    // 起動時に一回
    await gipt.pollAndNotify({ waitMs: 1200 });
    console.log('Gipt poll 初回実行 完了');

    // 以降は定期実行（例: 60秒）
    setInterval(async () => {
      try {
        await gipt.pollAndNotify({ waitMs: 1200 });
      } catch (e) {
        console.error('Gipt poll error:', e && e.message ? e.message : e);
      }
    }, 5 * 1000).unref();

    console.log('Gipt polling 起動 (5s)');
  } catch (e) {
    console.error('Gipt 起動エラー:', e && e.message ? e.message : e);
    throw e;
  }
})());
*/

  // マイルストーンスケジューラー起動
  try {
    if (vapidConfig && vapidConfig.vapidPublicKey && vapidConfig.vapidPublicKey !== 'test-key') {
      const dbPath = path.join(__dirname, 'data.db');
      milestoneScheduler = new MilestoneScheduler(dbPath, vapidConfig);
      if (typeof milestoneScheduler.start === 'function') {
        milestoneScheduler.start();
        console.log('マイルストーン通知スケジューラー 起動');
      } else {
        console.warn('MilestoneScheduler.start 未定義');
      }
    } else {
      console.warn('VAPID 未設定のためマイルストーン通知は無効');
    }
  } catch (e) {
    console.error('マイルストーン通知スケジューラー起動エラー:', e && e.message ? e.message : e);
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
      try {
        await youtube.subscribeAllChannels();
        console.log('✅ [Cron] YouTube購読の自動更新が完了しました。');
      } catch (e) {
        console.error('❌ [Cron] YouTube購読の自動更新中にエラー:', e && e.message ? e.message : e);
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