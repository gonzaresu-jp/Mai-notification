'use strict';
const crypto = require('crypto');

// /api/notify 送信時に必須の HMAC 署名（X-Notify-Hmac: hex of JSON.stringify(body)）を生成する。
// 2026-09 改修で受信側は HMAC 必須（未設定時 503 / 不一致 401）のため、
// 全送信モジュール（twitter / twitcasting / fanbox / youtube / bilibili / main.js）は
// このヘルパーを使って署名を付けること。
function signNotifyPayload(secret, body) {
  if (!secret) return null;
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto.createHmac('sha256', String(secret)).update(payload).digest('hex');
}

module.exports = { signNotifyPayload };