// auth.js
// Google OAuth 2.0 + JWT Cookie 認証モジュール
// 依存: google-auth-library, jsonwebtoken, cookie-parser
'use strict';

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ---- 設定 ----
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/auth/google/callback';
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] JWT_SECRET not set — using random key (sessions will not survive restart)');
  return generated;
})();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30日
};

// ---- Google OAuth クライアント ----
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

// ---- JWT ユーティリティ ----
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ---- ミドルウェア ----

/**
 * 認証必須ミドルウェア
 * Cookieまたは Authorization: Bearer ヘッダーのJWTを検証する
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
    || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });

  req.userId    = payload.userId;
  req.userEmail = payload.email;
  next();
}

/**
 * 認証任意ミドルウェア
 * トークンがあれば req.userId / req.userEmail を付与する（なくてもOK）
 */
function optionalAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
    || req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.userId    = payload.userId;
      req.userEmail = payload.email;
    }
  }
  next();
}

// ---- Google OAuth ----

/**
 * Googleの認証URLを生成する
 */
function getAuthUrl(state) {
  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: state || undefined,
  });
}

/**
 * Googleのコードをユーザー情報に交換する
 */
async function exchangeCodeForUser(code) {
  const { tokens } = await oauthClient.getToken(code);
  oauthClient.setCredentials(tokens);

  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  return {
    googleId:    payload.sub,
    email:       payload.email,
    displayName: payload.name,
    avatarUrl:   payload.picture,
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  getAuthUrl,
  exchangeCodeForUser,
  signToken,
  verifyToken,
  COOKIE_NAME,
  COOKIE_OPTIONS,
};
