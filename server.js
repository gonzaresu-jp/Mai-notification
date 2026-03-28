// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const webpush = require('web-push');
const admin = require('firebase-admin');
const fs = require('fs');
const twitcasting = require('./twitcasting');
const MilestoneScheduler = require('./milestone');
require('dotenv').config();
const adminAuth = require('./admin/admin');
const cookieParser = require('cookie-parser');
const userRoutes   = require('./user-routes');
const auth = require('./auth');

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
// 認証エンドポイント用レートリミット（1分に20回まで）
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false
});

const app = express();
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);
let hasPlatformColumn = false;
let hasStatusColumn = false;
let hasScheduledKindColumn = false;
let hasScheduledRefIdColumn = false;

const { updateSchedule } = require('./weekly');

// サーバー起動時に一度実行
updateSchedule().catch(console.error);

// 5分毎に定期実行
setInterval(() => {
  updateSchedule().catch(console.error);
}, 5*60*1000);

const HISTORY_JSON_PATH = path.join(__dirname, 'webui', 'history.json');
const HISTORY_JSON_LIMIT = 20;
const HISTORY_HTML_PATH = path.join(__dirname, 'webui', 'history.html');
const HISTORY_HTML_LIMIT = 5;

const ADMIN_NOTIFY_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || null;
const NOTIFY_HMAC_SECRET = process.env.NOTIFY_HMAC_SECRET || null;
const DEFAULT_PLATFORM_SETTINGS = Object.freeze({
  twitcasting: true,
  youtube: true,
  youtubeCommunity: true,
  fanbox: true,
  twitterMain: true,
  twitterSub: true,
  milestone: true,
  schedule: true,
  gipt: true,
  twitch: true,
  bilibili: false
});

function parseAndMergePlatformSettings(settingsJson) {
  let parsed = {};
  if (typeof settingsJson === 'string' && settingsJson.trim() !== '') {
    try {
      parsed = JSON.parse(settingsJson);
    } catch (_) {
      parsed = {};
    }
  } else if (settingsJson && typeof settingsJson === 'object') {
    parsed = settingsJson;
  }
  if (!parsed || typeof parsed !== 'object') parsed = {};
  return { ...DEFAULT_PLATFORM_SETTINGS, ...parsed };
}

// 起動時 PRAGMA チューニング（db を作った直後に実行）
db.serialize(() => {
  // タイムアウト：ロック待ちを短時間でエラーにしない
  db.run("PRAGMA busy_timeout = 5000"); // ms

  // WAL にすることで「読み取りは書き込み中でも可能」かつ並行性が改善
  db.run("PRAGMA journal_mode = WAL");

  // 書き込みの同期度合い（パフォーマンスと安全性のバランス）
  db.run("PRAGMA synchronous = NORMAL");

  // 一時領域をメモリにする（大きい一時テーブルが多い場合）
  db.run("PRAGMA temp_store = MEMORY");

  // 別途必要なら page_size, cache_size なども調整可能
});

// SSE クライアント集合
const sseClients = new Set();

// SSE送信ユーティリティ（モジュールスコープ）
function sendSseEvent(payload, eventName = 'message') {
  const lines = [];
  if (eventName && eventName !== 'message') lines.push(`event: ${eventName}`);
  // data は複数行でもOKだが here we send single JSON line
  lines.push(`data: ${JSON.stringify(payload)}`);
  const msg = lines.join('\n') + '\n\n';

  for (const res of Array.from(sseClients)) {
    try {
      res.write(msg);
    } catch (e) {
      // 書き込みに失敗したら切断として扱う
      try { res.end(); } catch (_) {}
      sseClients.delete(res);
    }
  }
}

// 定期 ping（全クライアント保持に有効）
const SSE_PING_INTERVAL_MS = 25_000; // 25秒推奨（LBタイムアウトより短めに）
setInterval(() => {
  for (const res of Array.from(sseClients)) {
    try {
      res.write(': ping\n\n'); // コメント行はクライアントで無視される
    } catch (e) {
      try { res.end(); } catch (_) {}
      sseClients.delete(res);
    }
  }
}, SSE_PING_INTERVAL_MS);

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use('/pushweb', express.static(path.join(__dirname, 'pushweb')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.set('trust proxy', true);
app.use('/webui', express.static(path.join(__dirname, 'webui')));
userRoutes.register(app, db, authLimiter);


// --- VAPID設定 ---
let vapidConfig = {};
try {
  vapidConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'vapid.json'), 'utf8'));
  webpush.setVapidDetails(
    'mailto:admin@honna-yuzuki.com',
    vapidConfig.vapidPublicKey,
    vapidConfig.vapidPrivateKey
  );
  console.log('VAPIDキー読み込み成功');
} catch (e) {
  console.warn('vapid.json 読み込み失敗:', e.message);
  vapidConfig = { vapidPublicKey: 'test-key', vapidPrivateKey: 'test-key' };
  webpush.setVapidDetails('mailto:admin@honna-yuzuki.com', vapidConfig.vapidPublicKey, vapidConfig.vapidPrivateKey);
}
const FCM_SERVICE_ACCOUNT_JSON = process.env.FCM_SERVICE_ACCOUNT_JSON || null;
const FCM_SERVICE_ACCOUNT_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH || null;
let fcmMessaging = null;
let fcmInitAttempted = false;

function initFcm() {
  if (fcmMessaging) return fcmMessaging;
  if (fcmInitAttempted) return null;
  fcmInitAttempted = true;

  try {
    let serviceAccount = null;

    if (FCM_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
    } else if (FCM_SERVICE_ACCOUNT_PATH && fs.existsSync(FCM_SERVICE_ACCOUNT_PATH)) {
      serviceAccount = JSON.parse(fs.readFileSync(FCM_SERVICE_ACCOUNT_PATH, 'utf8'));
    }

    if (!serviceAccount) {
      console.warn('FCM disabled: service account not configured');
      return null;
    }

    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }

    fcmMessaging = admin.messaging();
    console.log('FCM initialized');
    return fcmMessaging;
  } catch (e) {
    console.warn('FCM init failed:', e && e.message ? e.message : e);
    return null;
  }
}

let milestoneScheduler;

// DB初期化
db.serialize(() => {
  // テーブル作成（エラーはログのみ）
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    url TEXT,
    icon TEXT,
    platform TEXT,
    status TEXT DEFAULT 'success',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    data TEXT
  )`, (err) => {
    if (err) console.error('notifications create err:', err.message);
    else console.log('notifications table ensured');
  });

  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    client_id TEXT NOT NULL UNIQUE,
    endpoint TEXT NOT NULL UNIQUE,
    subscription_json TEXT,
    settings_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('subscriptions create err:', err.message);
    else console.log('subscriptions table ensured');
  });
  db.run(`CREATE TABLE IF NOT EXISTS android_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    client_id TEXT NOT NULL,
    fcm_token TEXT NOT NULL UNIQUE,
    device_name TEXT,
    settings_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME
  )`, (err) => {
    if (err) console.error('android_devices create err:', err.message);
    else console.log('android_devices table ensured');
  });

  db.run(`CREATE TABLE IF NOT EXISTS scheduled_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at INTEGER NOT NULL,        -- UnixTime(ms)
    payload_json TEXT NOT NULL,     -- data/type/settingKey/clientId を丸ごと保存
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent INTEGER DEFAULT 0,
    sent_at INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_time DATETIME,
  end_time DATETIME,
  url TEXT,
  thumbnail_url TEXT,
  platform TEXT,  -- 'youtube', 'twitcasting', 'twitch', 'bilibili', 'other'
  event_type TEXT DEFAULT 'live',  -- 'live', 'video', 'voice', '1on1', 'other'
  description TEXT,
  status TEXT DEFAULT 'scheduled',  -- 'scheduled', 'live', 'ended', 'cancelled'
  external_id TEXT,  -- YouTube video ID など
  confirmed INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0,1)),  -- 管理者が内容を確認したか（true=1, false=0）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) console.error('events create err:', err.message);
  else console.log('events table ensured');
});
// インデックス作成
db.run(`CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time DESC)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_events_start_time_asc ON events (start_time ASC, status)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_events_status ON events (status)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_events_platform ON events (platform)`);
db.run(`CREATE TABLE IF NOT EXISTS weekly_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL UNIQUE, -- YYYY-MM-DD (週の開始日: 日曜)
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) console.error('weekly_messages create err:', err.message);
  else console.log('weekly_messages table ensured');
});
db.run(`CREATE INDEX IF NOT EXISTS idx_weekly_messages_week_start ON weekly_messages (week_start)`);
  // notifications テーブルに platform / status カラムが無ければ追加
  // ============================================
// DB Schema Migration / Startup Maintenance
// ============================================

// ----------------------------
// notifications
// ----------------------------
function ensureNotificationsSchema() {
  db.all("PRAGMA table_info(notifications)", [], (err, columns) => {
    if (err) {
      console.error('PRAGMA notifications err:', err.message);
      return;
    }

    const colNames = columns.map(c => c.name);

    if (!colNames.includes('platform')) {
      db.run("ALTER TABLE notifications ADD COLUMN platform TEXT");
      console.log('✅ notifications.platform 追加');
    }

    if (!colNames.includes('status')) {
      db.run("ALTER TABLE notifications ADD COLUMN status TEXT");
      db.run("UPDATE notifications SET status='success' WHERE status IS NULL");
      console.log('✅ notifications.status 追加 + default設定');
    }
  });
}

// ----------------------------
// events
// ----------------------------
function ensureEventsSchema() {
  db.all("PRAGMA table_info(events)", [], (err, columns) => {
    if (err) {
      console.error('PRAGMA events err:', err.message);
      return;
    }

    const colNames = columns.map(c => c.name);

    if (!colNames.includes('confirmed')) {
      db.run("ALTER TABLE events ADD COLUMN confirmed INTEGER");
      console.log('✅ events.confirmed 追加');
    }
  });
}

// ----------------------------
// scheduled_notifications
// ★ sent_at をここで追加（最重要）
// ----------------------------
function ensureScheduledSchema() {
  db.all("PRAGMA table_info(scheduled_notifications)", [], (err, columns) => {
    if (err) {
      console.error('PRAGMA scheduled_notifications err:', err.message);
      return;
    }

    const colNames = columns.map(c => c.name);

    if (!colNames.includes('sent_at')) {
      db.run("ALTER TABLE scheduled_notifications ADD COLUMN sent_at INTEGER");
      console.log('✅ scheduled_notifications.sent_at 追加');
    }

    hasScheduledKindColumn = colNames.includes('kind');
    hasScheduledRefIdColumn = colNames.includes('ref_id');

    if (!hasScheduledKindColumn) {
      db.run("ALTER TABLE scheduled_notifications ADD COLUMN kind TEXT", (alterErr) => {
        if (alterErr) {
          console.error('scheduled_notifications.kind 追加失敗:', alterErr.message);
          return;
        }
        hasScheduledKindColumn = true;
        console.log('✅ scheduled_notifications.kind 追加');
        ensureIndexes();
      });
    }

    if (!hasScheduledRefIdColumn) {
      db.run("ALTER TABLE scheduled_notifications ADD COLUMN ref_id INTEGER", (alterErr) => {
        if (alterErr) {
          console.error('scheduled_notifications.ref_id 追加失敗:', alterErr.message);
          return;
        }
        hasScheduledRefIdColumn = true;
        console.log('✅ scheduled_notifications.ref_id 追加');
        ensureIndexes();
      });
    }

    if (hasScheduledKindColumn && hasScheduledRefIdColumn) {
      ensureIndexes();
    }
  });
}


// ----------------------------
// ----------------------------
// subscriptions
// ----------------------------
function ensureSubscriptionsSchema() {
  db.all("PRAGMA table_info(subscriptions)", [], (err, columns) => {
    if (err) {
      console.error('PRAGMA subscriptions err:', err.message);
      return;
    }

    const colNames = columns.map(c => c.name);

    if (!colNames.includes('user_id')) {
      db.run("ALTER TABLE subscriptions ADD COLUMN user_id INTEGER", (alterErr) => {
        if (alterErr) console.error('subscriptions.user_id 追加失敗:', alterErr.message);
        else console.log('✅ subscriptions.user_id 追加');
      });
    }
  });
}


// ----------------------------
// android_devices
// ----------------------------
function ensureAndroidSchema() {
  db.all("PRAGMA table_info(android_devices)", [], (err, columns) => {
    if (err) {
      console.error('PRAGMA android_devices err:', err.message);
      return;
    }

    const colNames = columns.map(c => c.name);

    if (!colNames.includes('user_id')) {
      db.run("ALTER TABLE android_devices ADD COLUMN user_id INTEGER", (alterErr) => {
        if (alterErr) console.error('android_devices.user_id 追加失敗:', alterErr.message);
        else console.log('✅ android_devices.user_id 追加');
      });
    }
  });
}
// Indexes
// ----------------------------
function ensureIndexes() {
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id 
     ON subscriptions (client_id)`
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id 
     ON subscriptions (user_id)`
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_android_devices_client_id 
     ON android_devices (client_id)`
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_android_devices_user_id 
     ON android_devices (user_id)`
  );

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
     ON notifications (created_at DESC)`
  );

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_due
     ON scheduled_notifications (sent, run_at)`
  );

  if (hasScheduledKindColumn && hasScheduledRefIdColumn) {
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_event_ref
       ON scheduled_notifications (kind, ref_id, sent)`
    );
  }

  console.log('✅ indexes ensured');
}


