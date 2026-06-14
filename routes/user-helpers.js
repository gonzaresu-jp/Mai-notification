'use strict';

const dbGet = (db, sql, params) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
);
const dbRun = (db, sql, params) => new Promise((resolve, reject) =>
  db.run(sql, params, function(err) {
    err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes });
  })
);
const dbAll = (db, sql, params) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
);

const MAX_SCHEDULE_TITLE_LEN = 120;
const MAX_SCHEDULE_TEXT_LEN = 200;
const MAX_SCHEDULE_URL_LEN = 500;
const ALLOWED_REMINDER_MINUTES = new Set([60, 30, 10, 5, 3, 0]);

const DEFAULT_PLATFORM_SETTINGS = Object.freeze({
  twitcasting: true, youtube: true, youtubeCommunity: true,
  fanbox: true, twitterMain: true, twitterSub: true,
  milestone: true, schedule: true, gipt: true,
  twitch: true, bilibili: false,
});

function mergeSettings(json) {
  let parsed = {};
  try { parsed = JSON.parse(json || '{}'); } catch {}
  return { ...DEFAULT_PLATFORM_SETTINGS, ...parsed };
}

function normalizeOptionalText(value, maxLen) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

function normalizeRequiredTitle(value) {
  const normalized = normalizeOptionalText(value, MAX_SCHEDULE_TITLE_LEN);
  return normalized || null;
}

function normalizeOptionalHttpUrl(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.length > MAX_SCHEDULE_URL_LEN) throw new Error('URL_TOO_LONG');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('URL_INVALID'); }
  const protocol = String(parsed.protocol || '').toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error('URL_SCHEME_INVALID');
  return parsed.toString();
}

function normalizeReminderMinutes(value, fallback = 30) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !ALLOWED_REMINDER_MINUTES.has(n)) throw new Error('REMINDER_INVALID');
  return n;
}

async function migrateSubscription(db, clientId, userId) {
  if (!clientId || !userId) return;
  const anon = await dbGet(db, 'SELECT * FROM subscriptions WHERE client_id = ?', [clientId]);
  if (!anon) return;
  const existing = await dbGet(db, 'SELECT id FROM user_subscriptions WHERE client_id = ?', [clientId]);
  if (existing) {
    await dbRun(db,
      `UPDATE user_subscriptions SET user_id = ?, endpoint = ?, subscription_json = ?, settings_json = COALESCE(?, settings_json) WHERE client_id = ?`,
      [userId, anon.endpoint, anon.subscription_json, anon.settings_json || null, clientId]
    );
  } else {
    await dbRun(db,
      `INSERT INTO user_subscriptions (user_id, client_id, endpoint, subscription_json, settings_json) VALUES (?, ?, ?, ?, ?)`,
      [userId, anon.client_id, anon.endpoint, anon.subscription_json, anon.settings_json || '{}']
    );
  }
}

async function unlinkUserDevices(db, userId, { clientId, fcmToken } = {}) {
  if (!userId) return;
  const cid = clientId ? String(clientId).trim() : '';
  const fcm = fcmToken ? String(fcmToken).trim() : '';
  if (cid) {
    await dbRun(db, 'DELETE FROM user_subscriptions WHERE client_id = ? AND user_id = ?', [cid, userId]).catch(() => {});
    await dbRun(db, 'UPDATE android_devices SET user_id = NULL WHERE client_id = ? AND user_id = ?', [cid, userId]).catch(() => {});
  }
  if (fcm) {
    await dbRun(db, 'UPDATE android_devices SET user_id = NULL WHERE fcm_token = ? AND user_id = ?', [fcm, userId]).catch(() => {});
  }
}

