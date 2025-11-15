// twitcasting.js (API対応版 - 認証/Webhook管理用)
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();
// --- TwitCasting API 設定 ---
// 登録情報から取得

const CLIENT_ID = process.env.TWITCASTING_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCASTING_CLIENT_SECRET;

const API_BASE_URL = 'https://apiv2.twitcasting.tv';
const AUTH_URL = 'https://apiv2.twitcasting.tv/oauth2/authorize';
const TOKEN_URL = 'https://apiv2.twitcasting.tv/oauth2/access_token';

// Webhook/Callback URL (Nginx経由の公開URL)
const BASE_DOMAIN = 'https://elza.poitou-mora.ts.net';
// TwitCastingアプリに登録されているURLが /api/ のみだったので、今回は /api/twicas/auth/callback を使用
const CALLBACK_PATH = '/api/twicas/auth/callback';
const WEBHOOK_PATH = '/api/twitcasting-webhook'; // server.jsに既に実装済み

const CALLBACK_URL = `${BASE_DOMAIN}${CALLBACK_PATH}`;
const WEBHOOK_URL = `${BASE_DOMAIN}${WEBHOOK_PATH}`;

// 永続化ファイル（アクセストークン保存用）
const TOKEN_FILE = path.resolve(__dirname, 'twitcasting-token.json');

// 購読対象のユーザー (スクリーンID)
let TARGET_USER_SCREEN_ID = 'c:koinoya_mai'; 

// ユーザーIDから'c:'プレフィックスを削除する関数
function sanitizeScreenId(screenId) {
    if (screenId.startsWith('c:')) {
        return screenId.substring(2);
    }
    return screenId;
}

// 初期化時にIDをクリーンアップ
TARGET_USER_SCREEN_ID = sanitizeScreenId(TARGET_USER_SCREEN_ID);

let accessToken = null;

// --- 状態管理 ---
function loadToken() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            accessToken = data.access_token;
            return true;
        }
    } catch (e) {
        console.error('TwitCasting token load error:', e);
    }
    return false;
}

function saveToken(token) {
    try {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(token), 'utf8');
        accessToken = token.access_token;
        console.log('TwitCasting: Access token saved.');
    } catch (e) {
        console.error('TwitCasting token save error:', e);
    }
}

// --- 認証フロー ---

// 認証開始URLを生成
function getAuthUrl() {
    const params = querystring.stringify({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: CALLBACK_URL,
        scope: 'readonly webhooks' // Webhook登録には webhooks スコープが必要
    });
    return `${AUTH_URL}?${params}`;
}

// 認証コードをトークンに交換する (server.jsから呼び出される)
async function exchangeCodeForToken(code) {
    try {
        const res = await axios.post(
            TOKEN_URL,
            querystring.stringify({
                grant_type: 'authorization_code',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
                redirect_uri: CALLBACK_URL
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        saveToken(res.data);
        return res.data.access_token;
    } catch (e) {
        console.error('TwitCasting: Failed to exchange code for token:', e.response ? e.response.data : e.message);
        return null;
    }
}

// --- Webhook 登録 (購読) ---

/**
 * スクリーンIDからTwitCastingの数値IDを取得する
 * @returns {string | null} ユーザーID
 */
async function getTwitCastingUserId() {
    if (!accessToken) {
        console.error('TwitCasting: Access token is missing.');
        return null;
    }
    
    // API v2 /users/:screen_id の形式を使用
    const url = `${API_BASE_URL}/users/${TARGET_USER_SCREEN_ID}`;
    
    try {
        const userRes = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Api-Version': '2.0' }
        });

        if (userRes.data && userRes.data.user && userRes.data.user.id) {
            console.log(`TwitCasting: Screen ID ${TARGET_USER_SCREEN_ID} is User ID ${userRes.data.user.id}`);
            return userRes.data.user.id;
        } else {
            console.error('TwitCasting: Failed to parse user ID response.', userRes.data);
            return null;
        }
    } catch (e) {
        console.error(`TwitCasting: Failed to get user ID for ${TARGET_USER_SCREEN_ID} (API Call failed):`, e.response ? e.response.data : e.message);
        return null;
    }
}


// Webhookを登録/購読する
async function subscribeToWebhook() {
    if (!accessToken) return false;
    
    // ユーザーIDを取得 (Webhook購読はユーザーIDで行う必要があるため)
    const userId = await getTwitCastingUserId();
    if (!userId) {
        console.error('TwitCasting: Webhook購読に失敗。ターゲットUser IDが不明です。');
        return false;
    }

    try {
        await axios.post(
            `${API_BASE_URL}/webhooks`,
            {
                user_id: userId,
                // 🚨 修正: live_start を購読する場合、live_end も必須
                events: ['live_start', 'live_end'], 
                url: WEBHOOK_URL
            },
            {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Api-Version': '2.0', 'Content-Type': 'application/json' }
            }
        );
        console.log(`TwitCasting: Webhook subscription successful for user ${TARGET_USER_SCREEN_ID} (${userId}).`);
        return true;
    } catch (e) {
        if (e.response && e.response.status === 409) {
            console.log(`TwitCasting: Webhook already subscribed for user ${TARGET_USER_SCREEN_ID}.`);
            return true;
        }
        console.error('TwitCasting: Failed to subscribe to webhook:', e.response ? e.response.data : e.message);
        return false;
    }
}

// 起動時にトークンを読み込み、Webhookを購読する
async function initTwitcastingApi() {
    loadToken();

    if (!accessToken) {
        console.warn('TwitCasting: Access token is missing. Please initiate OAuth flow.');
        // 認証用のURLをログに出力しておけば、管理者が見て手動で認証を開始できる
        console.log(`[認証URL]: ${getAuthUrl()}`);
        return false;
    }

    console.log('TwitCasting: Token loaded. Attempting to subscribe to webhook.');
    return subscribeToWebhook();
}

module.exports = {
    getAuthUrl,
    exchangeCodeForToken,
    subscribeToWebhook,
    initTwitcastingApi,
    TARGET_USER_SCREEN_ID,
    CALLBACK_PATH // server.jsで使う
};
