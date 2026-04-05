// admin/admin.js - 管理者認証ミドルウェア
require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });

const crypto = require('crypto');
const bcrypt = require('bcrypt');

// SESSION_SECRETを先に定義
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  console.warn('[Security] WARNING: SESSION_SECRET is not set. Using a random value (sessions will reset on restart).');
  return crypto.randomBytes(32).toString('hex');
})();

// 環境変数から認証情報を取得
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
// ADMIN_PASSWORD_HASH は bcrypt ハッシュを環境変数に設定すること
// 生成例: node -e "const b=require('bcrypt'); b.hash('yourpassword',12).then(console.log)"
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;

// 🔒 ALLOWED_IPS は信頼できるプロキシのIPのみ許可する想定
const ALLOWED_IPS = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(s => s.trim()) : [];

// セッション管理（メモリベース - 本番環境ではRedisなど推奨）
const sessions = new Map();
const SESSION_DURATION = 60 * 60 * 1000; // 1時間

// 🔒 ブルートフォース対策 - ログイン試行カウンター
const loginAttempts = new Map(); // key: IP, value: { count, blockedUntil }
const MAX_LOGIN_ATTEMPTS = 10;
const BLOCK_DURATION = 15 * 60 * 1000; // 15分ブロック

// セッショントークン生成
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 🔒 IPアドレス取得 - 信頼できるプロキシ経由のみX-Forwarded-Forを読む
function getClientIP(req) {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] ||
         req.socket?.remoteAddress ||
         req.connection?.remoteAddress ||
         'unknown';
}

// IP制限チェック
function isIPAllowed(req) {
  if (ALLOWED_IPS.length === 0) return true;
  const clientIP = getClientIP(req);
  return ALLOWED_IPS.some(ip => clientIP === ip || clientIP.includes(ip));
}

// 🔒 ログイン試行チェック
function isLoginBlocked(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (entry.blockedUntil && Date.now() < entry.blockedUntil) return true;
  if (entry.blockedUntil && Date.now() >= entry.blockedUntil) {
    loginAttempts.delete(ip);
  }
  return false;
}

function recordFailedLogin(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION;
    console.warn(`[Security] IP blocked due to too many failed attempts: ${ip}`);
  }
  loginAttempts.set(ip, entry);
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// セッション検証ミドルウェア
function requireAuth(req, res, next) {
  if (!isIPAllowed(req)) {
    console.warn(`[Security] Blocked access from IP: ${getClientIP(req)}`);
    return res.status(403).json({ error: 'Access denied: IP not allowed' });
  }

  // 🔒 NOTIFY_TOKEN もIP制限通過後のみ許可 + ログを残す
  const token = req.headers['x-admin-token'] || req.cookies?.adminToken;

  if (process.env.ADMIN_NOTIFY_TOKEN && token === process.env.ADMIN_NOTIFY_TOKEN) {
    console.log(`[Security] NOTIFY_TOKEN used from IP: ${getClientIP(req)}`);
    req.adminUser = 'notify-bot';
    return next();
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = sessions.get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  session.expiresAt = Date.now() + SESSION_DURATION;
  req.adminUser = session.username;
  next();
}

// -------------------------------------------------
// 管理者リクエストか判定するヘルパー
// -------------------------------------------------
function isAdminRequest(req) {
  if (req.adminUser) {
    return true;
  }
  const token = req.headers['x-admin-token'] || req.cookies?.adminToken;
  if (!token) {
    return false;
  }
  if (process.env.ADMIN_NOTIFY_TOKEN && token === process.env.ADMIN_NOTIFY_TOKEN) {
    return true;
  }
  const session = sessions.get(token);
  if (session && Date.now() <= session.expiresAt) {
    return true;
  }
  return false;
}


// ログイン処理
async function login(req, res) {
  console.log("[DEBUG] ADMIN_PASSWORD_HASH:", process.env.ADMIN_PASSWORD_HASH ? "SET" : "NOT SET");
  console.log("[DEBUG] ADMIN_USERNAME:", process.env.ADMIN_USERNAME);
  const { username, password } = req.body;
  const clientIP = getClientIP(req);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (!isIPAllowed(req)) {
    console.warn(`[Security] Blocked login attempt from IP: ${clientIP}`);
    return res.status(403).json({ error: 'Access denied: IP not allowed' });
  }

  // 🔒 ブルートフォース - IPブロックチェック
  if (isLoginBlocked(clientIP)) {
    console.warn(`[Security] Blocked login attempt (rate limit) from IP: ${clientIP}`);
    return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
  }

  // 🔒 ADMIN_PASSWORD_HASH 未設定はログイン不可
  if (!ADMIN_PASSWORD_HASH) {
    console.error('[Security] ADMIN_PASSWORD_HASH is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 🔒 bcrypt で比較（タイミング攻撃・ブルートフォースに強い）
    console.log("[DEBUG] input username:", username, "expected:", ADMIN_USERNAME);
    console.log("[DEBUG] input pw length:", password.length);
    const usernameMatch = username === ADMIN_USERNAME;
    console.log("[DEBUG] hash in memory:", ADMIN_PASSWORD_HASH);
    const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

    if (!usernameMatch || !passwordMatch) {
      recordFailedLogin(clientIP);
      console.warn(`[Security] Failed login attempt: ${username} from ${clientIP}`);
      await new Promise(r => setTimeout(r, 1000));
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('[Security] bcrypt error:', err);
    return res.status(500).json({ error: 'Server error' });
  }

  clearLoginAttempts(clientIP);

  const token = generateSessionToken();
  sessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
    ip: clientIP
  });

  console.log(`[Security] Admin logged in: ${username} from ${clientIP}`);

  // 🔒 HttpOnly Cookie でトークンを返す（XSS対策）
  res.cookie('adminToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_DURATION
  });

  res.json({ success: true, expiresIn: SESSION_DURATION });
}

// ログアウト処理
function logout(req, res) {
  const token = req.headers['x-admin-token'] || req.cookies?.adminToken;

  if (token) {
    sessions.delete(token);
  }

  res.clearCookie('adminToken');
  res.json({ success: true, message: 'Logged out' });
}

// セッションクリーンアップ
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) sessions.delete(token);
  }
  for (const [ip, entry] of loginAttempts.entries()) {
    if (entry.blockedUntil && now > entry.blockedUntil) loginAttempts.delete(ip);
  }
}, 5 * 60 * 1000);

// 初回パスワード設定ヘルパー
// 使い方: node -e "require('./admin').generatePasswordHash('yourpassword').then(console.log)"
async function generatePasswordHash(password) {
  return bcrypt.hash(password, 12);
}

module.exports = {
  requireAuth,
  login,
  logout,
  generatePasswordHash,
  isAdminRequest,
};