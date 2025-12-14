// youtube-webhook.js
const express = require('express');
const bodyParser = require('body-parser');
const xml2js = require('xml2js');
const axios = require('axios');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const { parseStringPromise } = require('xml2js');

const CHANNEL_IDS = [
    'UCElHA6-5CBmgWODVWNxS8VA',
    'UCgttI8QfdWhvd3SRtCYcJzw'
];
const CALLBACK_URL = 'https://elza.poitou-mora.ts.net/youtube-webhook';
const PUBSUBHUBBUB_HUB = 'https://pubsubhubbub.appspot.com/subscribe';

let NOTIFY_CONFIG = {
    token: null,
    apiUrl: 'http://localhost:8080/api/notify',
    hmacSecret: null
};

const ICON_URL = './icon.ico';

// 閾値（使用箇所あり）
const RECENT_VIDEO_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours (既存値を維持)
// ライブ予定通知の判定を緩和するための閾値（3分）
const PLANNED_ASSUMPTION_THRESHOLD_MS = 3 * 60 * 1000; 

const API_KEY = process.env.YOUTUBE_API_KEY || ''; // 必ず環境変数で提供する事

const SENT_RECORDS_FILE = path.join(__dirname, 'sent_records.json');

function loadSentRecords() {
    try {
        if (fs.existsSync(SENT_RECORDS_FILE)) {
            const raw = fs.readFileSync(SENT_RECORDS_FILE, 'utf8');
            return JSON.parse(raw || '{}');
        }
    } catch (e) {
        console.error('Failed to load sent records:', e);
    }
    return {};
}

function saveSentRecords(records) {
    try {
        fs.writeFileSync(SENT_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save sent records:', e);
    }
}

/** YouTube Data API で動画情報を取得 */
async function fetchVideoStatus(videoId) {
    if (!API_KEY) throw new Error('YOUTUBE_API_KEY not set in environment');
    const url = 'https://www.googleapis.com/youtube/v3/videos';
    try {
        const resp = await axios.get(url, {
            params: {
                id: videoId,
                part: 'liveStreamingDetails,status',
                key: API_KEY
            },
            timeout: 10_000
        });
        if (resp.data && resp.data.items && resp.data.items.length > 0) {
            return resp.data.items[0];
        }
        return null;
    } catch (err) {
        console.error(`fetchVideoStatus error for ${videoId}:`, err.message || err);
        return null;
    }
}

/** 内部通知サーバ（NOTIFY_CONFIG.apiUrl）へ送る汎用関数 */
async function sendNotifyApi(payload) {
    try {
        await axios.post(NOTIFY_CONFIG.apiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Notify-Token': NOTIFY_CONFIG.token || ''
            },
            timeout: 8000
        });
        return true;
    } catch (e) {
        console.error('sendNotifyApi failed:', e.message || e);
        return false;
    }
}

/** 指定の内部エンドポイントに URL を送りつける（新規動画用） */
async function sendInternalUrl(urlToSend) {
    try {
        await axios.post('http://192.168.1.70:1700/', { url: urlToSend }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 8000
        });
        return true;
    } catch (e) {
        console.error('sendInternalUrl failed:', e.message || e);
        return false;
    }
}

function init(config) {
    NOTIFY_CONFIG = { ...NOTIFY_CONFIG, ...config };
    console.log('[YouTube] Notification config loaded.');
}

/** Subscribe helper (既存) */
async function subscribeToChannel(channelId) {
    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
    const data = querystring.stringify({
        'hub.mode': 'subscribe',
        'hub.topic': topicUrl,
        'hub.callback': CALLBACK_URL,
        'hub.verify': 'sync',
        'hub.lease_seconds': 432000
    });
    try {
        const response = await axios.post(PUBSUBHUBBUB_HUB, data, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
        });
        if (response.status === 204 || response.status === 202) {
            console.log(`[YouTube Sub] ✅ 購読リクエスト成功: ${channelId}.`);
        } else {
            console.error(`[YouTube Sub] ❌ 購読リクエスト失敗 (${channelId}). Status: ${response.status}`);
        }
    } catch (error) {
        console.error(`[YouTube Sub] エラー (${channelId}):`, error.message || error);
        if (error.response) console.error('  Response Body:', error.response.data);
    }
}

