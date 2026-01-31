const axios = require('axios');

const TWITCH_API = 'https://api.twitch.tv/helix';
const TWITCH_AUTH = 'https://id.twitch.tv/oauth2/token';

/**
 * Twitch URL からログイン名を抽出
 */
function extractLoginFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0];
  } catch (e) {
    throw new Error(`Failed to parse Twitch URL: ${url}`);
  }
}

/**
 * App Access Token を新規取得する
 */
async function fetchAppAccessToken(clientId, clientSecret) {
  const res = await axios.post(TWITCH_AUTH, null, {
    params: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    },
  });
  return res.data.access_token;
}

/**
 * 配信状況を取得
 */
async function checkStream(broadcasterId, token, clientId) {
  const res = await axios.get(`${TWITCH_API}/streams`, {
    params: { user_id: broadcasterId },
    headers: {
      'Client-Id': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });
  return res.data.data.length > 0 ? res.data.data[0] : null;
}

/**
 * ログイン名から broadcaster_id を取得
 */
async function getBroadcasterId(login, token, clientId) {
  const res = await axios.get(`${TWITCH_API}/users`, {
    params: { login },
    headers: {
      'Client-Id': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.data.data.length) throw new Error(`User not found: ${login}`);
  return res.data.data[0].id;
}

/**
 * 定期チェックするメイン関数
 */
async function startTwitchPolling(config) {
  const { twitchUrl, clientId, clientSecret, notifyConfig, interval = 1000 } = config;
  
  let currentToken = config.appAccessToken;
  let wasLive = false;
  let broadcasterId = null;

  const broadcasterLogin = extractLoginFromUrl(twitchUrl);

  const poll = async () => {
    try {
      // 1. IDが未取得なら取得
      if (!broadcasterId) {
        if (!currentToken) currentToken = await fetchAppAccessToken(clientId, clientSecret);
        broadcasterId = await getBroadcasterId(broadcasterLogin, currentToken, clientId);
      }

      // 2. 配信チェック
      const stream = await checkStream(broadcasterId, currentToken, clientId);
      const isLive = !!stream;

      // 3. 配信開始時の通知処理
      if (isLive && !wasLive) {
        console.log(`[Twitch] ${broadcasterLogin} started streaming!`);

        // main.js の共通通知先に POST
        if (notifyConfig && notifyConfig.apiUrl) {
          try {
            await axios.post(notifyConfig.apiUrl, {
              type: 'twitch',
              data: {
                title: `${broadcasterLogin} が配信を開始しました`,
                body: stream.title || '',
                url: `https://www.twitch.tv/${broadcasterLogin}`,
                icon: 'https://assets.twitch.tv/assets/favicon-32-e29e246c157142c94346.png'
              }
            }, {
              headers: { 'X-Notify-Token': notifyConfig.token },
              timeout: 5000
            });
            // 以前の固定IPにも送る必要がある場合はここに追加
            await axios.post('http://192.168.1.70:1701', { url: twitchUrl }).catch(() => {});
          } catch (err) {
            console.error('[Twitch] Notification error:', err.message);
          }
        }
      }
      wasLive = isLive;

    } catch (e) {
      if (e.response && e.response.status === 401) {
        console.warn('[Twitch] Token expired. Refreshing...');
        try {
          currentToken = await fetchAppAccessToken(clientId, clientSecret);
        } catch (tokenErr) {
          console.error('[Twitch] Failed to refresh token:', tokenErr.message);
        }
      } else {
        console.error('[Twitch] Polling error:', e.message);
      }
    }
    setTimeout(poll, interval);
  };

  poll();
}

module.exports = { startTwitchPolling };