// ----------------------------
// 重複クリーンアップ
// ----------------------------
function cleanupDuplicates() {
  db.all(
    `SELECT client_id, COUNT(*) c
     FROM subscriptions
     GROUP BY client_id
     HAVING c > 1`,
    [],
    (err, duplicates) => {
      if (err || !duplicates?.length) return;

      console.log(`⚠️ duplicates: ${duplicates.length}`);

      db.run('BEGIN');

      let pending = duplicates.length;

      duplicates.forEach(d => {
        db.run(
          `DELETE FROM subscriptions
           WHERE client_id = ?
           AND id NOT IN (
             SELECT MAX(id) FROM subscriptions WHERE client_id = ?
           )`,
          [d.client_id, d.client_id],
          function () {
            pending--;
            if (pending === 0) db.run('COMMIT');
          }
        );
      });
    }
  );
}

function backfillPlatformSettingsDefaults() {
  db.all('SELECT id, settings_json FROM subscriptions', [], (err, rows) => {
    if (err) {
      console.error('backfill settings load err:', err.message);
      return;
    }
    if (!rows || !rows.length) return;

    const targets = [];
    for (const row of rows) {
      const merged = parseAndMergePlatformSettings(row.settings_json);
      const mergedJson = JSON.stringify(merged);
      if (mergedJson !== (row.settings_json || '')) {
        targets.push({ id: row.id, settingsJson: mergedJson });
      }
    }

    if (!targets.length) return;

    let pending = targets.length;
    let updated = 0;
    for (const target of targets) {
      db.run(
        'UPDATE subscriptions SET settings_json = ? WHERE id = ?',
        [target.settingsJson, target.id],
        function (updateErr) {
          if (updateErr) {
            console.error('backfill settings update err:', updateErr.message);
          } else {
            updated += this.changes || 0;
          }
          pending -= 1;
          if (pending === 0) {
            console.log(`✅ subscriptions.settings_json backfilled: ${updated}`);
          }
        }
      );
    }
  });
}


// ============================================
// 実行
// ============================================

ensureNotificationsSchema();
ensureScheduledSchema();   // ← ★ これが今回の本命
ensureEventsSchema();
ensureSubscriptionsSchema();
ensureAndroidSchema();
ensureIndexes();
cleanupDuplicates();
backfillPlatformSettingsDefaults();
userRoutes.initUserTables(db);
});

// プロセス終了時に DB をクローズ（データ破損回避）
process.on('SIGINT', () => {
  console.log('SIGINT received: closing DB and exiting');
  db.close((err) => {
    if (err) console.error('DB close err:', err.message);
    else console.log('DB closed');
    process.exit(err ? 1 : 0);
  });
});

//console.log('ADMIN_NOTIFY_TOKEN:', process.env.ADMIN_NOTIFY_TOKEN);

// --- 通知送信共通 (修正版) ---
async function sendPushNotification(subscription, payload, dbRef, isTest = false) {
  if (!subscription || !subscription.endpoint) {
    console.error('sendPushNotification: invalid subscription object', { subscription });
    return false;
  }

  const options = isTest ? { TTL: 60 } : {};

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), options);
    return true;
  } catch (err) {
    const status = err && err.statusCode;
    // 詳細ログ（エラーの本体を可能な範囲で出す）
    console.error('Push send error', {
      endpoint: subscription.endpoint,
      status,
      message: err && err.message,
      stack: err && err.stack,
      body: err && err.body
    });

    // 永続的に無効なサブスクリプションは DB から削除する
    if (status === 410 || status === 404) {
      console.log('Expired/invalid subscription — removing from DB:', subscription.endpoint);

      if (dbRef && typeof dbRef.run === 'function') {
        dbRef.run('DELETE FROM subscriptions WHERE endpoint = ?', [subscription.endpoint], function(delErr) {
          if (delErr) {
            console.error('DB delete err while removing expired subscription:', delErr.message);
          } else {
            console.log('DB delete success for endpoint:', subscription.endpoint);
          }
        });
      } else {
        console.warn('DB reference not provided or invalid; skipping deletion of endpoint:', subscription.endpoint);
      }
    }

    return false;
  }
}

function buildFcmData(payload, type, settingKey) {
  const data = payload || {};
  const out = {};

  function put(key, value) {
    if (value === undefined || value === null) return;
    out[key] = String(value);
  }

  put('title', data.title);
  put('body', data.body);
  put('url', data.url);
  put('icon', data.icon);
  if (type) put('type', type);
  if (settingKey) put('settingKey', settingKey);

  return out;
}

function isInvalidFcmError(err) {
  const code = err && err.code ? String(err.code) : '';
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument'
  );
}

async function sendFcmNotification(messaging, token, payload, type, settingKey, isTest = false) {
  if (!messaging || !token) return { sent: false, reason: 'fcm_disabled_or_missing_token' };

  const data = buildFcmData(payload, type, settingKey);

  const message = {
    token,
    data,
    android: { priority: 'high' }
  };

  try {
    await messaging.send(message, isTest === true);
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err };
  }
}

// 過去のイベントのステータスを自動更新
function updateEventStatuses() {
  const now = new Date().toISOString();

  // 開始時刻を過ぎた scheduled イベントを live に
  db.run(`
    UPDATE events 
    SET status = 'live', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'scheduled' 
    AND start_time <= ?
  `, [now], function(err) {
    if (err) {
      console.error('updateEventStatuses (to live) err:', err.message);
    } else if (this.changes > 0) {
      console.log(`[Event Status] ${this.changes} events marked as live`);
    }
  });

  // 終了時刻を過ぎた live イベントを ended に
  db.run(`
    UPDATE events 
    SET status = 'ended', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'live' 
    AND end_time IS NOT NULL 
    AND end_time <= ?
  `, [now], function(err) {
    if (err) {
      console.error('updateEventStatuses (to ended) err:', err.message);
    } else if (this.changes > 0) {
      console.log(`[Event Status] ${this.changes} events marked as ended`);
    }
  });

  // 終了時刻がない場合、開始時刻から3時間後に ended に
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  db.run(`
    UPDATE events 
    SET status = 'ended', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'live' 
    AND end_time IS NULL 
    AND start_time <= ?
  `, [threeHoursAgo], function(err) {
    if (err) {
      console.error('updateEventStatuses (auto-ended) err:', err.message);
    } else if (this.changes > 0) {
      console.log(`[Event Status] ${this.changes} events auto-marked as ended`);
    }
  });
}

// 5分ごとにイベントステータスを更新
setInterval(updateEventStatuses, 5 * 60 * 1000);
// 起動時にも一度実行
setTimeout(updateEventStatuses, 5000);

// ==============================
// 日付ユーティリティ（サーバー専用）
// ==============================

