// youtube.js (3001ポートで独立して動作するWebhookサーバー)
const express = require('express');
const bodyParser = require('body-parser');
const xml2js = require('xml2js');
const axios = require('axios');

// xml2jsのPromise対応バージョンを取得
const { parseStringPromise } = require('xml2js'); 

const LOCAL_API_URL = 'http://localhost:8080/api/notify';
const ICON_URL = 'https://elza.poitou-mora.ts.net/pushweb/icon.ico';

// 通知をフィルタリングする時間（ミリ秒）。例: 5分 = 5 * 60 * 1000
const RECENT_VIDEO_THRESHOLD_MS = 5 * 60 * 1000;

// Webhookサーバーを起動する関数
function startWebhook(port = 3001) {
    const app = express();
    console.log('Starting YouTube Webhook server...');

    // 1. POSTリクエスト (通知本体)
    app.post('/youtube-webhook', bodyParser.text({ type: '*/*' }), async (req, res) => {
        const xml = req.body;
        const now = new Date(); // 現在時刻を取得

        if (!xml || typeof xml !== 'string' || xml.trim().length === 0) {
            console.error('Received empty or invalid XML body. Sending 400.');
            return res.sendStatus(400); 
        }
        console.log('Received POST notification from YouTube Hub.');

        try {
            // xml2js.parseStringPromise を使用
            const result = await parseStringPromise(xml); 
            // エントリーは配列になっている可能性があるため、entriesとして取得
            const entries = (result && result.feed && result.feed.entry) ? (Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry]) : [];

            if (entries.length === 0) {
                console.log('YouTube Webhook: Received notification without video entries (e.g., video deletion). Status OK.');
                return res.sendStatus(200);
            }

            for (const entry of entries) {
                // entry内のデータを抽出
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

                // --- 過去動画の再通知対策: フィルター処理 ---
                if (publishedDate && publishedDate < now) {
                    let targetDate = updatedDate || publishedDate;
                    if (now.getTime() - targetDate.getTime() > RECENT_VIDEO_THRESHOLD_MS) {
                        console.log(`[YouTube Filter] Skip old video: ${videoId} (Updated: ${updatedStr})`);
                        continue; // 通知をスキップ
                    }
                }
                // --- フィルター処理 終了 ---

                const url = `https://www.youtube.com/watch?v=${videoId}`;
                title = title || 'YouTube新着'; // タイトルが空の場合のフォールバック

                // ライブ/プレミア公開の判定は困難なので、シンプルに通知
                const payload = {
                    type: 'youtube',
                    data: {
                        title: String(title),
                        url,
                        icon: ICON_URL,
                        published: publishedStr || null
                    }
                };

                axios.post(LOCAL_API_URL, payload)
                    .then(() => console.log('YouTube -> /api/notify sent:', videoId))
                    .catch(e => console.error('YouTube notify post failed:', e.message || e));
            }
        } catch (err) {
            console.error('XML parse or processing error:', err);
            // エラー時もHubに200を返すことで、リトライの頻度が高くなるのを防ぐ場合もある
            // しかし、今回は処理失敗として400を返す
            return res.sendStatus(400); 
        }

        res.sendStatus(200); // Hubからの通知は常に200 OKで応答
    });

    // 2. GETリクエスト (購読検証)
    app.get('/youtube-webhook', (req, res) => {
        const hubChallenge = req.query['hub.challenge'];
        console.log(`[YouTube Webhook] Received GET for verification. Challenge: ${hubChallenge}`);

        if (hubChallenge) {
            // Hub Challengeをそのままテキストとして返す
            return res.send(hubChallenge);
        }

        // hub.challengeがない場合は不正なリクエスト
        res.sendStatus(400); 
    });

    app.listen(port, () => console.log(`Webhook受信待ち on port ${port} (Re-enabled for NGINX proxy)`));
}

// ファイルが直接実行された場合にサーバーを起動
if (require.main === module) {
    startWebhook(3001);
}

module.exports = {
    startWebhook
};
