// main.js - 起動専用版（モジュールが通知送信を行う運用を前提）
const youtube = require('./youtube');
const youtubeCommunity = require('./ytcommunity');
const bilibiliVideo = require('./bilibiliVideo');
const bilibiliDynamic = require('./bilibiliDynamic');
const twitcasting = require('./twitcasting');
const twitter = require('./twitter');
const fanbox = require('./fanbox');
const axios = require('axios');
// const express = require('express'); // 削除
// const bodyParser = require('body-parser'); // 削除

const LOCAL_API_URL = 'http://localhost:8080/api/notify';
const MONITOR_TWITTER = ['koinoyamai17', 'koinoya_mai'];
let started = false;

// --- Express API サーバー（モジュールからの POST を受ける） ---
// const app = express(); // 削除
// app.use(bodyParser.json()); // 削除
// app.post('/api/notify', (req, res) => { // 削除
//   console.log('[API通知] 受信:', req.body); // 削除
//   res.status(200).send('OK'); // 削除
// }); // 削除
// const PORT = 8080; // 削除
// app.listen(PORT, () => console.log(`APIサーバー 起動 on port ${PORT}`)); // 削除

// --- NOTE ---
// 遅延回避のため、ここでは各モジュールの startWatcher() を起動するのみ。
// モジュールが内部で通知を送るので main は再送しない。
// Bilibili 系など main 側でポーリングしたいモジュールがあれば別途 createRunner を追加する。

async function main() {
  if (started) return;
  started = true;

  // YouTube webhook（モジュールが受信して /api/notify に投げる実装を前提）
  try {
    // YouTube Webhookは別ポートで動く（3001）ため問題ない
    youtube.startWebhook(3001);
  } catch (e) {
    console.error('YouTube webhook 起動エラー:', e && e.message ? e.message : e);
  }
  
  youtubeCommunity.startPolling();

  // TwitCasting: モジュール内で startWatcher が通知送信を行う前提で起動のみ
  try {
    // 古い twitcasting.startWatcher(10 * 1000); を削除
    if (typeof twitcasting.initTwitcastingApi === 'function') {
        // トークンがあればWebhook購読を試みる
        twitcasting.initTwitcastingApi(); 
    }
  } catch (e) {
    console.error('TwitCasting API init 起動エラー:', e && e.message ? e.message : e);
  }

  // Twitter: モジュール内で startWatcher が通知送信を行う前提で起動のみ
  try {
    if (typeof twitter.startWatcher === 'function') {
      MONITOR_TWITTER.forEach(u => {
        try {
          twitter.startWatcher(u, 60 * 1000); // 60s
        } catch (err) {
          console.error(`twitter.startWatcher(${u}) error:`, err && err.message ? err.message : err);
        }
      });
    }
  } catch (e) {
    console.error('Twitter watcher 起動エラー:', e && e.message ? e.message : e);
  }

  // Bilibili 系はモジュール実装に依存。もし bilibili*.startWatcher が存在するなら起動する。
  try {
    if (typeof bilibiliVideo.startWatcher === 'function') {
      bilibiliVideo.startWatcher(5 * 60 * 1000); // 5分
    } else {
      // 代替: mainで定期実行したいならここで createRunner を作る実装に替える
      console.log('bilibiliVideo.startWatcher 未定義。main でのポーリングは未実装。');
    }
  } catch (e) {
    console.error('bilibiliVideo watcher 起動エラー:', e && e.message ? e.message : e);
  }

  try {
    if (typeof bilibiliDynamic.startWatcher === 'function') {
      bilibiliDynamic.startWatcher(60 * 1000); // 60s
    } else {
      console.log('bilibiliDynamic.startWatcher 未定義。main でのポーリングは未実装。');
    }
  } catch (e) {
    console.error('bilibiliDynamic watcher 起動エラー:', e && e.message ? e.message : e);
  }
}

// fanbox
try {
  if (typeof fanbox.startPolling === 'function') {
    fanbox.startPolling(60 * 1000); // 1分ごとにチェック
  } else {
    // fanbox-webhook.jsの場合、単に require しただけで setInterval が走る
    console.log('Fanbox polling module loaded.');
  }
} catch (e) {
  console.error('Fanbox watcher 起動エラー:', e && e.message ? e.message : e);
}


// 起動
main().catch(console.error);

// エクスポート（テスト等で main を呼べるように）
module.exports = { start: main };