// YYYY-MM-DD
function toLocalDateString(date) {
  const d = new Date(date);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

// YYYY-MM-DD HH:mm:ss
function formatLocalDate(date) {
  const d = new Date(date);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function getWeekBoundsByDate(dateInput) {
  const targetDate = new Date(dateInput || toLocalDateString(new Date()));
  const dayOfWeek = targetDate.getDay();

  const sunday = new Date(targetDate);
  sunday.setDate(targetDate.getDate() - dayOfWeek);

  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);

  return {
    sunday,
    nextSunday,
    from: formatLocalDate(sunday),
    to: formatLocalDate(nextSunday),
    weekStart: toLocalDateString(sunday)
  };
}

const EVENT_PRE_OFFSETS_MS = [
  30 * 60 * 1000, // 30分前
  3 * 60 * 1000   // ★ 3分前 追加
];
const EVENT_NOTIFY_GRACE_MS = 2 * 60 * 1000;
const EVENT_NOTIFY_LOOKAHEAD_DAYS = 14;
const EVENT_NOTIFY_SYNC_INTERVAL_MS = 60 * 1000;

function buildEventNotificationPayload(event, phase) {
  const startDate = new Date(event.start_time);
  const hh = String(startDate.getHours()).padStart(2, '0');
  const mm = String(startDate.getMinutes()).padStart(2, '0');
  const timeLabel = `${hh}:${mm}`;
  const isPre = phase.startsWith('event_pre');
  const offsetMin = isPre
    ? Math.round(parseInt(phase.split('_')[2], 10) / 60000)
    : 0;

  return {
    type: 'event',
    settingKey: 'schedule',
    data: {
      title: event.title || '予定通知',
      body: isPre
        ? `開始${offsetMin}分前です（${timeLabel}予定）`
        : `予定時刻になりました（${timeLabel}）`,
      url: event.url || '/webui/events.html',
      icon: '/webui/icon.webp'
    }
  };
}

function syncEventNotifications() {
  return new Promise((resolve) => {
    if (!hasScheduledKindColumn || !hasScheduledRefIdColumn) {
      ensureScheduledSchema();
      return resolve();
    }

    const now = Date.now();
    const maxOffset = Math.max(...EVENT_PRE_OFFSETS_MS);
    const fromIso = new Date(now - maxOffset - EVENT_NOTIFY_GRACE_MS).toISOString();
    const toIso = new Date(now + EVENT_NOTIFY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();

    db.all(
      `
      SELECT id, title, start_time, url, platform, event_type, status
      FROM events
      WHERE start_time IS NOT NULL
      AND status != 'cancelled'
      AND event_type != 'memo'
      AND start_time >= ?
      AND start_time <= ?
      `,
      [fromIso, toIso],
      async (err, events) => {
        if (err) {
          console.error('[Event Notify Sync] events load err:', err.message);
          return resolve();
        }

        let inserted = 0;
        let updated = 0;
        let deleted = 0;

        try {
          for (const event of events || []) {
            const startMs = new Date(event.start_time).getTime();
            if (!Number.isFinite(startMs)) continue;

            const phases = EVENT_PRE_OFFSETS_MS.map(offset => ({
              kind: `event_pre_${offset}`,   // ← 衝突回避のためユニーク化
              runAt: startMs - offset
            }));

            if (String(event.event_type || '').toLowerCase() !== 'live') {
              phases.push({ kind: 'event_start', runAt: startMs });
            } else {
              await new Promise((r) => {
                db.run(
                  `DELETE FROM scheduled_notifications
                   WHERE sent = 0 AND kind = 'event_start' AND ref_id = ?`,
                  [event.id],
                  function () {
                    deleted += this.changes || 0;
                    r();
                  }
                );
              });
            }

            for (const phase of phases) {
              if (phase.runAt < now - EVENT_NOTIFY_GRACE_MS) continue;

              const payloadJson = JSON.stringify(buildEventNotificationPayload(event, phase.kind));

              const existing = await new Promise((r) => {
                db.get(
                  `SELECT id, run_at, payload_json, sent
                   FROM scheduled_notifications
                   WHERE kind = ? AND ref_id = ?
                   ORDER BY id DESC
                   LIMIT 1`,
                  [phase.kind, event.id],
                  (getErr, row) => {
                    if (getErr) {
                      console.error('[Event Notify Sync] lookup err:', getErr.message);
                      return r(null);
                    }
                    r(row || null);
                  }
                );
              });

              if (!existing) {
                await new Promise((r) => {
                  db.run(
                    `INSERT INTO scheduled_notifications (run_at, payload_json, kind, ref_id)
                     VALUES (?, ?, ?, ?)`,
                    [phase.runAt, payloadJson, phase.kind, event.id],
                    function (insertErr) {
                      if (insertErr) {
                        console.error('[Event Notify Sync] insert err:', insertErr.message);
                      } else {
                        inserted += 1;
                      }
                      r();
                    }
                  );
                });
              } else if (
                existing.sent === 1 &&
                existing.run_at === phase.runAt &&
                existing.payload_json === payloadJson
              ) {
                // 同条件で送信済みなら何もしない
              } else if (existing.sent === 0) {
                await new Promise((r) => {
                  db.run(
                    `UPDATE scheduled_notifications
                     SET run_at = ?, payload_json = ?, sent = 0
                     WHERE id = ?`,
                    [phase.runAt, payloadJson, existing.id],
                    function (updateErr) {
                      if (updateErr) {
                        console.error('[Event Notify Sync] update err:', updateErr.message);
                      } else {
                        updated += this.changes || 0;
                      }
                      r();
                    }
                  );
                });
              } else if (existing.sent === 2) {
                // scheduler 処理中は触らない
              } else {
                await new Promise((r) => {
                  db.run(
                    `INSERT INTO scheduled_notifications (run_at, payload_json, kind, ref_id)
                     VALUES (?, ?, ?, ?)`,
                    [phase.runAt, payloadJson, phase.kind, event.id],
                    function (insertErr) {
                      if (insertErr) {
                        console.error('[Event Notify Sync] insert err:', insertErr.message);
                      } else {
                        inserted += 1;
                      }
                      r();
                    }
                  );
                });
              }
            }
          }

          await new Promise((r) => {
            db.run(
              `
              DELETE FROM scheduled_notifications
              WHERE sent = 0
              AND (kind LIKE 'event_pre_%' OR kind = 'event_start')
              AND ref_id NOT IN (
                SELECT id FROM events
                WHERE start_time IS NOT NULL
                AND status != 'cancelled'
              )
              `,
              [],
              function (cleanupErr) {
                if (cleanupErr) {
                  console.error('[Event Notify Sync] cleanup err:', cleanupErr.message);
                } else {
                  deleted += this.changes || 0;
                }
                r();
              }
            );
          });

          if (inserted || updated || deleted) {
            console.log(`[Event Notify Sync] inserted=${inserted} updated=${updated} deleted=${deleted}`);
          }
        } catch (e) {
          console.error('[Event Notify Sync] fatal:', e && e.message ? e.message : e);
        }

        resolve();
      }
    );
  });
}

setInterval(() => {
  syncEventNotifications().catch((e) => {
    console.error('[Event Notify Sync] interval err:', e && e.message ? e.message : e);
  });
}, EVENT_NOTIFY_SYNC_INTERVAL_MS);
setTimeout(() => {
  syncEventNotifications().catch((e) => {
    console.error('[Event Notify Sync] startup err:', e && e.message ? e.message : e);
  });
}, 10 * 1000);

// ----------------------------------------------------
// --- API ---
// ----------------------------------------------------
// --- 購読保存・更新（統合版） ---
app.post('/api/save-platform-settings', (req, res) => {
  console.log('\n========== /api/save-platform-settings START ==========');
  console.log('Request Body keys:', Object.keys(req.body));

  const { clientId, subscription, settings } = req.body || {};

  if (!clientId) {
    console.error('clientId missing');
    return res.status(400).json({ error: 'clientId required' });
  }

  // subscription の簡易バリデーション
  if (!subscription || typeof subscription !== 'object' || !subscription.endpoint) {
    console.error('invalid subscription payload');
    return res.status(400).json({ error: 'subscription and endpoint required' });
  }

  let subscriptionJson;
  try {
    subscriptionJson = JSON.stringify(subscription);
  } catch (e) {
    console.error('subscription JSON stringify failed:', e.message);
    return res.status(400).json({ error: 'invalid subscription object' });
  }

  const mergedSettings = settings ? parseAndMergePlatformSettings(settings) : { ...DEFAULT_PLATFORM_SETTINGS };
  const settingsJson = JSON.stringify(mergedSettings);
  const endpoint = subscription.endpoint;

  console.log('clientId:', clientId);
  console.log('endpoint (prefix):', endpoint.substring(0, 80));
  console.log('subscriptionJson length:', subscriptionJson.length);
  if (settingsJson) console.log('settingsJson:', settingsJson);

  // 決定方針：
  // 1) 可能なら一発で UPSERT を使う（ON CONFLICT(endpoint) DO UPDATE）
  // 2) SQLite が UPSERT をサポートしない or UNIQUE 冲突で失敗したらフォールバックで UPDATE→INSERT を行う

  const upsertSql = `
    INSERT INTO subscriptions (client_id, endpoint, subscription_json, settings_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      client_id = excluded.client_id,
      subscription_json = excluded.subscription_json,
      settings_json = excluded.settings_json
  `;

  const upsertParams = [clientId, endpoint, subscriptionJson, settingsJson];

  // helper: fallback path (UPDATE by clientId, if no rows then INSERT)
  function fallbackUpsert(callback) {
    // Try update by clientId first (preserve existing endpoint if needed)
    const updates = [];
    const params = [];

    updates.push('subscription_json = ?');
    params.push(subscriptionJson);

    if (settingsJson) {
      updates.push('settings_json = ?');
      params.push(settingsJson);
    }

    // Also update endpoint if provided (endpoint should always be present)
    updates.push('endpoint = ?');
    params.push(endpoint);

    params.push(clientId);

    const updateSql = `UPDATE subscriptions SET ${updates.join(', ')} WHERE client_id = ?`;

    db.run(updateSql, params, function(updateErr) {
      if (updateErr) {
        // If UNIQUE constraint on endpoint triggered, try deleting existing conflicting record then insert
        if (updateErr.message && updateErr.message.includes('UNIQUE')) {
          console.warn('UPDATE caused UNIQUE conflict, attempting to resolve by deleting conflicting endpoint then insert');
          db.run('DELETE FROM subscriptions WHERE endpoint = ? AND client_id != ?', [endpoint, clientId], function(delErr) {
            if (delErr) {
              console.error('Failed to delete conflicting endpoint:', delErr.message);
              return callback(delErr);
            }
            // After removing conflict, try insert
            db.run('INSERT INTO subscriptions (client_id, endpoint, subscription_json, settings_json) VALUES (?, ?, ?, ?)',
              upsertParams, function(insertErr) {
                if (insertErr) return callback(insertErr);
                return callback(null, { lastID: this.lastID, changes: this.changes });
              });
          });
        } else {
          return callback(updateErr);
        }
      } else if (this && this.changes && this.changes > 0) {
        // updated existing row
        return callback(null, { updated: true, changes: this.changes });
      } else {
        // no existing row for clientId -> insert
        db.run('INSERT INTO subscriptions (client_id, endpoint, subscription_json, settings_json) VALUES (?, ?, ?, ?)',
          upsertParams, function(insertErr) {
            if (insertErr) return callback(insertErr);
            return callback(null, { lastID: this.lastID, changes: this.changes });
          });
      }
    });
  }

  // 実行パス：まず UPSERT SQL を試す（高速パス）
  db.run(upsertSql, upsertParams, function(upsertErr) {
    if (!upsertErr) {
      console.log('UPSERT succeeded (fast path). lastID:', this.lastID, 'changes:', this.changes);
      console.log('========== /api/save-platform-settings END ==========\n');
      return res.json({ success: true, message: 'Subscription saved' });
    }

    // UPSERT failed -> フォールバック（古い SQLite 等の互換性対策）
    console.warn('UPSERT failed, falling back. reason:', upsertErr.message);

    fallbackUpsert((fallbackErr, info) => {
      if (fallbackErr) {
        console.error('Fallback upsert error:', fallbackErr.message);
        return res.status(500).json({ error: 'DB upsert error', detail: fallbackErr.message });
      }
      console.log('Fallback upsert success:', info);
      console.log('========== /api/save-platform-settings END ==========\n');
      return res.json({ success: true, message: 'Subscription saved' });
    });
  });
});

// --- 購読削除 (DELETE メソッド) ---
app.delete('/api/save-platform-settings', (req, res) => {
  // 一部クライアントは DELETE で body を送らない場合があるため、クエリにも対応
  const clientId = (req.body && req.body.clientId) || req.query.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  db.run('DELETE FROM subscriptions WHERE client_id = ?', [clientId], function(err) {
    if (err) {
      console.error('/api/save-platform-settings DELETE err:', err.message);
      return res.status(500).json({ error: 'DB delete error', detail: err.message });
    }
    console.log('/api/save-platform-settings DELETE success:', { clientId, deleted: this.changes });
    return res.json({ success: true, message: 'Subscription deleted', deleted: this.changes });
  });
});

// --- Android通知デバイス登録 ---
app.post('/api/android/register', auth.optionalAuth, (req, res) => {
  const { clientId, fcmToken, deviceName, settings } = req.body || {};

  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'clientId required' });
  }
  if (!fcmToken || typeof fcmToken !== 'string') {
    return res.status(400).json({ error: 'fcmToken required' });
  }

  const trimmedClientId = clientId.trim();
  const trimmedToken = fcmToken.trim();
  if (!trimmedClientId || trimmedClientId.length > 256) {
    return res.status(400).json({ error: 'invalid clientId' });
  }
  if (trimmedToken.length < 20 || trimmedToken.length > 4096) {
    return res.status(400).json({ error: 'invalid fcmToken' });
  }

  const mergedSettings = settings
    ? parseAndMergePlatformSettings(settings)
    : { ...DEFAULT_PLATFORM_SETTINGS };
  const settingsJson = JSON.stringify(mergedSettings);

  const upsertSql = `
    INSERT INTO android_devices (client_id, fcm_token, device_name, settings_json, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(fcm_token) DO UPDATE SET
      client_id = excluded.client_id,
      device_name = excluded.device_name,
      settings_json = excluded.settings_json,
      updated_at = CURRENT_TIMESTAMP,
      last_seen_at = CURRENT_TIMESTAMP
  `;

  const params = [trimmedClientId, trimmedToken, deviceName || null, settingsJson];

  function linkUserIfPossible() {
    if (!req.userId) return;
    db.run(
      'UPDATE android_devices SET user_id = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE fcm_token = ?',
      [req.userId, trimmedToken],
      (linkErr) => {
        if (linkErr) console.warn('[android] link user failed:', linkErr.message);
      }
    );
  }

  db.run(upsertSql, params, function (err) {
    if (!err) {
      linkUserIfPossible();
      linkUserIfPossible();
            return res.json({ success: true, message: 'Android device registered' });
    }

    console.warn('android register upsert failed, fallback:', err.message);

    db.run(
      'UPDATE android_devices SET client_id = ?, device_name = ?, settings_json = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE fcm_token = ?',
      [trimmedClientId, deviceName || null, settingsJson, trimmedToken],
      function (updateErr) {
        if (updateErr) {
          return res.status(500).json({ error: 'DB update error', detail: updateErr.message });
        }
        if (this.changes > 0) {
          linkUserIfPossible();
          return res.json({ success: true, message: 'Android device updated' });
        }

        db.run(
          'INSERT INTO android_devices (client_id, fcm_token, device_name, settings_json, updated_at, last_seen_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          params,
          function (insertErr) {
            if (insertErr) {
              return res.status(500).json({ error: 'DB insert error', detail: insertErr.message });
            }
            linkUserIfPossible();
      linkUserIfPossible();
            return res.json({ success: true, message: 'Android device registered' });
          }
        );
      }
    );
  });
});

