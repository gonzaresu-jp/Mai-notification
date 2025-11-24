const express = require('express');
const bodyParser = require('body-parser');
const xml2js = require('xml2js');
const axios = require('axios');
const querystring = require('querystring'); // ★ 新しく追加

// xml2jsのPromise対応バージョンを取得
const { parseStringPromise } = require('xml2js'); 

// 監視対象チャンネルIDとコールバックURLを設定
// ※ Nginxのドメインとパスに合わせる
const CHANNEL_IDS = [
    'UCElHA6-5CBmgWODVWNxS8VA',
    'UCgttI8QfdWhvd3SRtCYcJzw'
];
const CALLBACK_URL = 'https://elza.poitou-mora.ts.net/youtube-webhook';
const PUBSUBHUBBUB_HUB = 'https://pubsubhubbub.appspot.com/subscribe';

// 通知設定（initで注入されることを想定）
let NOTIFY_CONFIG = {
    token: null,
    apiUrl: 'http://localhost:8080/api/notify',
    hmacSecret: null
};

const ICON_URL = 'https://elza.poitou-mora.ts.net/pushweb/icon.ico';
const RECENT_VIDEO_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * 外部のmain.jsから呼ばれる初期化関数
 * @param {object} config - 通知設定を含むオブジェクト
 */
function init(config) {
    NOTIFY_CONFIG = { ...NOTIFY_CONFIG, ...config };
    console.log('[YouTube] Notification config loaded.');
}


/**
 * 単一のチャンネルに対して購読リクエストを送信する
 * @param {string} channelId - 購読対象のYouTubeチャンネルID
 */
async function subscribeToChannel(channelId) {
    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

    // POSTで送信するデータ
    const data = querystring.stringify({
        'hub.mode': 'subscribe',
        'hub.topic': topicUrl,
        'hub.callback': CALLBACK_URL,
        'hub.verify': 'sync', // 同期検証を要求
        // 購読期限を最長に設定（なくてもGoogle側でデフォルト設定されるが明示的に指定）
        'hub.lease_seconds': 432000 // 5日間 (60*60*24*5)
    });

    try {
        const response = await axios.post(PUBSUBHUBBUB_HUB, data, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // Hubは通常、成功時に 204 No Content または 202 Accepted を返す
        if (response.status === 204 || response.status === 202) {
            console.log(`[YouTube Sub] ✅ 購読リクエスト成功: ${channelId}. 検証を待機中...`);
        } else {
            console.error(`[YouTube Sub] ❌ 購読リクエスト失敗 (${channelId}). Status: ${response.status}`);
        }
    } catch (error) {
        console.error(`[YouTube Sub] 致命的なエラー (${channelId}):`, error.message);
        // エラー詳細を確認するため、レスポンスがあれば出力
        if (error.response) {
            console.error('  Response Body:', error.response.data);
        }
    }
}

/**
 * すべての監視対象チャンネルに対して購読リクエストを送信する (自動更新用)
 */
async function subscribeAllChannels() {
    console.log('[YouTube Sub] 全チャンネルの購読リクエスト/更新を開始します...');
    const promises = CHANNEL_IDS.map(channelId => subscribeToChannel(channelId));
    
    // 全てのリクエストが完了するのを待つ
    await Promise.allSettled(promises);
    console.log('[YouTube Sub] 全チャンネルの購読リクエスト送信完了。');
}


// Webhookサーバーを起動する関数
function startWebhook(port = 3001) {
    const app = express();
    console.log('Starting YouTube Webhook server...');

    // 1. POSTリクエスト (通知本体)
    app.post('/youtube-webhook', bodyParser.text({ type: '*/*' }), async (req, res) => {
        const xml = req.body;
        const now = new Date(); 
        const fs = require('fs');
const path = require('path');

const RAW_LOG_DIR = path.join(__dirname, 'logs'); // または /var/log/yourapp
if (!fs.existsSync(RAW_LOG_DIR)) fs.mkdirSync(RAW_LOG_DIR, { recursive: true });

const rawFile = path.join(RAW_LOG_DIR, 'youtube-webhook-raw.log');
const nowIso = new Date().toISOString();
fs.appendFile(rawFile, `\n--- ${nowIso} ---\n${xml}\n`, (err) => {
  if (err) console.error('Failed to write raw webhook:', err);
});


        if (!xml || typeof xml !== 'string' || xml.trim().length === 0) {
            console.error('Received empty or invalid XML body. Sending 400.');
            return res.sendStatus(400); 
        }
        console.log('Received POST notification from YouTube Hub.');

        try {
            const result = await parseStringPromise(xml); 
            const entries = (result && result.feed && result.feed.entry) ? (Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry]) : [];

            if (entries.length === 0) {
                console.log('YouTube Webhook: Received notification without video entries (e.g., video deletion). Status OK.');
                return res.sendStatus(200);
            }

            for (const entry of entries) {
                const videoId = entry['yt:videoId'] && entry['yt:videoId'][0];
                let title = entry.title && entry.title[0];
                const publishedStr = entry.published && entry.published[0];
                const updatedStr = entry.updated && entry.updated[0]; 

                if (!videoId) {
                    console.warn('YouTube entry missing videoId, skip');
                    continue;
                }

                let publishedDate = publishedStr ? new Date(publishedStr) : null;
                let updatedDate = updatedStr ? new Date(updatedStr) : null;

let dateToCheck = updatedDate || publishedDate;

if (dateToCheck && dateToCheck < now) {
    // Hubからの通知時刻と動画のタイムスタンプの差をチェック
    if (now.getTime() - dateToCheck.getTime() > RECENT_VIDEO_THRESHOLD_MS) {
        console.log(`[YouTube Filter] Skip old video or old update: ${videoId}. Published: ${publishedStr}, Updated: ${updatedStr}`);
        continue; // 通知をスキップ
    } else {
        console.log(`[YouTube] Recent video/update detected: ${videoId} - allowing notification`);
    }
}
                // --- フィルター処理 終了 ---

                const url = `https://www.youtube.com/watch?v=${videoId}`;
                title = title || 'YouTube新着'; 

                const payload = {
                    type: 'youtube',
                    settingKey: 'youtube',
                    data: {
                        title: '【YouTube】', 
                        body: String(title),
                        url,
                        icon: ICON_URL,
                        published: publishedStr || null
                    }
                };

                axios.post(NOTIFY_CONFIG.apiUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Notify-Token': NOTIFY_CONFIG.token
                    }
                })
                    .then(() => console.log('YouTube -> /api/notify sent:', videoId))
                    .catch(e => console.error('YouTube notify post failed:', e.message || e));
            }
        } catch (err) {
            console.error('XML parse or processing error:', err);
            return res.sendStatus(400); 
        }

        res.sendStatus(200); // Hubからの通知は常に200 OKで応答
    });

    // 2. GETリクエスト (購読検証)
    app.get('/youtube-webhook', (req, res) => {
        const hubChallenge = req.query['hub.challenge'];
        console.log(`[YouTube Webhook] Received GET for verification. Challenge: ${hubChallenge}`);

        if (hubChallenge) {
            return res.send(hubChallenge);
        }

        res.sendStatus(400); 
    });

    return new Promise((resolve) => {
        app.listen(port, () => {
            console.log(`Webhook受信待ち on port ${port} (Re-enabled for NGINX proxy)`);
            resolve();
        });
    });
}

// ファイルが直接実行された場合にサーバーを起動
if (require.main === module) {
    startWebhook(3001);
}

module.exports = {
    init, // ★ 追加
    startWebhook,
    subscribeAllChannels // ★ 追加
};