async function upsertUser(db, googleUser) {
  let existing = await dbGet(db, 'SELECT * FROM users WHERE google_id = ?', [googleUser.googleId]);
  if (!existing && googleUser.email) {
    existing = await dbGet(db, 'SELECT * FROM users WHERE email = ?', [googleUser.email]);
  }
  if (existing) {
    await dbRun(db,
      `UPDATE users SET google_id = COALESCE(google_id, ?), email = ?, display_name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [googleUser.googleId, googleUser.email, googleUser.displayName, googleUser.avatarUrl, existing.id]
    );
    return { ...existing, google_id: existing.google_id || googleUser.googleId, email: googleUser.email, display_name: googleUser.displayName, avatar_url: googleUser.avatarUrl };
  }
  const result = await dbRun(db,
    `INSERT INTO users (google_id, email, display_name, avatar_url) VALUES (?, ?, ?, ?)`,
    [googleUser.googleId, googleUser.email, googleUser.displayName, googleUser.avatarUrl]
  );
  return { id: result.lastID, google_id: googleUser.googleId, ...googleUser };
}

async function upsertDiscordUser(db, discordUser) {
  let existing = await dbGet(db, 'SELECT * FROM users WHERE discord_id = ?', [discordUser.discordId]);
  if (!existing && discordUser.email) {
    existing = await dbGet(db, 'SELECT * FROM users WHERE email = ?', [discordUser.email]);
  }
  if (existing) {
    await dbRun(db,
      `UPDATE users SET discord_id = COALESCE(discord_id, ?), email = ?, display_name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [discordUser.discordId, discordUser.email, discordUser.displayName, discordUser.avatarUrl, existing.id]
    );
    return { ...existing, discord_id: existing.discord_id || discordUser.discordId, email: discordUser.email, display_name: discordUser.displayName, avatar_url: discordUser.avatarUrl };
  }
  const result = await dbRun(db,
    `INSERT INTO users (discord_id, email, display_name, avatar_url) VALUES (?, ?, ?, ?)`,
    [discordUser.discordId, discordUser.email, discordUser.displayName, discordUser.avatarUrl]
  );
  return { id: result.lastID, discord_id: discordUser.discordId, ...discordUser };
}

function safeRedirect(res, url) {
  const target = (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) ? url : '/';
  res.redirect(target);
}

function initUserTables(db) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, google_id TEXT UNIQUE, discord_id TEXT UNIQUE,
      email TEXT NOT NULL, display_name TEXT, avatar_url TEXT,
      oshi_since DATE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, err => { if (err) console.error('[users] create err:', err.message); else console.log('[users] table ensured'); });

    db.all("PRAGMA table_info(users)", [], (err, columns) => {
      if (err) return;
      const names = new Set((columns || []).map(c => c.name));
      if (!names.has('discord_id')) {
        db.serialize(() => {
          db.run("ALTER TABLE users ADD COLUMN discord_id TEXT", (alterErr) => {
            if (alterErr) console.error('[users] discord_id add err:', alterErr.message);
            else { console.log('[users] discord_id column added'); db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)"); }
          });
        });
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS user_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL UNIQUE, endpoint TEXT NOT NULL UNIQUE, subscription_json TEXT,
      settings_json TEXT DEFAULT '{}', device_name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, err => { if (err) console.error('[user_subscriptions] create err:', err.message); else console.log('[user_subscriptions] table ensured'); });
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions (user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_client_id ON user_subscriptions (client_id)`);

    db.run(`CREATE TABLE IF NOT EXISTS user_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL, source TEXT DEFAULT 'user',
      title TEXT, note TEXT, url TEXT, thumbnail_url TEXT, scheduled_at DATETIME,
      reminder_minutes INTEGER DEFAULT 30, reminder_sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, err => { if (err) console.error('[user_schedules] create err:', err.message); else console.log('[user_schedules] table ensured'); });
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_schedules_user_id ON user_schedules (user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_schedules_event_id ON user_schedules (event_id)`);

    db.all("PRAGMA table_info(user_schedules)", [], (err, columns) => {
      if (err) { console.error('[user_schedules] PRAGMA err:', err.message); return; }
      const names = new Set((columns || []).map(c => c.name));
      for (const col of ['source', 'reminder_sent_at', 'url', 'thumbnail_url']) {
        if (!names.has(col)) {
          db.run(`ALTER TABLE user_schedules ADD COLUMN ${col} TEXT${col === 'reminder_sent_at' ? '' : " DEFAULT 'user'"}`.replace(" DEFAULT 'user'", col === 'source' ? " DEFAULT 'user'" : ''), (alterErr) => {
            if (alterErr) console.error(`[user_schedules] ${col} add err:`, alterErr.message);
            else console.log(`[user_schedules] ${col} column added`);
          });
        }
      }
    });
  });
}

module.exports = {
  dbGet, dbRun, dbAll,
  MAX_SCHEDULE_TITLE_LEN, MAX_SCHEDULE_TEXT_LEN, MAX_SCHEDULE_URL_LEN,
  DEFAULT_PLATFORM_SETTINGS, mergeSettings,
  normalizeOptionalText, normalizeRequiredTitle, normalizeOptionalHttpUrl, normalizeReminderMinutes,
  migrateSubscription, unlinkUserDevices, upsertUser, upsertDiscordUser,
  safeRedirect, initUserTables,
};