async function subscribeAllChannels() {
    console.log('[YouTube Sub] 全チャンネルの購読リクエスト/更新を開始');
    const promises = CHANNEL_IDS.map(c => subscribeToChannel(c));
    await Promise.allSettled(promises);
    console.log('[YouTube Sub] 完了');
}

/** Webhook server start */
function startWebhook(port = 3001) {
    const app = express();
    console.log('Starting YouTube Webhook server...');

    // raw log dir
    const RAW_LOG_DIR = path.join(__dirname, 'logs');
    if (!fs.existsSync(RAW_LOG_DIR)) fs.mkdirSync(RAW_LOG_DIR, { recursive: true });
    const rawFile = path.join(RAW_LOG_DIR, 'youtube-webhook-raw.log');

    // POST handler
    app.post('/youtube-webhook', bodyParser.text({ type: '*/*' }), async (req, res) => {
        const xml = req.body;
        const nowIso = new Date().toISOString();
        fs.appendFile(rawFile, `\n--- ${nowIso} ---\n${xml}\n`, (err) => {
            if (err) console.error('Failed to write raw webhook:', err);
        });

        if (!xml || typeof xml !== 'string' || xml.trim().length === 0) {
            console.error('Received empty or invalid XML body. 400.');
            return res.sendStatus(400);
        }

        let parsed;
        try {
            parsed = await parseStringPromise(xml);
        } catch (err) {
            console.error('XML parse error:', err);
            return res.sendStatus(400);
        }

        const entries = (parsed && parsed.feed && parsed.feed.entry)
            ? (Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry])
            : [];

        if (entries.length === 0) {
            console.log('No entries in feed (possible deletion). 200 OK.');
            return res.sendStatus(200);
        }

        const records = loadSentRecords();

        for (const entry of entries) {
            const videoId = entry['yt:videoId'] && entry['yt:videoId'][0];
            let title = entry.title && entry.title[0];
            const publishedStr = entry.published && entry.published[0];

            if (!videoId) {
                console.warn('Entry missing videoId, skip.');
                continue;
            }

            const publishedDate = publishedStr ? new Date(publishedStr) : null;
            if (!publishedDate) {
                console.warn(`No published date for video ${videoId}, skip.`);
                continue;
            }

            const nowUtc = new Date();
            const diffMs = nowUtc.getTime() - publishedDate.getTime();

            if (diffMs > RECENT_VIDEO_THRESHOLD_MS) {
                console.log(`Skip ${videoId}: published older than threshold.`);
                continue;
            }

            // データ取得
            const item = await fetchVideoStatus(videoId);
            if (!item) {
                console.warn(`No data from YouTube Data API for ${videoId}, skip.`);
                continue;
            }

            const live = item.liveStreamingDetails || null;
            const status = item.status || {};
            const url = `https://www.youtube.com/watch?v=${videoId}`;
            title = title || 'YouTube動画';

            // 判定フラグ
            // 既存の isUpcoming は使用しません
            // const isUpcoming = live && live.scheduledStartTime && !live.actualStartTime;
            const isLive = live && live.actualStartTime && !live.actualEndTime;
            const isArchivedFromLive = live && live.actualEndTime; // ライブ終了してアーカイブ化済み or 処理中
            const isNonLiveVideo = !live && (status.uploadStatus === 'processed' || status.uploadStatus === 'uploaded' || status.uploadStatus === 'completed');

            const rec = records[videoId] || {};
            const recIsEmpty = Object.keys(rec).length === 0;

            // Publishedから5分以内かどうかの判定 (新しいロジックで使用)
            const isVeryRecent = diffMs <= PLANNED_ASSUMPTION_THRESHOLD_MS;

            // 1) 予定 (Upcoming) -> タイトルに【予定】付与して notify。一度だけ送る（plannedSent）
            // 判定ロジックを緩和: ライブ情報があり、かつPublishedから5分以内で、ライブ中でなければ【予定】として扱う
            if (live && isVeryRecent && !isLive) {
                if (!rec.plannedSent) {
                    const payload = {
                        type: 'youtube',
                        settingKey: 'youtube',
                        data: {
                            title: `【予定】`,
                            body: `${title}`,
                            url,
                            icon: ICON_URL,
                            published: publishedStr || null
                        }
                    };
                    const ok = await sendNotifyApi(payload);
                    if (ok) {
                        records[videoId] = { ...rec, plannedSent: true, plannedAt: new Date().toISOString() };
                        console.log(`Planned notify (using 5min-threshold) sent for ${videoId}`);
                    } else {
                        console.error(`Failed to send planned notify for ${videoId}`);
                    }
                    saveSentRecords(records);
                } else {
                    console.log(`Planned notify already sent for ${videoId}, ignored.`);
                }
                continue;
            }

            // 2) ライブ中 (Live) -> 【ライブ】付けて通知。基本的に一度だけ（liveSent）
            if (isLive) {
                if (!rec.liveSent) {
                    const payload = {
                        type: 'youtube',
                        settingKey: 'youtube',
                        data: {
                            title: `【ライブ】`,
                            body: `${title}`,
                            url,
                            icon: ICON_URL,
                            published: publishedStr || null
                        }
                    };
                    const ok = await sendNotifyApi(payload);
                    if (ok) {
                        records[videoId] = { ...rec, liveSent: true, liveAt: new Date().toISOString() };
                        console.log(`Live notify sent for ${videoId}`);
                    } else {
                        console.error(`Failed to send live notify for ${videoId}`);
                    }
                    saveSentRecords(records);
                } else {
                    console.log(`Live notify already sent for ${videoId}, ignored.`);
                }
                continue;
            }

            // 4) 新規で動画になった場合の処理
            // - ライブ終了アーカイブ (isArchivedFromLive): 通知は送らず内部URLへPOSTのみ送信（重複防止）
            // - 非ライブの新規動画 (isNonLiveVideo): ログにない（recIsEmpty）の場合は内部URLへPOST + 通知を送る
            if (isArchivedFromLive) {
                if (!rec.newVideoSent) {
                    const ok = await sendInternalUrl(url);
                    if (ok) {
                        records[videoId] = { ...rec, newVideoSent: true, newVideoAt: new Date().toISOString(), archivedFromLive: true };
                        console.log(`Archived-from-live POST sent for ${videoId}`);
                    } else {
                        console.error(`Failed to POST archived-from-live for ${videoId}`);
                    }
                    saveSentRecords(records);
                } else {
                    console.log(`Archived-from-live already POSTed for ${videoId}, ignored.`);
                }
                continue;
            }

            if (isNonLiveVideo) {
                // 非ライブの通常動画は「ログにないもの」は通知 + 内部POST
                if (!rec.newVideoSent) {
                    // If rec is empty => new/newly detected (ログにない)
                    if (recIsEmpty) {
                        // 1) send notify
                        const notifyPayload = {
                            type: 'youtube',
                            settingKey: 'youtube',
                            data: {
                                title: `【動画】`,
                                body: `${title}`,
                                url,
                                icon: ICON_URL,
                                published: publishedStr || null
                            }
                        };
                        const notified = await sendNotifyApi(notifyPayload);
                        if (notified) {
                            records[videoId] = { ...rec, notifiedAt: new Date().toISOString() };
                            console.log(`Notify sent for new non-live video ${videoId}`);
                        } else {
                            console.error(`Failed to send notify for new non-live video ${videoId}`);
                        }
                    }

                    // 2) always send internal URL POST once (for new video)
                    const ok = await sendInternalUrl(url);
                    if (ok) {
                        records[videoId] = { ...records[videoId], newVideoSent: true, newVideoAt: new Date().toISOString(), nonLive: true };
                        console.log(`New non-live video POST sent for ${videoId}`);
                    } else {
                        console.error(`Failed to POST new non-live video for ${videoId}`);
                    }
                    saveSentRecords(records);
                } else {
                    console.log(`New-video already processed for ${videoId}, ignored.`);
                }
                continue;
            }

            // それ以外のケース（processing中など）はログに残してスキップ
            console.log(`No action for ${videoId}. status.uploadStatus=${status.uploadStatus}, live present=${!!live}`);
        }

        // 常に200で応答
        res.sendStatus(200);
    });

    // GET verification
    app.get('/youtube-webhook', (req, res) => {
        const hubChallenge = req.query['hub.challenge'];
        if (hubChallenge) return res.send(hubChallenge);
        res.sendStatus(400);
    });

    return new Promise((resolve) => {
        app.listen(port, () => {
            console.log(`Webhook listening on port ${port}`);
            resolve();
        });
    });
}

if (require.main === module) {
    startWebhook(3001).catch(err => console.error('Failed to start webhook:', err));
}

module.exports = {
    init,
    startWebhook,
    subscribeAllChannels
};