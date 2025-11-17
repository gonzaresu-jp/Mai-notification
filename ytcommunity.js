const { google } = require('googleapis');
const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.YOUTUBE_API_KEY;
const LOCAL_API_URL = 'http://localhost:8080/api/notify';
const ICON_URL = 'https://elza.poitou-mora.ts.net/pushweb/icon.ico';
const POLL_INTERVAL = 3 * 60 * 1000;
const NOTIFY_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null;

const CHANNEL_IDS = [
  'UCgttI8QfdWhvd3SRtCYcJzw',
  'UCElHA6-5CBmgWODVWNxS8VA'
];

const youtube = google.youtube({
  version: 'v3',
  auth: API_KEY
});

const lastPostIds = {};

async function checkCommunityPosts(channelId) {
  try {
    const res = await youtube.activities.list({
      part: ['snippet'],
      channelId,
      maxResults: 5,
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
        settingKey: 'youtubeCommunity',
        data: {
          title,
          url,
          icon: ICON_URL,
          published
        }
      };

      await axios.post(LOCAL_API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Notify-Token': NOTIFY_TOKEN
        }
      })
        .then(() => console.log(`Community post sent for ${channelId}: ${postId}`))
        .catch(e => console.error('Community notify failed:', e.message || e));
    }

  } catch (err) {
    console.error(`Error fetching community posts for ${channelId}:`, err.message || err);
  }
}

function startPolling() {
  console.log(`Community polling started for channels: ${CHANNEL_IDS.join(', ')}`);
  CHANNEL_IDS.forEach(chId => checkCommunityPosts(chId));

  setInterval(() => {
    CHANNEL_IDS.forEach(chId => checkCommunityPosts(chId));
  }, POLL_INTERVAL);
}

module.exports = { startPolling };