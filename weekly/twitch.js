// platformFetch/twitch.js
const fetch = require('node-fetch');

async function fetchLatest() {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const token = process.env.TWITCH_TOKEN;
    const login = 'koinoya_mai';

    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, {
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${token}`
        }
    });
    const data = await res.json();

    if (!data.data || !data.data.length) return [];

    const ev = data.data[0];
    return [{
        title: ev.title,
        start_time: ev.started_at,
        url: `https://www.twitch.tv/${login}`,
        thumbnail_url: ev.thumbnail_url.replace('{width}', '320').replace('{height}', '180'),
        platform: 'twitch',
        event_type: 'live',
        description: '',
        status: 'live',
        external_id: ev.id
    }];
}

module.exports = { fetchLatest };