// --- Android通知デバイス削除 ---
app.delete('/api/android/register', (req, res) => {
  const fcmToken = (req.body && req.body.fcmToken) || req.query.fcmToken;
  const clientId = (req.body && req.body.clientId) || req.query.clientId;

  if (!fcmToken && !clientId) {
    return res.status(400).json({ error: 'fcmToken or clientId required' });
  }

  const sql = fcmToken
    ? 'DELETE FROM android_devices WHERE fcm_token = ?'
    : 'DELETE FROM android_devices WHERE client_id = ?';
  const param = fcmToken ? String(fcmToken).trim() : String(clientId).trim();

  db.run(sql, [param], function (err) {
    if (err) {
      return res.status(500).json({ error: 'DB delete error', detail: err.message });
    }
    return res.json({ success: true, deleted: this.changes || 0 });
  });
});

// --- Android通知設定更新 ---
app.patch('/api/android/settings', (req, res) => {
  const { clientId, fcmToken, settings } = req.body || {};

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings required' });
  }

  if (!clientId && !fcmToken) {
    return res.status(400).json({ error: 'clientId or fcmToken required' });
  }

  const merged = parseAndMergePlatformSettings(settings);
  const settingsJson = JSON.stringify(merged);

  const sql = fcmToken
    ? 'UPDATE android_devices SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE fcm_token = ?'
    : 'UPDATE android_devices SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE client_id = ?';
  const param = fcmToken ? String(fcmToken).trim() : String(clientId).trim();

  db.run(sql, [settingsJson, param], function (err) {
    if (err) {
      return res.status(500).json({ error: 'DB update error', detail: err.message });
    }
    if (this.changes === 0) {
      return res.json({ success: true, updated: false, message: 'No android device found' });
    }
    return res.json({ success: true, updated: true });
  });
});
// --- プラットフォーム別設定取得 (改善版) ---
app.get('/api/get-platform-settings', (req, res) => {
  let clientId = req.query.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  clientId = String(clientId).trim();
  if (clientId.length === 0 || clientId.length > 256) {
    // 長すぎる clientId は不正とみなす（DoS防止）
    return res.status(400).json({ error: 'invalid clientId' });
  }

  db.get('SELECT settings_json FROM subscriptions WHERE client_id = ?', [clientId], (err, row) => {
    if (err) {
      console.error('/api/get-platform-settings SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    // デフォルト設定（すべてON）
    const defaultSettings = DEFAULT_PLATFORM_SETTINGS;

    // row が無い場合は既定値を返す（存在確認したいなら 404 を返す方針も検討）
    if (!row || !row.settings_json) {
      return res.json({ settings: defaultSettings, exists: !!row });
    }

    // 安全に JSON を解析し、サイズ上限をチェック
    const raw = row.settings_json;
    if (typeof raw !== 'string' || raw.length > 10 * 1024) { // 10KB 上限
      console.warn('/api/get-platform-settings: settings_json invalid or too large. clientId:', clientId);
      return res.json({ settings: defaultSettings });
    }

    try {
      const parsed = JSON.parse(raw);
      // parsed がオブジェクトでない場合は既定値を返す
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('parsed settings not object');
      }
      const merged = { ...defaultSettings, ...parsed };
      return res.json({ settings: merged, exists: true });
    } catch (e) {
      console.error('/api/get-platform-settings parse err:', e.message, 'clientId:', clientId, 'payloadPreview:', raw.substring(0,200));
      return res.json({ settings: defaultSettings, exists: true });
    }
  });
});

app.patch('/api/update-settings', (req, res) => {
  const { clientId, settings } = req.body || {};

  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'clientId required' });
  }
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings required' });
  }

  const merged     = parseAndMergePlatformSettings(settings);
  const settingsJson = JSON.stringify(merged);

  db.run(
    'UPDATE subscriptions SET settings_json = ? WHERE client_id = ?',
    [settingsJson, clientId],
    function (err) {
      if (err) {
        console.error('/api/update-settings err:', err.message);
        return res.status(500).json({ error: 'DB error', detail: err.message });
      }
      if (this.changes === 0) {
        // 未登録の場合はスキップ（Push未登録ユーザーは設定だけ保存不要）
        return res.json({ success: true, updated: false, message: 'No subscription found' });
      }
      console.log(`[Settings] updated clientId=${clientId}`);
      return res.json({ success: true, updated: true });
    }
  );
});

// --- 購読者名取得 ---
app.get('/api/get-name', (req, res) => {
  const clientId = (req.query.clientId || '').trim();
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  db.get('SELECT name FROM subscriptions WHERE client_id = ?', [clientId], (err, row) => {
    if (err) {
      console.error('/api/get-name SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row) return res.status(404).json({ error: 'Not found' });
    // row.name may be null
    return res.json({ name: row.name || null });
  });
});

// --- イベント一覧取得 (公開API) ---
app.get('/api/events', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const from = req.query.from; // ISO8601形式の日付
  const to = req.query.to;
  const platform = req.query.platform;
  const status = req.query.status || 'scheduled'; // デフォルトは予定されているイベント

  let sql = 'SELECT * FROM events WHERE 1=1';
  const params = [];

  // 日付フィルター
  if (from) {
    sql += ' AND start_time >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND start_time <= ?';
    params.push(to);
  }

  // プラットフォームフィルター
  if (platform) {
    sql += ' AND platform = ?';
    params.push(platform);
  }

  // ステータスフィルター
  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY start_time ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('/api/events SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    return res.json({ 
      items: rows || [], 
      limit, 
      offset,
      total: rows ? rows.length : 0 
    });
  });
});

// ============================================
// 3. RSS フィード生成
// ============================================

app.get('/api/events/rss', (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const sql = `
    SELECT * FROM events 
    WHERE start_time >= datetime('now', '-7 days')
    AND status != 'cancelled'
    ORDER BY start_time DESC 
    LIMIT ?
  `;

  db.all(sql, [limit], (err, rows) => {
    if (err) {
      console.error('/api/events/rss SELECT err:', err.message);
      return res.status(500).send('RSS generation failed');
    }

    const baseUrl = req.protocol + '://' + req.get('host');
    const now = new Date().toUTCString();

    let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>まいちゃん予定表</title>
    <link>${baseUrl}</link>
    <description>まいちゃんの配信・動画投稿予定</description>
    <language>ja</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${baseUrl}/api/events/rss" rel="self" type="application/rss+xml" />
`;

    rows.forEach(event => {
      const title = escapeXml(event.title);
      const description = escapeXml(event.description || '');
      const link = event.url || `${baseUrl}/events/${event.id}`;
      const pubDate = new Date(event.start_time).toUTCString();
      const guid = `event-${event.id}`;

      rss += `
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>`;

      if (event.platform) {
        rss += `
      <category>${escapeXml(event.platform)}</category>`;
      }

      if (event.thumbnail_url) {
        rss += `
      <enclosure url="${escapeXml(event.thumbnail_url)}" type="${event.thumbnail_url?.endsWith(".webp") ? "image/webp" : "image/jpeg"}" />`;
      }

      rss += `
    </item>`;
    });

    rss += `
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(rss);
  });
});

// XML エスケープ用ヘルパー関数
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// --- 週間イベント取得 (便利エンドポイント) ---
app.get('/api/events/weekly', (req, res) => {
  const date = req.query.date || toLocalDateString(new Date());
  const { sunday, from, to, weekStart } = getWeekBoundsByDate(date);

  const sql = `
    SELECT * FROM events
    WHERE start_time >= ? AND start_time < ?
    AND status != 'cancelled'
    ORDER BY start_time ASC
  `;

  db.all(sql, [from, to], (err, rows) => {
    if (err) {
      console.error('/api/events/weekly SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    const weekData = Array(7).fill(null).map((_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);

      return {
        date: toLocalDateString(d),
        dayOfWeek: ['日','月','火','水','木','金','土'][i],
        events: []
      };
    });

    rows.forEach(event => {
      if (!event.start_time) return;

      const eventDate = new Date(event.start_time);
      const dayIndex = eventDate.getDay();

      weekData[dayIndex].events.push(event);
    });

    db.get(
      `SELECT week_start, message, updated_at
       FROM weekly_messages
       WHERE week_start = ?
       LIMIT 1`,
      [weekStart],
      (msgErr, msgRow) => {
        if (msgErr) {
          console.error('/api/events/weekly weekly_messages SELECT err:', msgErr.message);
          return res.status(500).json({ error: 'DB error', detail: msgErr.message });
        }

        res.json({
          week: weekData,
          from,
          to,
          weekMessage: msgRow
            ? {
                weekStart: msgRow.week_start,
                message: msgRow.message,
                updatedAt: msgRow.updated_at
              }
            : null
        });
      }
    );
  });
});

app.get('/api/admin/weekly-message', adminAuth.requireAuth, (req, res) => {
  const date = req.query.date || toLocalDateString(new Date());
  const { weekStart } = getWeekBoundsByDate(date);

  db.get(
    `SELECT week_start, message, created_at, updated_at
     FROM weekly_messages
     WHERE week_start = ?
     LIMIT 1`,
    [weekStart],
    (err, row) => {
      if (err) {
        console.error('/api/admin/weekly-message GET err:', err.message);
        return res.status(500).json({ error: 'DB error', detail: err.message });
      }

      return res.json({
        weekStart,
        exists: Boolean(row),
        message: row ? row.message : '',
        createdAt: row ? row.created_at : null,
        updatedAt: row ? row.updated_at : null
      });
    }
  );
});

app.post('/api/admin/weekly-message', adminAuth.requireAuth, (req, res) => {
  const { date, weekStart, message } = req.body || {};
  if (weekStart) {
    const parsedWeekStart = new Date(weekStart);
    if (Number.isNaN(parsedWeekStart.getTime())) {
      return res.status(400).json({ error: 'weekStart must be a valid date' });
    }
  }

  const normalizedWeekStart = weekStart
    ? toLocalDateString(new Date(weekStart))
    : getWeekBoundsByDate(date || toLocalDateString(new Date())).weekStart;

  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required' });
  }

  const trimmedMessage = message.trim();

  db.run(
    `INSERT INTO weekly_messages (week_start, message, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(week_start) DO UPDATE SET
       message = excluded.message,
       updated_at = CURRENT_TIMESTAMP`,
    [normalizedWeekStart, trimmedMessage],
    function(err) {
      if (err) {
        console.error('/api/admin/weekly-message POST err:', err.message);
        return res.status(500).json({ error: 'DB error', detail: err.message });
      }

      return res.json({
        success: true,
        weekStart: normalizedWeekStart,
        message: trimmedMessage
      });
    }
  );
});


// --- 特定イベント取得 (公開API) ---
app.get('/api/events/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid event ID' });
  }

  db.get('SELECT * FROM events WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('/api/events/:id SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Event not found' });
    }
    return res.json(row);
  });
});

