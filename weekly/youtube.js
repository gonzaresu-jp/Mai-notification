const axios = require('axios');
const { parseStringPromise } = require('xml2js');

const API_KEY = process.env.YOUTUBE_API_KEY || '';
const CHANNEL_IDS_RAW = process.env.YOUTUBE_CHANNEL_ID || '';
const CHANNEL_IDS = CHANNEL_IDS_RAW.split(',').map(s => s.trim()).filter(Boolean);

if (!API_KEY) {
    console.warn('[YouTube] YOUTUBE_API_KEY is not set');
}
if (!CHANNEL_IDS.length) {
    console.warn('[YouTube] YOUTUBE_CHANNEL_ID is not set');
}

const RSS_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const MAX_RSS_ITEMS = 15;

/**
 * RSSフィードから動画ID一覧を取得（クォータ消費なし）
 */
async function fetchRssVideoIds(channelId) {
    try {
        const resp = await axios.get(`${RSS_URL}${channelId}`, { timeout: 10000 });
        const parsed = await parseStringPromise(resp.data);
        const entries = parsed?.feed?.entry || [];
        const ids = [];
        for (const entry of entries.slice(0, MAX_RSS_ITEMS)) {
            const videoId = entry?.['yt:videoId']?.[0];
            if (videoId) ids.push(videoId);
        }
        return ids;
    } catch (err) {
        console.error(`[YouTube RSS] Error for ${channelId}:`, err.message || err);
        return [];
    }
}

/**
 * YouTube Data API から動画詳細取得（videos endpoint, quota 10000/day）
 */
async function fetchVideoStatus(videoId) {
    if (!API_KEY) return null;

    try {
        const resp = await axios.get(
            'https://www.googleapis.com/youtube/v3/videos',
            {
                params: {
                    id: videoId,
                    part: 'snippet,liveStreamingDetails,status',
                    key: API_KEY
                },
                timeout: 10000
            }
        );

        return resp.data?.items?.[0] || null;

    } catch (err) {
        console.error(`[YouTube] fetchVideoStatus error for ${videoId}:`, err.message || err);
        return null;
    }
}


/**
 * チャンネル最新イベント取得（RSS + videos API、Search API不使用）
 */
async function fetchLatest() {
    if (!API_KEY || !CHANNEL_IDS.length) {
        console.warn('[YouTube] API_KEY or CHANNEL_ID not configured');
        return [];
    }

    try {
        // Step 1: RSSから動画IDを取得（クォータ消費なし）
        const allVideoIds = [];
        for (const channelId of CHANNEL_IDS) {
            const ids = await fetchRssVideoIds(channelId);
            allVideoIds.push(...ids);
        }

        if (!allVideoIds.length) {
            console.log('[YouTube] No videos from RSS');
            return [];
        }

        // ユニーク化
        const uniqueIds = [...new Set(allVideoIds)];
        console.log(`[YouTube RSS] Found ${uniqueIds.length} unique videos`);

        // Step 2: videos APIで詳細取得（quota 1件 = 1 unit）
        // 50件ずつバッチ処理（APIの上限は1回50件）
        const eventMap = new Map();

        for (let i = 0; i < uniqueIds.length; i += 50) {
            const batch = uniqueIds.slice(i, i + 50);
            const idsParam = batch.join(',');

            try {
                const resp = await axios.get(
                    'https://www.googleapis.com/youtube/v3/videos',
                    {
                        params: {
                            id: idsParam,
                            part: 'snippet,liveStreamingDetails,status',
                            key: API_KEY
                        },
                        timeout: 15000
                    }
                );

                for (const item of (resp.data?.items || [])) {
                    const event = convertToEvent(item);
                    if (!event) continue;

                    const key = event.external_id;
                    eventMap.set(key, event);
                }
            } catch (err) {
                console.error(`[YouTube] Batch fetch error:`, err.message || err);
            }
        }

        const events = Array.from(eventMap.values());
        console.log(`[YouTube] Fetched ${events.length} events (RSS + videos API)`);
        return events;

    } catch (err) {
        console.error('[YouTube] fetchLatest error:', err.message || err);
        return [];
    }
}


/**
 * YouTube動画 → イベント変換
 */
function convertToEvent(videoData) {
    if (!videoData?.id) return null;

    const liveDetails = videoData.liveStreamingDetails || {};
    const snippet = videoData.snippet || {};

    let start_time;
    let event_type;
    let status;

    // ===== ライブ中 =====
    if (liveDetails.actualStartTime) {
        start_time = liveDetails.actualStartTime;
        event_type = 'live';
        status = liveDetails.actualEndTime ? 'ended' : 'live';
    }

    // ===== 予定ライブ =====
    else if (liveDetails.scheduledStartTime) {
        start_time = liveDetails.scheduledStartTime;
        event_type = 'live';
        status = 'scheduled';
    }

    // ===== 通常動画 =====
    else {
        start_time = snippet.publishedAt || new Date().toISOString();
        event_type = 'video';
        status = 'ended';
    }

    return {
        title: snippet.title || 'YouTube動画',
        start_time,
        end_time: liveDetails.actualEndTime || null,
        url: `https://www.youtube.com/watch?v=${videoData.id}`,
        thumbnail_url:
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.medium?.url ||
            null,
        platform: 'youtube',
        event_type,
        description: snippet.description || null,
        status,

        confirmed: status === 'ended' ? true : null,

        external_id: videoData.id
    };
}


module.exports = {
    fetchLatest,
    fetchVideoStatus,
    convertToEvent
};
