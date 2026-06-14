const fetch = require('node-fetch');
const https = require('https');

const API_BASE = 'https://apiv2.twitcasting.tv';

async function fetchLatest() {
    const clientId = process.env.TWITCASTING_CLIENT_ID;
    const clientSecret = process.env.TWITCASTING_CLIENT_SECRET;
    const login = 'koinoya_mai';
    if (!clientId || !clientSecret) {
        console.warn('[weekly/twitcasting] TWITCASTING_CLIENT_ID/SECRET not set');
        return [];
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url = `${API_BASE}/users/${login}/movies?limit=5`;
    const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: true });

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${basicAuth}`, 'X-Api-Version': '2.0' },
            agent,
            timeout: 10000
        });
        if (!res.ok) {
            console.warn(`[weekly/twitcasting] API returned ${res.status}`);
            return [];
        }

        const body = await res.json();
        const movies = Array.isArray(body?.movies) ? body.movies : [];

        const liveMovies = movies.filter(m => m.status === 'live' || m.is_live === true);
        if (liveMovies.length === 0) return [];

        return liveMovies.map(m => ({
            title: m.title || 'ツイキャス配信',
            start_time: m.started_at || m.created_at || new Date().toISOString(),
            url: `https://twitcasting.tv/${login}/movie/${m.id}`,
            thumbnail_url: m.large_thumbnail || m.thumbnail || null,
            platform: 'twitcasting',
            event_type: 'live',
            description: m.subtitle || '',
            status: 'live',
            external_id: `twitcasting_${m.id}`
        }));
    } catch (e) {
        console.error(`[weekly/twitcasting] fetch error:`, e.message);
        return [];
    }
}

module.exports = { fetchLatest };