// --- イベント作成 (管理者のみ) ---
app.post('/api/admin/events', adminAuth.requireAuth, (req, res) => {
  const {
    title,
    start_time,
    end_time,
    url,
    thumbnail_url,
    platform,
    event_type,
    description,
    status,
    external_id
  } = req.body;
  
  // start_time が空文字列または null の場合は null として扱う
  const startTimeValue = start_time && start_time.trim() !== '' ? start_time : null;
  const endTimeValue = end_time && end_time.trim() !== '' ? end_time : null;
  
  // confirmed ステータスの判定
  // リクエストで明示的に指定された場合はそれを優先
  let confirmed;
  if (req.body.confirmed !== undefined && req.body.confirmed !== null) {
    confirmed = req.body.confirmed ? 1 : 0;
  } else if (status === 'ended') {
    // status が 'ended' の場合は必ず confirmed = true
    confirmed = 1;
  } else if (startTimeValue) {
    // start_time が過去なら confirmed = true、それ以外は null（未定）
    const eventDate = new Date(startTimeValue);
    const now = new Date();
    confirmed = eventDate < now ? 1 : null;
  } else {
    confirmed = null;
  }
  
  const sql = `
    INSERT INTO events (
      title, start_time, end_time, url, thumbnail_url, 
      platform, event_type, description, status, external_id, confirmed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    title,
    startTimeValue,
    endTimeValue,
    url || null,
    thumbnail_url || null,
    platform || 'other',
    event_type || 'live',
    description || null,
    status || 'scheduled',
    external_id || null,
    confirmed
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('/api/admin/events POST err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    
    const newId = this.lastID;
    console.log(`[Event Created] ID: ${newId}, Admin: ${req.adminUser}`);
    syncEventNotifications().catch(console.error);
    
    db.get('SELECT * FROM events WHERE id = ?', [newId], (err, row) => {
      if (err) {
        return res.status(500).json({ 
          error: 'Event created but failed to fetch',
          id: newId 
        });
      }
      return res.json(row);
    });
  });
});

// --- イベント一覧取得 (管理者のみ) ---
app.get('/api/admin/events', adminAuth.requireAuth, (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);

  const sql = `
    SELECT * FROM events
    ORDER BY start_time DESC
    LIMIT ?
  `;

  db.all(sql, [limit], (err, rows) => {
    if (err) {
      console.error('/api/admin/events GET err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    res.json({ items: rows });
  });
});


// --- 購読者名保存 ---
app.post('/api/save-name', (req, res) => {
  let { clientId, name } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  clientId = String(clientId).trim();

  if (typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  name = name.trim().slice(0, 255); // 長さ制限（任意）

  // 存在する subscription を更新。無ければ 404（安全策）
  db.get('SELECT 1 FROM subscriptions WHERE client_id = ?', [clientId], (err, row) => {
    if (err) {
      console.error('/api/save-name SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row) {
      // optional: insert new subscription with name（ここでは存在しないと404にする）
      return res.status(404).json({ error: 'Subscription not found' });
    }

    db.run('UPDATE subscriptions SET name = ? WHERE client_id = ?', [name || null, clientId], function(updateErr) {
      if (updateErr) {
        console.error('/api/save-name UPDATE err:', updateErr.message);
        return res.status(500).json({ error: 'DB update error', detail: updateErr.message });
      }
      return res.json({ success: true, clientId, name: name || null, changes: this.changes });
    });
  });
});



// --- 単一キー更新（互換性のため） --- (堅牢版)
app.post('/api/save-platform-setting', (req, res) => {
  let { clientId, key, value } = req.body || {};

  // 基本バリデーション
  if (!clientId || !key || typeof value === 'undefined') {
    return res.status(400).json({ error: 'clientId, key, value required' });
  }

  clientId = String(clientId).trim();
  key = String(key).trim();

  // clientId / key の長さ上限と形式チェック（DoS・注入防止）
  if (clientId.length === 0 || clientId.length > 256) {
    return res.status(400).json({ error: 'invalid clientId' });
  }
  if (!/^[A-Za-z0-9_]+$/.test(key) || key.length > 64) {
    return res.status(400).json({ error: 'invalid key (allowed: A-Za-z0-9_)' });
  }

  // 正規化: "true"/"false" を boolean に変換
  const finalValue = (typeof value === 'string') ? (value.toLowerCase() === 'true') : !!value;

  // トランザクションで原子的に読み取り→更新
  db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
    if (beginErr) {
      console.error('/api/save-platform-setting BEGIN err:', beginErr.message);
      return res.status(500).json({ error: 'DB transaction error', detail: beginErr.message });
    }

    db.get('SELECT settings_json FROM subscriptions WHERE client_id = ?', [clientId], (selectErr, row) => {
      if (selectErr) {
        console.error('/api/save-platform-setting SELECT err:', selectErr.message);
        // ロールバック
        return db.run('ROLLBACK', () => res.status(500).json({ error: 'DB error', detail: selectErr.message }));
      }

      if (!row) {
        // 該当購読が無い -> ロールバックして 404 を返す
        return db.run('ROLLBACK', () => res.status(404).json({ error: 'Subscription not found' }));
      }

      let current = {};
      try {
        current = row.settings_json ? JSON.parse(row.settings_json) : {};
        if (!current || typeof current !== 'object') current = {};
      } catch (e) {
        console.warn('/api/save-platform-setting: invalid existing settings_json, resetting to {}. clientId:', clientId);
        current = {};
      }

      current[key] = finalValue;

      const updated = JSON.stringify(current);

      // サイズチェック（安全装置）
      if (updated.length > 10 * 1024) { // 10KB
        console.error('/api/save-platform-setting: updated settings_json too large', { clientId, size: updated.length });
        return db.run('ROLLBACK', () => res.status(400).json({ error: 'settings_json too large' }));
      }

      db.run('UPDATE subscriptions SET settings_json = ? WHERE client_id = ?', [updated, clientId], function(updateErr) {
        if (updateErr) {
          console.error('/api/save-platform-setting UPDATE err:', updateErr.message);
          return db.run('ROLLBACK', () => res.status(500).json({ error: 'DB update error', detail: updateErr.message }));
        }

        // commit
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            console.error('/api/save-platform-setting COMMIT err:', commitErr.message);
            return db.run('ROLLBACK', () => res.status(500).json({ error: 'DB commit error', detail: commitErr.message }));
          }

          // 成功レスポンスに更新後の設定を返す（実務的に便利）
          return res.json({ success: true, message: 'Setting updated', settings: current });
        });
      });
    });
  });
});


// --- 履歴取得 (改善版) ---
app.get('/api/history', (req, res) => {
  // clientId は将来のフィルタ用に受け取っておく（現状未使用）
  const clientId = req.query.clientId;
  let limit = parseInt(req.query.limit, 10) || 10;
  let offset = parseInt(req.query.offset, 10) || 0;

  // 安全対策
  if (isNaN(limit) || limit < 1) limit = 10;
  if (isNaN(offset) || offset < 0) offset = 0;
  const MAX_LIMIT = 100;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
const tStart = Date.now();
  // 件数取得をO(1)の MAX(id) に変更
  db.get('SELECT MAX(id) AS cnt FROM notifications', [], (countErr, countRow) => {
    if (countErr) {
      console.error('/api/history MAX(id) err:', countErr.message);
      return res.status(500).json({ error: 'DB error', detail: countErr.message });
    }

    const total = (countRow && typeof countRow.cnt === 'number') ? countRow.cnt : (countRow && countRow.cnt ? parseInt(countRow.cnt, 10) : 0);

    // 0 件なら空リストを早期返却
    if (!total) {
      return res.json({ logs: [], total: 0, hasMore: false });
    }

    // 起動時に platform, status カラムは追加保証されているため、PRAGMAチェックを省略してハードコード
    const selectFields = "id, title, body, url, icon, strftime('%s', created_at) AS timestamp, platform, status";
    const sql = `SELECT ${selectFields} FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    db.all(sql, [limit, offset], (err, rows) => {
      console.log('/api/history total server time:', Date.now() - tStart, 'ms');
      if (err) {
        console.error('/api/history SELECT err:', err.message);
        return res.status(500).json({ error: 'DB error', detail: err.message });
      }

      // rows が未定義の場合に備える
      const safeRows = Array.isArray(rows) ? rows : [];

      const hasMore = offset + safeRows.length < total;
      const logs = safeRows.map(r => ({
        id: r.id,
        title: r.title,
        body: r.body,
        url: r.url,
        icon: r.icon,
        platform: r.platform || '不明',
        status: r.status || 'success',
        // timestamp が null/undefined の場合は 0 を返す
        timestamp: r.timestamp ? parseInt(r.timestamp, 10) : 0
      }));

      return res.json({ logs, total, hasMore });
    });
  });
});

// SSE エンドポイント: クライアントは EventSource('/api/history/stream')
app.get('/api/history/stream', (req, res) => {
  // 任意認証や clientId パラメータを受け取りたい場合はここで処理可能
  // const clientId = req.query.clientId;

  // SSE ヘッダ
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // CORS が必要なら適宜追加
    // 'Access-Control-Allow-Origin': '*'
  });
  res.flushHeaders && res.flushHeaders();

  // 初回イベント（握手）
  res.write(`:ok\n\n`); // コメント行で接続保持を促す
  sseClients.add(res);
  console.log('[SSE] client connected (total=%d)', sseClients.size);

  // 切断時のクリーンアップ
  req.on('close', () => {
    sseClients.delete(res);
    try { res.end(); } catch (e) {}
    console.log('[SSE] client disconnected (total=%d)', sseClients.size);
  });

  // --- オプション: ping（コネクション維持） ---
  // keepAliveInterval はグローバルで1つだけにするか、ここで個別にセットする
  // ここでは個別に setInterval を使わない（単純化）。必要なら実装可能。
});

