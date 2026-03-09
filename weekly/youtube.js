const axios = require('axios');

const API_KEY = process.env.YOUTUBE_API_KEY || '';
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCxxxxxxxxxxxxxx';

if (!API_KEY) {
    console.warn('[YouTube] YOUTUBE_API_KEY is not set');
}

/**
 * YouTube Data API から動画詳細取得
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
 * チャンネル最新イベント取得
 * ・start_time 重複は上書き
 * ・Mapでユニーク化
 */
async function fetchLatest() {
    if (!API_KEY || !CHANNEL_ID) {
        console.warn('[YouTube] API_KEY or CHANNEL_ID not configured');
        return [];
    }

    try {
        const resp = await axios.get(
            'https://www.googleapis.com/youtube/v3/search',
            {
                params: {
                    channelId: CHANNEL_ID,
                    part: 'snippet',
                    order: 'date',
                    maxResults: 10,
                    type: 'video',
                    key: API_KEY
                },
                timeout: 10000
            }
        );

        if (!resp.data?.items?.length) {
            console.log('[YouTube] No videos found');
            return [];
        }

        // ★ ここが重要：重複排除用Map
        const eventMap = new Map();

        for (const item of resp.data.items) {
            const videoId = item.id.videoId;

            const videoData = await fetchVideoStatus(videoId);
            if (!videoData) continue;

            const event = convertToEvent(videoData);
            if (!event) continue;

            // ===== 重複対策 =====
            // 秒ズレ回避のため分単位キー
            const key = new Date(event.start_time)
                .toISOString()
                .slice(0, 16); // YYYY-MM-DDTHH:mm

            eventMap.set(key, event); // 同時刻は自動上書き
        }

        const events = Array.from(eventMap.values());

        console.log(`[YouTube] Fetched ${events.length} unique events`);
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

        // ★ 常に確定
        confirmed: true,

        external_id: videoData.id
    };
}


module.exports = {
    fetchLatest,
    fetchVideoStatus,
    convertToEvent
};