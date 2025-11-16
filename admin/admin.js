// admin/admin.js - 管理者認証ミドルウェア
const crypto = require('crypto');

// SESSION_SECRETを先に定義
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// パスワードをハッシュ化（関数定義を先に）
function hashPassword(password, secret = SESSION_SECRET) {
  return crypto.createHash('sha256').update(password + secret).digest('hex');
}

// 環境変数から認証情報を取得（hashPassword関数を使うのはここから）
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || hashPassword('change-this-password');
const ALLOWED_IPS = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];

// セッション管理（メモリベース - 本番環境ではRedisなど推奨）
const sessions = new Map();
const SESSION_DURATION = 60 * 60 * 1000; // 1時間

// セッショントークン生成
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// IPアドレス取得
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress;
}

// IP制限チェック
function isIPAllowed(req) {
  if (ALLOWED_IPS.length === 0) return true; // IP制限なし
  const clientIP = getClientIP(req);
  return ALLOWED_IPS.some(ip => clientIP.includes(ip));
}

// セッション検証ミドルウェア
function requireAuth(req, res, next) {
  // IP制限チェック
  if (!isIPAllowed(req)) {
    console.warn(`[Security] Blocked access from IP: ${getClientIP(req)}`);
    return res.status(403).json({ error: 'Access denied: IP not allowed' });
  }

  const token = req.headers['x-admin-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = sessions.get(token);
  
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  // セッション有効期限チェック
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  // セッション延長
  session.expiresAt = Date.now() + SESSION_DURATION;
  req.adminUser = session.username;
  next();
}

// ログイン処理
function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // IP制限チェック
  if (!isIPAllowed(req)) {
    console.warn(`[Security] Blocked login attempt from IP: ${getClientIP(req)}`);
    return res.status(403).json({ error: 'Access denied: IP not allowed' });
  }

  // 認証
  const passwordHash = hashPassword(password);
  
  if (username !== ADMIN_USERNAME || passwordHash !== ADMIN_PASSWORD_HASH) {
    // ブルートフォース対策: 遅延
    setTimeout(() => {
      console.warn(`[Security] Failed login attempt: ${username} from ${getClientIP(req)}`);
      res.status(401).json({ error: 'Invalid credentials' });
    }, 1000);
    return;
  }

  // セッショントークン生成
  const token = generateSessionToken();
  sessions.set(token, {
    username: username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
    ip: getClientIP(req)
  });

  console.log(`[Security] Admin logged in: ${username} from ${getClientIP(req)}`);

  res.json({
    success: true,
    token: token,
    expiresIn: SESSION_DURATION
  });
}

// ログアウト処理
function logout(req, res) {
  const token = req.headers['x-admin-token'];
  
  if (token) {
    sessions.delete(token);
  }

  res.json({ success: true, message: 'Logged out' });
}

// セッションクリーンアップ（古いセッションを定期削除）
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}, 5 * 60 * 1000); // 5分ごと

// 初回パスワード設定ヘルパー
function generatePasswordHash(password) {
  return hashPassword(password);
}

module.exports = {
  requireAuth,
  login,
  logout,
  generatePasswordHash,
  hashPassword
};