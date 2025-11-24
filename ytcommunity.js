const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs/promises');
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

const LAST_POSTS_FILE = 'community.json';

const youtube = google.youtube({
  version: 'v3',
  auth: API_KEY
});

let lastPostIds = {};

async function loadLastPostIds() {
  try {
    const data = await fs.readFile(LAST_POSTS_FILE, 'utf-8');
    lastPostIds = JSON.parse(data);
    console.log(`Loaded last post IDs from ${LAST_POSTS_FILE}.`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // ファイルが存在しない場合は初期データとして空のオブジェクトを使用
      console.log(`${LAST_POSTS_FILE} not found. Starting with empty state.`);
      lastPostIds = {};
    } else {
      console.error('Error loading last post IDs:', err.message);
      // 読み込みエラーの場合も空のオブジェクトで続行
      lastPostIds = {};
    }
  }
}

async function saveLastPostIds() {
  try {
    const data = JSON.stringify(lastPostIds, null, 2);
    await fs.writeFile(LAST_POSTS_FILE, data, 'utf-8');
    console.log(`Saved current post IDs to ${LAST_POSTS_FILE}.`);
  } catch (err) {
    console.error('Error saving last post IDs:', err.message);
  }
}

async function checkCommunityPosts(channelId) {
  try {
    const res = await youtube.activities.list({
      part: ['snippet'],
      channelId,
      maxResults: 5,
    });

    const items = res.data.items || [];
    let shouldSave = false;
    // --- 取得データ全体のログを追加 ---
    console.log(`[YouTube API Response] Channel ${channelId}: ${items.length} items received.`);
    // itemsの中身を詳細に確認したい場合は、下の行も追加
    // console.log(JSON.stringify(items, null, 2));

    for (const item of items.reverse()) {
      if (!item.snippet || item.snippet.type !== 'community') continue;

      const postId = item.id;
      // --- コミュニティ投稿として認識されたログを追加 ---
      console.log(`[New Post Check] Channel ${channelId} - Post ID: ${postId}. Last ID: ${lastPostIds[channelId]}`);
      
      if (lastPostIds[channelId] === postId) continue;
      lastPostIds[channelId] = postId;
      shouldSave = true;

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
if (shouldSave) {
        await saveLastPostIds();
    }
  } catch (err) {
    console.error(`Error fetching community posts for ${channelId}:`, err.message || err);
  }
}

async function startPolling() {
  // 👈 最初に前回の状態を読み込む
  await loadLastPostIds();
    
  console.log(`Community polling started for channels: ${CHANNEL_IDS.join(', ')}`);
  CHANNEL_IDS.forEach(chId => checkCommunityPosts(chId));

  setInterval(() => {
    CHANNEL_IDS.forEach(chId => checkCommunityPosts(chId));
  }, POLL_INTERVAL);
}

module.exports = { startPolling };