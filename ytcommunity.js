// youtubeCommunity.js
const { google } = require('googleapis');
const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.YOUTUBE_API_KEY;
const LOCAL_API_URL = 'http://localhost:8080/api/notify';
const ICON_URL = 'https://elza.poitou-mora.ts.net/pushweb/icon.ico';
const POLL_INTERVAL = 3 * 60 * 1000; // 3分

// 監視するチャンネルIDリスト
const CHANNEL_IDS = [
  'UCgttI8QfdWhvd3SRtCYcJzw', // 1つ目
  'UCElHA6-5CBmgWODVWNxS8VA'  // 2つ目
];

const youtube = google.youtube({
  version: 'v3',
  auth: API_KEY
});

// 前回通知済みIDを保持
const lastPostIds = {};

// チャンネルのコミュニティ投稿をチェック
async function checkCommunityPosts(channelId) {
  try {
    const res = await youtube.activities.list({
      part: ['snippet'],
      channelId,
      maxResults: 5,
      // コミュニティ投稿のみ
      // NOTE: type='community' は正式には activities.list では明示できないため後でfilter
    });

    const items = res.data.items || [];
    for (const item of items.reverse()) {
      if (!item.snippet || item.snippet.type !== 'community') continue;

      const postId = item.id;
      if (lastPostIds[channelId] === postId) continue;
      lastPostIds[channelId] = postId;

      const title = item.snippet.title || 'YouTubeコミュニティ投稿';
      const url = `https://www.youtube.com/post/${postId}`;
      const published = item.snippet.publishedAt || null;

      const payload = {
        type: 'youtubeCommunity',
        data: {
          title,
          url,
          icon: ICON_URL,
          published
        }
      };

      await axios.post(LOCAL_API_URL, payload)
        .then(() => console.log(`Community post sent for ${channelId}: ${postId}`))
        .catch(e => console.error('Community notify failed:', e.message || e));
    }

  } catch (err) {
    console.error(`Error fetching community posts for ${channelId}:`, err.message || err);
  }
}

// 定期実行
function startPolling() {
  console.log(`Community polling started for channels: ${CHANNEL_IDS.join(', ')}`);
  // 最初に即実行
  CHANNEL_IDS.forEach(chId => checkCommunityPosts(chId));

  setInterval(() => {
    CHANNEL_IDS.forEach(chId => checkCommunityPosts(chId));
  }, POLL_INTERVAL);
}

// エクスポート
module.exports = { startPolling };

