const { upsertEvent } = require('./event-upsert'); // status=nullの関数
const axios = require('axios');

const API_KEY = process.env.YOUTUBE_API_KEY || '';
if (!API_KEY) {
    throw new Error('YOUTUBE_API_KEY is not set in environment');
}

/**
 * YouTube Data API から動画情報を取得
 * @param {string} videoId 
 * @returns {Object|null} videoData
 */
async function fetchVideoStatus(videoId) {
    try {
        const resp = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                id: videoId,
                part: 'snippet,liveStreamingDetails,status',
                key: API_KEY
            },
            timeout: 10000
        });
        if (resp.data?.items?.length > 0) {
            return resp.data.items[0];
        }
        return null;
    } catch (err) {
        console.error(`[YouTube] fetchVideoStatus error for ${videoId}:`, err.message || err);
        return null;
    }
}

/**
 * YouTubeライブ/予定/動画をDBに登録する
 * @param {Object} videoData YouTube APIのvideoオブジェクト
 * @param {string} channelId チャンネルID
 */
async function processYouTubeVideo(videoData, channelId) {
    if (!videoData || !videoData.id) return;

    const liveDetails = videoData.liveStreamingDetails || {};

    let start_time = null;
    let event_type = 'video';

    if (liveDetails.actualStartTime) {
        start_time = liveDetails.actualStartTime;
        event_type = 'live';
    } else if (liveDetails.scheduledStartTime) {
        start_time = liveDetails.scheduledStartTime;
        event_type = 'live';
    } else {
        start_time = videoData.snippet?.publishedAt || new Date().toISOString();
        event_type = 'video';
    }

    const event = {
        title: videoData.snippet?.title || 'YouTube動画',
        start_time,
        end_time: null,
        url: `https://www.youtube.com/watch?v=${videoData.id}`,
        thumbnail_url: videoData.snippet?.thumbnails?.medium?.url || null,
        platform: 'youtube',
        event_type,
        description: videoData.snippet?.description || null,
        status: null,
        external_id: videoData.id
    };

    try {
        await upsertEvent(event);
        console.log(`[YouTube] Event upserted: ${event.title} (${event.start_time})`);
    } catch (err) {
        console.error('[YouTube] Failed to upsert event:', err.message || err);
    }
}

/**
 * チャンネルリストから最新の動画・ライブを処理
 */
async function processAllYouTubeChannels(videoListByChannel) {
    for (const channelId of Object.keys(videoListByChannel)) {
        const videos = videoListByChannel[channelId];
        for (const video of videos) {
            await processYouTubeVideo(video, channelId);
        }
    }
}

/**
 * 動画IDリストを受けてDB登録する
 * @param {string[]} videoIds 
 */
async function handleYouTubeVideoIds(videoIds) {
    const videosByChannel = {};

    for (const videoId of videoIds) {
        const videoData = await fetchVideoStatus(videoId);
        if (!videoData) continue;

        const channelId = videoData.snippet?.channelId || 'unknown';
        if (!videosByChannel[channelId]) videosByChannel[channelId] = [];
        videosByChannel[channelId].push(videoData);
    }

    await processAllYouTubeChannels(videosByChannel);
}

module.exports = {
    fetchVideoStatus,
    processYouTubeVideo,
    processAllYouTubeChannels,
    handleYouTubeVideoIds
};