// --- テスト通知 (改善版) ---
app.post('/api/send-test', (req, res) => {
  const clientId = (req.body && req.body.clientId) || null;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  db.get('SELECT subscription_json FROM subscriptions WHERE client_id = ?', [clientId], async (err, row) => {
    if (err) {
      console.error('/api/send-test SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row || !row.subscription_json) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    let subscription;
    try {
      subscription = JSON.parse(row.subscription_json);
    } catch (e) {
      console.error('/api/send-test parse subscription_json err:', e.message, 'clientId:', clientId);
      return res.status(500).json({ error: 'Invalid subscription data', detail: 'parse error' });
    }

    // payload の検証（必要に応じてフィールドを調整）
    const payload = {
      title: 'テスト通知',
      body: 'この通知をタップしてURLに飛べるか確認！',
      url: './test/',
      icon: `${req.protocol}://${req.get('host')}/icon.webp`
    };

    // 短めの保護（サイズ制限）
    const payloadStr = JSON.stringify(payload);
    if (payloadStr.length > 8 * 1024) {
      console.error('/api/send-test: payload too large', { clientId, size: payloadStr.length });
      return res.status(400).json({ error: 'payload too large' });
    }

    try {
      const sent = await sendPushNotification(subscription, payload, db, true);
      // テスト通知は履歴に保存しない方針のまま
      return res.json({ success: sent });
    } catch (e) {
      console.error('/api/send-test error (unexpected):', e && e.message);
      return res.status(500).json({ error: 'Send error', detail: e && e.message });
    }
  });
});
// --- Android テスト通知 ---
app.post('/api/android/send-test', async (req, res) => {
  const fcmToken = (req.body && req.body.fcmToken) ? String(req.body.fcmToken).trim() : null;
  if (!fcmToken) return res.status(400).json({ error: 'fcmToken required' });

  const messaging = initFcm();
  if (!messaging) {
    return res.status(503).json({ error: 'FCM not configured' });
  }

  const payload = {
    title: 'テスト通知',
    body: 'この通知をタップしてURLに飛べるか確認！',
    url: 'https://mai.honna-yuzuki.com/test/',
    icon: `${req.protocol}://${req.get('host')}/icon.webp`
  };

  try {
    const result = await sendFcmNotification(messaging, fcmToken, payload, 'test', null, false);
    if (!result.sent && result.error && isInvalidFcmError(result.error)) {
      db.run('DELETE FROM android_devices WHERE fcm_token = ?', [fcmToken], function (delErr) {
        if (delErr) console.error('android_devices delete err:', delErr.message);
      });
    }
    return res.json({ success: !!result.sent });
  } catch (e) {
    console.error('/api/android/send-test error:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Send error' });
  }
});

const SCHEDULE_INTERVAL_MS = 5000; // 5秒毎にチェック

// ============================================
// Scheduler Worker（堅牢版）
// ============================================
setInterval(async () => {
  const now = Date.now();

  try {
    // due 一括取得（Promise化）
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, payload_json
         FROM scheduled_notifications
         WHERE sent = 0 AND run_at <= ?`,
        [now],
        (err, r) => {
          if (err) reject(err);
          else resolve(r || []);
        }
      );
    });

    if (!rows.length) return;

    for (const row of rows) {
      try {
        // ----------------------------
        // 送信前ロック（多重防止の最重要ポイント）
        // ----------------------------
        const locked = await new Promise((resolve) => {
          db.run(
            `UPDATE scheduled_notifications
             SET sent = 2   -- 2 = processing
             WHERE id = ? AND sent = 0`,
            [row.id],
            function () {
              resolve(this.changes > 0);
            }
          );
        });

        if (!locked) continue; // 他workerが処理中

        const payload = JSON.parse(row.payload_json);

        // ----------------------------
        // 実送信
        // ----------------------------
        await handleAdminNotify(payload);

        // ----------------------------
        // 成功確定
        // ----------------------------
        db.run(
          `UPDATE scheduled_notifications
           SET sent = 1, sent_at = ?
           WHERE id = ?`,
          [Date.now(), row.id]
        );

        console.log('[Scheduler] sent id=', row.id);

      } catch (e) {
        console.error('[Scheduler] failed id=', row.id, e);

        // ----------------------------
        // 失敗時は未送信に戻す（再試行可能）
        // ----------------------------
        db.run(
          `UPDATE scheduled_notifications
           SET sent = 0
           WHERE id = ?`,
          [row.id]
        );
      }
    }

  } catch (err) {
    console.error('[Scheduler] fatal:', err);
  }

}, SCHEDULE_INTERVAL_MS);

// --- ユーザーデータ統合取得（設定+名前を一度に） ---
app.get('/api/get-user-data', (req, res) => {
  let clientId = req.query.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  clientId = String(clientId).trim();
  if (clientId.length === 0 || clientId.length > 256) {
    return res.status(400).json({ error: 'invalid clientId' });
  }

  // デフォルト設定
  const defaultSettings = DEFAULT_PLATFORM_SETTINGS;

  db.get(
    'SELECT settings_json, name FROM subscriptions WHERE client_id = ?',
    [clientId],
    (err, row) => {
      if (err) {
        console.error('/api/get-user-data SELECT err:', err.message);
        return res.status(500).json({ error: 'DB error', detail: err.message });
      }

      // デフォルトレスポンス
      const response = {
        settings: defaultSettings,
        name: null,
        exists: !!row
      };

      if (!row) {
        return res.json(response);
      }

      // 名前を設定
      response.name = row.name || null;

      // 設定をパース
      if (row.settings_json) {
        const raw = row.settings_json;
        if (typeof raw === 'string' && raw.length <= 10 * 1024) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              response.settings = { ...defaultSettings, ...parsed };
            }
          } catch (e) {
            console.error('/api/get-user-data parse err:', e.message);
          }
        }
      }

      return res.json(response);
    }
  );
});

// 重複通知防止用キャッシュ（メモリ上）
// DUPLICATE_WINDOW_MS を環境変数で上書き可能にする
const DUPLICATE_WINDOW_MS = parseInt(process.env.DUPLICATE_WINDOW_MS, 10) || (60 * 1000);
const recentNotifications = new Map(); // key: hash, value: timestamp

// 通知のハッシュを生成（title/url/body を利用。必要ならさらに正規化）
function getNotificationHash(data = {}, settingKey) {
  const title = (data.title || '').toString().slice(0, 200);
  const url = (data.url || '').toString().slice(0, 200);
  const body = (typeof data.body === 'string') ? data.body.slice(0, 200) : '';
  return `${settingKey || 'unknown'}:${url}:${title}:${body}`;
}

// レートリミット: 同一IP/トークンあたり 1分に10回（調整可）
// keyGenerator のフォールバックを強化
const notifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false
});



// 認証ミドルウェア: ヘッダ X-Notify-Token または Authorization: Bearer <token>
function requireNotifyToken(req, res, next) {
  if (!ADMIN_NOTIFY_TOKEN) {
    console.error('Server misconfiguration: ADMIN_NOTIFY_TOKEN not set');
    return res.status(500).json({ error: 'Server misconfiguration: ADMIN_NOTIFY_TOKEN not set' });
  }

  const authHeader = req.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^\s*Bearer\s+(.+)$/i);
  const token = req.get('X-Notify-Token') || (bearerMatch ? bearerMatch[1] : null);

  // ログはマスクして出力（先頭/末尾のみ）
  const mask = s => {
    if (!s) return null;
    if (s.length <= 8) return '****';
    return `${s.slice(0,4)}...${s.slice(-4)}`;
  };
  console.log('[AUTH] Received token headers:', {
    'X-Notify-Token': mask(req.get('X-Notify-Token')),
    'Authorization': mask(authHeader)
  });
  console.log('[AUTH] Extracted token mask:', mask(token));

  if (!token || token !== ADMIN_NOTIFY_TOKEN) {
    console.warn('[AUTH] Token mismatch or missing');
    return res.status(401).json({ error: 'Unauthorized: invalid notify token' });
  }
  next();
}

// 任意: HMAC 検証ミドルウェア（NOTIFY_HMAC_SECRET が設定されていれば検証）
function verifyNotifyHmac(req, res, next) {
  if (!NOTIFY_HMAC_SECRET) {
    // 環境変数が無ければ検証をスキップ（既存の挙動）
    return next();
  }

  const signatureHeader = req.get('X-Signature') || ''; // 期待形式: sha256=<hex>
  if (!signatureHeader.startsWith('sha256=')) {
    console.warn('[HMAC] Missing or invalid X-Signature header');
    return res.status(401).json({ error: 'Unauthorized: missing signature' });
  }
  const recvSigHex = signatureHeader.slice(7);

  // 受け取り値の基本検証（hex で偶数長であること）
  if (!/^[0-9a-fA-F]+$/.test(recvSigHex) || (recvSigHex.length % 2) !== 0) {
    console.warn('[HMAC] Received signature not valid hex or wrong length');
    return res.status(401).json({ error: 'Unauthorized: invalid signature format' });
  }

  let bodyString;
  try {
    bodyString = JSON.stringify(req.body || {});
  } catch (e) {
    console.error('[HMAC] Failed to stringify body for HMAC:', e.message);
    return res.status(400).json({ error: 'Bad request body' });
  }

  const hmac = crypto.createHmac('sha256', NOTIFY_HMAC_SECRET);
  hmac.update(bodyString);
  const expectedHex = hmac.digest('hex');

  // 長さが違うと timingSafeEqual が throw するため先に長さチェック
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const recvBuf = Buffer.from(recvSigHex, 'hex');

  if (expectedBuf.length !== recvBuf.length) {
    console.warn('[HMAC] Signature length mismatch');
    return res.status(401).json({ error: 'Unauthorized: invalid signature' });
  }

  try {
    if (!crypto.timingSafeEqual(expectedBuf, recvBuf)) {
      console.warn('[HMAC] Signature mismatch');
      return res.status(401).json({ error: 'Unauthorized: invalid signature' });
    }
  } catch (e) {
    console.error('[HMAC] timingSafeEqual error:', e.message);
    return res.status(401).json({ error: 'Unauthorized: invalid signature' });
  }

  // 検証成功
  next();
}

// history.json を更新する関数
async function updateHistoryJson() {
  try {
    // -------------------------
    // DB → Promise化
    // -------------------------
    const query = (limit) =>
      new Promise((resolve, reject) => {
        db.all(
          `SELECT id, title, body, url, icon, platform, status,
                  strftime('%s', created_at) AS timestamp
           FROM notifications
           ORDER BY created_at DESC
           LIMIT ?`,
          [limit],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

    const [jsonRows, htmlRows] = await Promise.all([
      query(HISTORY_JSON_LIMIT),
      query(HISTORY_HTML_LIMIT)
    ]);

    const normalize = (rows) =>
      rows.map(r => ({
        id: r.id,
        title: r.title,
        body: r.body,
        url: r.url,
        icon: r.icon,
        platform: r.platform || '不明',
        status: r.status || 'success',
        timestamp: r.timestamp ? Number(r.timestamp) : 0
      }));

    const jsonLogs = normalize(jsonRows);
    const htmlLogs = normalize(htmlRows);

    // -------------------------
    // JSON生成
    // -------------------------
    const jsonData = {
      logs: jsonLogs,
      total: jsonLogs.length,
      limit: HISTORY_JSON_LIMIT,
      lastUpdated: Math.floor(Date.now() / 1000)
    };

    // -------------------------
    // ディレクトリ保証
    // -------------------------
    await fs.promises.mkdir(path.dirname(HISTORY_JSON_PATH), { recursive: true });

    // -------------------------
    // 非同期書き込み（★ここが最重要修正）
    // -------------------------
    await Promise.all([
      fs.promises.writeFile(
        HISTORY_JSON_PATH,
        JSON.stringify(jsonData, null, 2),
        'utf8'
      ),
      fs.promises.writeFile(
        HISTORY_HTML_PATH,
        renderHistoryHtml(htmlLogs),
        'utf8'
      )
    ]);

    console.log(
      `[updateHistoryJson] ✅ JSON(${HISTORY_JSON_LIMIT}) / HTML(${HISTORY_HTML_LIMIT}) 更新完了`
    );

  } catch (e) {
    console.error('[updateHistoryJson] error:', e);
  }
}

// 起動時に初回生成
db.serialize(() => {
  // ... 既存のDB初期化コード ...
  
  // 初回のhistory.json生成
  setTimeout(() => {
    updateHistoryJson().catch(console.error);
  }, 1000);
});

function renderHistoryHtml(logs) {
  return logs.map(log => {
    const date = new Date(log.timestamp * 1000).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo'
    });

    const safeIcon     = escapeXml(log.icon     || '');
    const safeUrl      = escapeXml(log.url       || '');
    const safeTitle    = escapeXml(log.title     || '');
    const safeBody     = escapeXml(log.body      || '');
    const safePlatform = escapeXml(log.platform  || '');

    return `
<div class="card" data-log-id="${log.id}">
  ${safeIcon ? `<img src="${safeIcon}" alt="icon" class="icon" loading="lazy">` : ''}
  <div class="card-content">
    <div class="title">
      ${safeUrl
        ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>`
        : safeTitle}
    </div>
    <p class="body">${safeBody}</p>
    <div class="meta">
      <span class="platform">${safePlatform}</span>
      <span class="time">${date}</span>
      ${log.status === 'fail' ? '<span class="status-badge">送信失敗</span>' : ''}
    </div>
  </div>
</div>`;
  }).join('\n');
}

// --- 通知受信（外部サービスから） --- (改善版、並列送信かつ同時上限あり)
app.post('/api/notify', notifyLimiter, requireNotifyToken, verifyNotifyHmac, (req, res) => {
  const { data, type, settingKey } = req.body;
  if (!data || !type) return res.status(400).json({ error: 'Missing data or type' });

  console.log('[/api/notify] 通知リクエスト受信:', { title: data.title, settingKey });

  const notificationHash = getNotificationHash(data, settingKey);
  const now = Date.now();
  const lastSent = recentNotifications.get(notificationHash);

  if (lastSent && (now - lastSent) < DUPLICATE_WINDOW_MS) {
    const timeSinceLastSent = Math.round((now - lastSent) / 1000);
    console.log(`[/api/notify] ⚠️  重複通知を検出: ${notificationHash} (${timeSinceLastSent}秒前に送信済み)`);
    return res.json({ success: true, message: 'Duplicate notification ignored', duplicate: true });
  }

  recentNotifications.set(notificationHash, now);
  console.log(`[/api/notify] ✅ 新規通知として処理: ${notificationHash}`);

  // 古いキャッシュをクリーンアップ（メモリリーク防止）
  if (recentNotifications.size > 1000) {
    const cutoff = now - DUPLICATE_WINDOW_MS;
    for (const [hash, timestamp] of recentNotifications.entries()) {
      if (timestamp < cutoff) recentNotifications.delete(hash);
    }
  }

  // 履歴保存は非同期で行う（失敗しても通知送信には影響させない）
db.run(
  'INSERT INTO notifications (title, body, url, icon, platform, status) VALUES (?, ?, ?, ?, ?, ?)',
  [data.title, data.body, data.url, data.icon, settingKey || type, 'success'],
  function (insertErr) {
    if (insertErr) {
      console.error('[/api/notify] 履歴保存エラー:', insertErr.message);
      return;
    }

    console.log('[/api/notify] 履歴保存成功 (ID:', this.lastID, ')');

    try {
      // ① JSON + HTML を先に更新（状態確定）
      updateHistoryJson().catch(console.error);

      // ② その後に SSE 通知
      sendSseEvent({
        type: 'history-updated',
        lastUpdated: Math.floor(Date.now() / 1000),
        added: [this.lastID]
      });

    } catch (e) {
      console.warn('history update / SSE error:', e && e.message);
    }
  }
);


  // 取得して送信（同時実行上限あり）
  db.all('SELECT client_id, subscription_json, settings_json FROM subscriptions', [], async (err, rows) => {
    if (err) {
      console.error('/api/notify SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    const total = Array.isArray(rows) ? rows.length : 0;
    console.log(`[/api/notify] 購読者数: ${total}人`);

    // 同時実行数（環境変数 or デフォルト）
    const CONCURRENCY = Math.max(1, parseInt(process.env.NOTIFY_CONCURRENCY, 10) || 20);

    // シンプルな mapLimit 実装（外部ライブラリ不要）
    async function mapWithLimit(items, limit, iterator) {
      const results = new Array(items.length);
      let idx = 0;
      const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
        while (true) {
          const i = idx++;
          if (i >= items.length) break;
          try {
            results[i] = await iterator(items[i], i);
          } catch (e) {
            results[i] = { error: e && e.message ? e.message : String(e) };
          }
        }
      });
      await Promise.all(workers);
      return results;
    }

    // 送信処理（1行分）
    async function sendForRow(row) {
      const clientId = row.client_id;
      if (!row.subscription_json) {
        console.warn(`[/api/notify] ${clientId}: subscription_json missing, skip`);
        return { clientId, sent: false, reason: 'no_subscription' };
      }

      let subscription;
      try {
        subscription = JSON.parse(row.subscription_json);
      } catch (e) {
        console.error(`[/api/notify] ${clientId}: subscription_json parse error:`, e.message);
        return { clientId, sent: false, reason: 'parse_error' };
      }

      let settings = parseAndMergePlatformSettings(row.settings_json);

      // 設定でオフならスキップ
      if (settingKey && settings[settingKey] === false) {
        console.log(`[/api/notify] ❌ ${clientId}: ${settingKey} がOFFのためスキップ`);
        return { clientId, sent: false, reason: 'disabled' };
      }

      // 実送信
      try {
        console.log(`[/api/notify] ✅ ${clientId}: 送信キューへ`);
        const sent = await sendPushNotification(subscription, data, db, false);
        return { clientId, sent };
      } catch (e) {
        console.error(`[/api/notify] ${clientId}: unexpected send error`, e && e.message);
        return { clientId, sent: false, error: e && e.message };
      }
    }

    // 並列制御付きで送信
    const results = await mapWithLimit(rows, CONCURRENCY, sendForRow);

    const webSentCount = results.filter(r => r && r.sent).length;
    let androidSentCount = 0;
    let androidTotal = 0;

    const fcm = initFcm();
    if (fcm) {
      try {
        const androidRows = await new Promise((resolve, reject) => {
          db.all('SELECT client_id, fcm_token, settings_json FROM android_devices', [], (err2, rows2) => {
            if (err2) reject(err2);
            else resolve(rows2 || []);
          });
        });

        androidTotal = androidRows.length;
        if (androidTotal) {
          console.log('[/api/notify] Android devices: ' + androidTotal);
          const ANDROID_CONCURRENCY = Math.max(1, parseInt(process.env.ANDROID_NOTIFY_CONCURRENCY, 10) || 20);

          async function sendForAndroidRow(row) {
            if (!row || !row.fcm_token) {
              return { sent: false, reason: 'no_token' };
            }

            if (settingKey) {
              const settings = parseAndMergePlatformSettings(row.settings_json);
              if (settings[settingKey] === false) {
                return { sent: false, reason: 'disabled' };
              }
            }

            const result = await sendFcmNotification(fcm, row.fcm_token, data, type, settingKey, false);
            if (!result.sent && result.error && isInvalidFcmError(result.error)) {
              db.run('DELETE FROM android_devices WHERE fcm_token = ?', [row.fcm_token], function (delErr) {
                if (delErr) console.error('android_devices delete err:', delErr.message);
              });
            }

            return { sent: result.sent };
          }

          const androidResults = await mapWithLimit(androidRows, ANDROID_CONCURRENCY, sendForAndroidRow);
          androidSentCount = androidResults.filter(r => r && r.sent).length;
        }
      } catch (e) {
        console.error('[/api/notify] Android send error:', e && e.message ? e.message : e);
      }
    } else {
      console.log('[/api/notify] FCM not configured; skipping Android devices');
    }

    const sentCount = webSentCount + androidSentCount;
    const totalCount = total + androidTotal;
    console.log('[/api/notify] 完了: ' + sentCount + '/' + totalCount + '人に送信 (web=' + webSentCount + ', android=' + androidSentCount + ')');

    return res.json({
      success: true,
      message: 'Notification sent to ' + sentCount + ' clients',
      sentCount,
      totalCount,
      detailsSummary: {
        attempted: totalCount,
        succeeded: sentCount,
        failed: totalCount - sentCount
      },
      webPush: { sentCount: webSentCount, totalCount: total },
      android: { sentCount: androidSentCount, totalCount: androidTotal }
    });
  });
});

// --- 管理用: 購読リスト (認証必須、ページング) ---
app.get('/api/subscriptions', adminAuth.requireAuth, (req, res) => {
  let limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50)); // max 100
  let offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  db.all('SELECT id, client_id, endpoint, created_at FROM subscriptions ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
    if (err) {
      console.error('/api/subscriptions SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    return res.json({ items: rows || [], limit, offset });
  });
});

// --- VAPID 公開鍵 ---
app.get('/api/vapidPublicKey', (req, res) => {
  return res.send(vapidConfig.vapidPublicKey || '');
});

// --- TwitCasting 認証 ---
app.get('/api/twicas/auth', (req, res) => {
  try {
    const authUrl = twitcasting.getAuthUrl();
    console.log('TwitCasting Auth redirect:', authUrl);
    return res.redirect(authUrl);
  } catch (e) {
    console.error('/api/twicas/auth error:', e && e.message);
    return res.status(500).send('Auth initialization failed');
  }
});

app.get(twitcasting.CALLBACK_PATH, async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Code missing');

    const token = await twitcasting.exchangeCodeForToken(code);
    if (token) {
      await twitcasting.subscribeToWebhook();
      return res.send('<h1>TwitCasting 認証成功</h1><p>完了しました。</p>');
    } else {
      console.error('TwitCasting exchangeCodeForToken returned falsy token');
      return res.status(500).send('Auth failed');
    }
  } catch (e) {
    console.error('TwitCasting callback error:', e && e.message);
    return res.status(500).send('Auth error');
  }
});

// マイルストーン通知スケジューラー起動
if (vapidConfig.vapidPublicKey !== 'test-key') {
  milestoneScheduler = new MilestoneScheduler(dbPath, vapidConfig);
  milestoneScheduler.start();
} else {
  console.log('⚠️  VAPID未設定のためマイルストーン通知は無効');
}

// 管理者ログイン / ログアウト / verify
app.post('/api/admin/login', adminAuth.login);
app.post('/api/admin/logout', adminAuth.logout);
app.get('/api/admin/verify', adminAuth.requireAuth, (req, res) => {
  res.json({ success: true, user: req.adminUser });
});

// ============================================
// 共通：実送信ロジック（scheduler からも呼ばれる）
// ============================================
async function handleAdminNotify(body, adminUser = 'scheduler') {
  const { data, type, settingKey, clientId: clientIdsString } = body;

  if (!data || !type) {
    throw new Error('Missing data or type');
  }

  // clientIds -> array
  const clientIds = clientIdsString
    ? String(clientIdsString).split(',').map(id => id.trim()).filter(Boolean)
    : [];

  const isTargetedSend = clientIds.length > 0;
  const isScheduleEventNotify = type === 'event' && settingKey === 'schedule';

  // ユーザー個別スケジューラは、宛先未指定時に絶対ブロードキャストしない
  if (adminUser === 'user-scheduler' && !isTargetedSend) {
    console.warn('[Admin Notification] user-scheduler skip: missing target clientIds');
    return { sentCount: 0, totalCount: 0, skipped: true, reason: 'missing_target' };
  }

  const MAX_TARGET = 500;
  if (clientIds.length > MAX_TARGET) {
    throw new Error(`Too many clientIds (max ${MAX_TARGET})`);
  }

  console.log(
    `[Admin Notification] ${adminUser} => ${
      isTargetedSend ? `target ${clientIds.length}` : 'broadcast'
    }:`,
    data.title
  );

  // 重複チェック
  const notificationHash = getNotificationHash(data, settingKey);
  const now = Date.now();
  const lastSent = recentNotifications.get(notificationHash);

  if (lastSent && now - lastSent < DUPLICATE_WINDOW_MS) {
    return { duplicate: true, sentCount: 0, totalCount: 0 };
  }
  recentNotifications.set(notificationHash, now);

  // 履歴保存（broadcastのみ）
  if (!isTargetedSend && !isScheduleEventNotify) {
    db.run(
      'INSERT INTO notifications (title, body, url, icon, platform, status) VALUES (?, ?, ?, ?, ?, ?)',
      [data.title, data.body, data.url, data.icon, settingKey || type || 'admin', 'success'],
      function(insertErr) {
        if (!insertErr) {
          updateHistoryJson().catch(console.error);
          try {
            sendSseEvent({
              type: 'history-updated',
              lastUpdated: Math.floor(Date.now() / 1000),
              added: [this.lastID]
            });
          } catch {}
        }
      }
    );
  }

  // build SELECT
  let selectSql =
    'SELECT client_id, subscription_json, settings_json FROM subscriptions';
  let selectParams = [];

  if (isTargetedSend) {
    const placeholders = clientIds.map(() => '?').join(', ');
    selectSql += ` WHERE client_id IN (${placeholders})`;
    selectParams = clientIds;
  }

  const rows = await new Promise((resolve, reject) => {
    db.all(selectSql, selectParams, (err, r) => {
      if (err) reject(err);
      else resolve(r || []);
    });
  });

  const total = rows.length;
const CONCURRENCY =
    Math.max(1, parseInt(process.env.NOTIFY_CONCURRENCY, 10) || 20);

  async function mapWithLimit(items, limit, iterator) {
    const results = new Array(items.length);
    let idx = 0;

    const workers = new Array(Math.min(limit, items.length))
      .fill(null)
      .map(async () => {
        while (true) {
          const i = idx++;
          if (i >= items.length) break;

          try {
            results[i] = await iterator(items[i], i);
          } catch (e) {
            results[i] = { sent: false };
          }
        }
      });

    await Promise.all(workers);
    return results;
  }

  async function sendForRow(row) {
    if (!row.subscription_json) return { sent: false };

    try {
      if (settingKey) {
        const settings = parseAndMergePlatformSettings(row.settings_json);
        if (settings[settingKey] === false) {
          return { sent: false, reason: 'disabled' };
        }
      }

      const subscription = JSON.parse(row.subscription_json);
      const sent = await sendPushNotification(subscription, data, db, false);
      return { sent };
    } catch {
      return { sent: false };
    }
  }

  const results = await mapWithLimit(rows, CONCURRENCY, sendForRow);

  const webSentCount = results.filter(r => r.sent).length;
  let androidSentCount = 0;
  let androidTotal = 0;

  const fcm = initFcm();
  if (fcm) {
    try {
      let androidSelectSql = 'SELECT client_id, fcm_token, settings_json FROM android_devices';
      let androidSelectParams = [];

      if (isTargetedSend) {
        const placeholders = clientIds.map(() => '?').join(', ');
        androidSelectSql += ' WHERE client_id IN (' + placeholders + ')';
        androidSelectParams = clientIds;
      }

      const androidRows = await new Promise((resolve, reject) => {
        db.all(androidSelectSql, androidSelectParams, (err, r) => {
          if (err) reject(err);
          else resolve(r || []);
        });
      });

      androidTotal = androidRows.length;
      if (androidTotal) {
        const ANDROID_CONCURRENCY = Math.max(1, parseInt(process.env.ANDROID_NOTIFY_CONCURRENCY, 10) || 20);

        async function sendForAndroidRow(row) {
          if (!row || !row.fcm_token) return { sent: false };

          if (settingKey) {
            const settings = parseAndMergePlatformSettings(row.settings_json);
            if (settings[settingKey] === false) {
              return { sent: false, reason: 'disabled' };
            }
          }

          const result = await sendFcmNotification(fcm, row.fcm_token, data, type, settingKey, false);
          if (!result.sent && result.error && isInvalidFcmError(result.error)) {
            db.run('DELETE FROM android_devices WHERE fcm_token = ?', [row.fcm_token], function (delErr) {
              if (delErr) console.error('android_devices delete err:', delErr.message);
            });
          }
          return { sent: result.sent };
        }

        const androidResults = await mapWithLimit(androidRows, ANDROID_CONCURRENCY, sendForAndroidRow);
        androidSentCount = androidResults.filter(r => r && r.sent).length;
      }
    } catch (e) {
      console.error('[Admin Notification] Android send error:', e && e.message ? e.message : e);
    }
  }

  const sentCount = webSentCount + androidSentCount;
  const totalCount = total + androidTotal;

  console.log('[Admin Notification] 完了: ' + sentCount + '/' + totalCount + '人 (web=' + webSentCount + ', android=' + androidSentCount + ')');

  return { sentCount, totalCount, webSentCount, webTotal: total, androidSentCount, androidTotal };
}

async function sendUserScheduleReminders() {
  const now = Date.now();
  const USER_SCHEDULE_LATE_CUTOFF_MS = 2 * 60 * 1000; // 2分以上過去なら通知しない
  const candidates = await new Promise((resolve, reject) => {
    db.all(
      `SELECT id, user_id, title, note, url, thumbnail_url, scheduled_at, reminder_minutes
       FROM user_schedules
       WHERE event_id IS NULL
         AND COALESCE(source, 'user') = 'user'
         AND scheduled_at IS NOT NULL
         AND reminder_sent_at IS NULL`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });

  for (const row of candidates) {
    const scheduledMs = new Date(row.scheduled_at).getTime();
    if (!Number.isFinite(scheduledMs)) continue;

    // 予定時刻を過ぎた古い予定は通知対象外として完了扱いにする
    if (scheduledMs < (now - USER_SCHEDULE_LATE_CUTOFF_MS)) {
      await new Promise((resolve) => {
        db.run(
          'UPDATE user_schedules SET reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ? AND reminder_sent_at IS NULL',
          [row.id],
          () => resolve()
        );
      });
      continue;
    }

    const reminderMinutes = Number.isFinite(Number(row.reminder_minutes))
      ? Number(row.reminder_minutes)
      : 30;
    const dueMs = scheduledMs - (reminderMinutes * 60 * 1000);
    if (dueMs > now) continue;

    const lockToken = `processing:${Date.now()}:${Math.random()}`;
    const locked = await new Promise((resolve) => {
      db.run(
        `UPDATE user_schedules
         SET reminder_sent_at = ?
         WHERE id = ? AND reminder_sent_at IS NULL`,
        [lockToken, row.id],
        function () {
          resolve(this.changes > 0);
        }
      );
    });
    if (!locked) continue;

    try {
      const clientIdSet = new Set();

      const clientRows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT us.client_id
           FROM user_subscriptions us
           JOIN subscriptions s ON s.client_id = us.client_id
           WHERE us.user_id = ?
             AND s.subscription_json IS NOT NULL`,
          [row.user_id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      for (const r of clientRows) {
        if (r && r.client_id) clientIdSet.add(r.client_id);
      }

      const androidRows = await new Promise((resolve, reject) => {
        db.all(
          'SELECT client_id FROM android_devices WHERE user_id = ?',
          [row.user_id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      for (const r of androidRows) {
        if (r && r.client_id) clientIdSet.add(r.client_id);
      }

      const clientId = Array.from(clientIdSet).join(',');

      if (!clientId) {
        await new Promise((resolve) => {
          db.run(
            'UPDATE user_schedules SET reminder_sent_at = NULL WHERE id = ? AND reminder_sent_at = ?',
            [row.id, lockToken],
            () => resolve()
          );
        });
        continue;
      }
      const payload = {
        type: 'event',
        settingKey: 'schedule',
        clientId,
        data: {
          title: row.title || 'マイスケジュール通知',
          body: row.note != null ? row.note : '予定時刻が近づいています。',
          url: row.url || '/webui/events.html',
          icon: row.thumbnail_url || '/webui/icon.webp'
        }
      };

      const result = await handleAdminNotify(payload, 'user-scheduler');
      if (result && result.sentCount > 0) {
        await new Promise((resolve) => {
          db.run(
            'UPDATE user_schedules SET reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ? AND reminder_sent_at = ?',
            [row.id, lockToken],
            () => resolve()
          );
        });
      } else {
        await new Promise((resolve) => {
          db.run(
            'UPDATE user_schedules SET reminder_sent_at = NULL WHERE id = ? AND reminder_sent_at = ?',
            [row.id, lockToken],
            () => resolve()
          );
        });
      }
    } catch (e) {
      console.error('[User Schedule Notify] failed id=', row.id, e && e.message ? e.message : e);
      await new Promise((resolve) => {
        db.run(
          'UPDATE user_schedules SET reminder_sent_at = NULL WHERE id = ? AND reminder_sent_at = ?',
          [row.id, lockToken],
          () => resolve()
        );
      });
    }
  }
}

setInterval(() => {
  sendUserScheduleReminders().catch((e) => {
    console.error('[User Schedule Notify] fatal:', e && e.message ? e.message : e);
  });
}, 30000);

// --- イベント更新 (管理者のみ) ---
app.put('/api/admin/events/:id', adminAuth.requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid event ID' });
  }

  const {
    title,
    start_time,
    end_time,
    url,
    thumbnail_url,
    platform,
    event_type,
    description,
    status,
    external_id,
    confirmed  // ← これを追加
  } = req.body;

  const updates = [];
  const params = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (start_time !== undefined) {
    // start_time が空文字列の場合は null にする
    const startTimeValue = start_time && start_time.trim() !== '' ? start_time : null;
    updates.push('start_time = ?');
    params.push(startTimeValue);
    
    // confirmed の自動判定（明示的に指定されていない場合）
    if (confirmed === undefined && startTimeValue) {
      const eventDate = new Date(startTimeValue);
      const now = new Date();
      const autoConfirmed = eventDate < now ? true : null;
      updates.push('confirmed = ?');
      params.push(autoConfirmed);
    }
  }
  if (end_time !== undefined) {
    const endTimeValue = end_time && end_time.trim() !== '' ? end_time : null;
    updates.push('end_time = ?');
    params.push(endTimeValue);
  }
  if (url !== undefined) {
    updates.push('url = ?');
    params.push(url);
  }
  if (thumbnail_url !== undefined) {
    updates.push('thumbnail_url = ?');
    params.push(thumbnail_url);
  }
  if (platform !== undefined) {
    updates.push('platform = ?');
    params.push(platform);
  }
  if (event_type !== undefined) {
    updates.push('event_type = ?');
    params.push(event_type);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (external_id !== undefined) {
    updates.push('external_id = ?');
    params.push(external_id);
  }
  if (confirmed !== undefined) {  // ← これを追加
    updates.push('confirmed = ?');
    params.push(confirmed);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const sql = `UPDATE events SET ${updates.join(', ')} WHERE id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      console.error('/api/admin/events/:id PUT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    console.log(`[Event Updated] ID: ${id}, Admin: ${req.adminUser}`);
    syncEventNotifications().catch(console.error);

    db.get('SELECT * FROM events WHERE id = ?', [id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Event updated but failed to fetch' });
      }
      return res.json(row);
    });
  });
});

// --- イベント取得（管理者用） ---
app.get('/api/admin/events/:id', adminAuth.requireAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid event ID' });
    }

    db.get('SELECT * FROM events WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('/api/admin/events/:id SELECT err:', err.message);
            return res.status(500).json({ error: 'DB error', detail: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Event not found' });
        }
        return res.json(row);
    });
});

// --- イベント削除 (管理者のみ) ---
app.delete('/api/admin/events/:id', adminAuth.requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid event ID' });
  }

  db.run('DELETE FROM events WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('/api/admin/events/:id DELETE err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    console.log(`[Event Deleted] ID: ${id}, Admin: ${req.adminUser}`);
    syncEventNotifications().catch(console.error);

    return res.json({ success: true, message: 'Event deleted' });
  });
});

// ============================================
// API：即時 or 予約
// ============================================
app.post('/api/admin/notify', adminAuth.requireAuth, async (req, res) => {
  const { scheduleAt } = req.body;

  try {
    // -------------------------
    // 予約送信
    // -------------------------
    if (scheduleAt) {
      const runAt = new Date(scheduleAt).getTime();

      if (isNaN(runAt) || runAt <= Date.now()) {
        return res.status(400).json({
          error: 'scheduleAt must be future time'
        });
      }

      db.run(
        `INSERT INTO scheduled_notifications (run_at, payload_json)
         VALUES (?, ?)`,
        [runAt, JSON.stringify(req.body)],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          return res.json({
            success: true,
            scheduled: true,
            id: this.lastID,
            runAt
          });
        }
      );

      return;
    }

    // -------------------------
    // 即時送信
    // -------------------------
    const result = await handleAdminNotify(req.body, req.adminUser);

    return res.json({
      success: true,
      message: `Notification sent to ${result.sentCount} clients`,
      ...result
    });

  } catch (e) {
    console.error('[Admin Notify]', e);
    return res.status(500).json({ error: e.message });
  }
});

/*
// パスワードハッシュ生成ツール（開発用 - 本番では削除推奨）
app.get('/api/admin/generate-hash', (req, res) => {
  const password = req.query.password;
  if (!password) {
    return res.status(400).json({ error: 'password query parameter required' });
  }
  const hash = adminAuth.generatePasswordHash(password);
  res.json({ password, hash });
});
*/
// --- 起動 ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});