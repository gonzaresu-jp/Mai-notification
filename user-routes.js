// user-routes.js
// Google OAuth フロー + ユーザー別 API を server.js に追加するモジュール
// 使い方: server.js で require して register(app, db) を呼ぶ
'use strict';

const auth = require('./auth');

// ============================================================
// Promise ラッパー
// ============================================================
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

// ============================================================
// DB テーブル初期化
// ============================================================
function initUserTables(db) {
  db.serialize(() => {
    // ユーザー基本情報
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id    TEXT NOT NULL UNIQUE,
      email        TEXT NOT NULL,
      display_name TEXT,
      avatar_url   TEXT,
      oshi_since   DATE,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, err => {
      if (err) console.error('[users] create err:', err.message);
      else     console.log('[users] table ensured');
    });

    // ユーザーに紐づいた通知サブスクリプション
    // 匿名 subscriptions テーブルと client_id で連携
    db.run(`CREATE TABLE IF NOT EXISTS user_subscriptions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id         TEXT NOT NULL UNIQUE,
      endpoint          TEXT NOT NULL UNIQUE,
      subscription_json TEXT,
      settings_json     TEXT DEFAULT '{}',
      device_name       TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, err => {
      if (err) console.error('[user_subscriptions] create err:', err.message);
      else     console.log('[user_subscriptions] table ensured');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions (user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_client_id ON user_subscriptions (client_id)`);

    // 個別スケジュール（将来用）
    db.run(`CREATE TABLE IF NOT EXISTS user_schedules (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id         INTEGER REFERENCES events(id) ON DELETE SET NULL,
      source           TEXT DEFAULT 'user',
      title            TEXT,
      note             TEXT,
      url              TEXT,
      thumbnail_url    TEXT,
      scheduled_at     DATETIME,
      reminder_minutes INTEGER DEFAULT 30,
      reminder_sent_at DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, err => {
      if (err) console.error('[user_schedules] create err:', err.message);
      else     console.log('[user_schedules] table ensured');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_user_schedules_user_id ON user_schedules (user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_schedules_event_id ON user_schedules (event_id)`);

    db.all("PRAGMA table_info(user_schedules)", [], (err, columns) => {
      if (err) {
        console.error('[user_schedules] PRAGMA err:', err.message);
        return;
      }
      const names = new Set((columns || []).map(c => c.name));
      if (!names.has('source')) {
        db.run("ALTER TABLE user_schedules ADD COLUMN source TEXT DEFAULT 'user'", (alterErr) => {
          if (alterErr) console.error('[user_schedules] source add err:', alterErr.message);
          else console.log('[user_schedules] source column added');
        });
      }
      if (!names.has('reminder_sent_at')) {
        db.run("ALTER TABLE user_schedules ADD COLUMN reminder_sent_at DATETIME", (alterErr) => {
          if (alterErr) console.error('[user_schedules] reminder_sent_at add err:', alterErr.message);
          else console.log('[user_schedules] reminder_sent_at column added');
        });
      }
      if (!names.has('url')) {
        db.run("ALTER TABLE user_schedules ADD COLUMN url TEXT", (alterErr) => {
          if (alterErr) console.error('[user_schedules] url add err:', alterErr.message);
          else console.log('[user_schedules] url column added');
        });
      }
      if (!names.has('thumbnail_url')) {
        db.run("ALTER TABLE user_schedules ADD COLUMN thumbnail_url TEXT", (alterErr) => {
          if (alterErr) console.error('[user_schedules] thumbnail_url add err:', alterErr.message);
          else console.log('[user_schedules] thumbnail_url column added');
        });
      }
    });
  });
}

// ============================================================
// デフォルト設定（server.js の DEFAULT_PLATFORM_SETTINGS と同値）
// ============================================================
const DEFAULT_PLATFORM_SETTINGS = Object.freeze({
  twitcasting:    true,
  youtube:        true,
  youtubeCommunity: true,
  fanbox:         true,
  twitterMain:    true,
  twitterSub:     true,
  milestone:      true,
  schedule:       true,
  gipt:           true,
  twitch:         true,
  bilibili:       false,
});

function mergeSettings(json) {
  let parsed = {};
  try { parsed = JSON.parse(json || '{}'); } catch {}
  return { ...DEFAULT_PLATFORM_SETTINGS, ...parsed };
}

const MAX_SCHEDULE_TITLE_LEN = 120;
const MAX_SCHEDULE_TEXT_LEN = 200;
const MAX_SCHEDULE_URL_LEN = 500;
const ALLOWED_REMINDER_MINUTES = new Set([60, 30, 10, 5, 3, 0]);

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
  if (raw.length > MAX_SCHEDULE_URL_LEN) {
    throw new Error('URL_TOO_LONG');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('URL_INVALID');
  }

  const protocol = String(parsed.protocol || '').toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error('URL_SCHEME_INVALID');
  }
  return parsed.toString();
}

function normalizeReminderMinutes(value, fallback = 30) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !ALLOWED_REMINDER_MINUTES.has(n)) {
    throw new Error('REMINDER_INVALID');
  }
  return n;
}

// ============================================================
// 匿名サブスクリプション → ユーザーへのマイグレーション
// ============================================================
async function migrateSubscription(db, clientId, userId) {
  if (!clientId || !userId) return;

  // 匿名テーブルから取得
  const anon = await dbGet(db, 'SELECT * FROM subscriptions WHERE client_id = ?', [clientId]);
  if (!anon) return;

  // 既に紐づいているか確認
  const existing = await dbGet(db, 'SELECT id FROM user_subscriptions WHERE client_id = ?', [clientId]);

  if (existing) {
    // user_id を最新に更新（デバイスの持ち替え対応）
    await dbRun(db,
      `UPDATE user_subscriptions
       SET user_id = ?, endpoint = ?, subscription_json = ?, settings_json = COALESCE(?, settings_json)
       WHERE client_id = ?`,
      [userId, anon.endpoint, anon.subscription_json, anon.settings_json || null, clientId]
    );
    console.log(`[user-routes] subscription migrated (update) client_id=${clientId} -> user_id=${userId}`);
  } else {
    await dbRun(db,
      `INSERT INTO user_subscriptions (user_id, client_id, endpoint, subscription_json, settings_json)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, anon.client_id, anon.endpoint, anon.subscription_json, anon.settings_json || '{}']
    );
    console.log(`[user-routes] subscription migrated (insert) client_id=${clientId} -> user_id=${userId}`);
  }
}

// ============================================================
// ログアウト時の紐づけ解除
// ============================================================
async function unlinkUserDevices(db, userId, { clientId, fcmToken } = {}) {
  if (!userId) return;

  const cid = clientId ? String(clientId).trim() : '';
  const fcm = fcmToken ? String(fcmToken).trim() : '';

  if (cid) {
    await dbRun(db,
      'DELETE FROM user_subscriptions WHERE client_id = ? AND user_id = ?',
      [cid, userId]
    ).catch(() => {});

    await dbRun(db,
      'UPDATE android_devices SET user_id = NULL WHERE client_id = ? AND user_id = ?',
      [cid, userId]
    ).catch(() => {});
  }

  if (fcm) {
    await dbRun(db,
      'UPDATE android_devices SET user_id = NULL WHERE fcm_token = ? AND user_id = ?',
      [fcm, userId]
    ).catch(() => {});
  }
}


// ============================================================
// Upsert user
// ============================================================
async function upsertUser(db, googleUser) {
  const existing = await dbGet(db, 'SELECT * FROM users WHERE google_id = ?', [googleUser.googleId]);
  if (existing) {
    await dbRun(db,
      `UPDATE users
       SET email = ?, display_name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE google_id = ?`,
      [googleUser.email, googleUser.displayName, googleUser.avatarUrl, googleUser.googleId]
    );
    return { ...existing, email: googleUser.email, display_name: googleUser.displayName, avatar_url: googleUser.avatarUrl };
  }
  const result = await dbRun(db,
    `INSERT INTO users (google_id, email, display_name, avatar_url)
     VALUES (?, ?, ?, ?)`,
    [googleUser.googleId, googleUser.email, googleUser.displayName, googleUser.avatarUrl]
  );
  return { id: result.lastID, google_id: googleUser.googleId, ...googleUser };
}

// ============================================================
// ルート登録
// ============================================================
// 自サイト内パスのみ許可するリダイレクトヘルパー
function safeRedirect(res, url) {
  const target = (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//'))
    ? url
    : '/';
  res.redirect(target);
}

function register(app, db, authLimiter) {
  const limiter = authLimiter || ((req, res, next) => next()); // fallback: no-op

  // ──────────────────────────────────────────
  // 1. Google ログイン開始
  // ──────────────────────────────────────────
  app.get('/auth/google', limiter, (req, res) => {
    const returnTo  = req.query.returnTo  || '/';
    const clientId  = req.query.client_id || ''; // 匿名デバイスのIDを渡す
    const state = Buffer.from(JSON.stringify({ returnTo, clientId })).toString('base64url');
    res.redirect(auth.getAuthUrl(state));
  });

  // ──────────────────────────────────────────
  // 2. Google コールバック
  // ──────────────────────────────────────────
  app.get('/auth/google/callback', limiter, async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');

    let stateData = { returnTo: '/', clientId: '' };
    try {
      stateData = JSON.parse(Buffer.from(state || '', 'base64url').toString());
    } catch {}

    try {
      const googleUser = await auth.exchangeCodeForUser(code);
      const user       = await upsertUser(db, googleUser);

      // 匿名 client_id があれば紐づけ
      if (stateData.clientId) {
        await migrateSubscription(db, stateData.clientId, user.id);
        // Android 端末が同じ client_id を使っている場合も紐づける
        await dbRun(db,
          'UPDATE android_devices SET user_id = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE client_id = ?',
          [user.id, stateData.clientId]
        ).catch(() => {});
      }

      const token = auth.signToken({ userId: user.id, email: user.email || user.google_id });
      res.cookie(auth.COOKIE_NAME, token, auth.COOKIE_OPTIONS);

      console.log(`[auth] login: user_id=${user.id} email=${user.email || user.google_id}`);
      safeRedirect(res, stateData.returnTo);
    } catch (e) {
      console.error('[auth/google/callback]', e.message || e);
      res.status(500).send('Authentication failed. Please try again.');
    }
  });

  // ──────────────────────────────────────────
  // 3. ログアウト
  // ──────────────────────────────────────────
  app.post('/auth/logout', auth.optionalAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const clientId = body.clientId || body.client_id || req.query?.clientId || req.query?.client_id || '';
      const fcmToken = body.fcmToken || req.query?.fcmToken || '';

      if (req.userId && (clientId || fcmToken)) {
        await unlinkUserDevices(db, req.userId, { clientId, fcmToken });
      }
    } catch (e) {
      console.warn('[auth/logout] unlink failed:', e && e.message ? e.message : e);
    }

    res.clearCookie(auth.COOKIE_NAME);
    res.json({ success: true });
  });

  // GET でもログアウトできるようにする（リンクからのアクセス対応）
  app.get('/auth/logout', limiter, auth.optionalAuth, async (req, res) => {
    try {
      const clientId = req.query?.clientId || req.query?.client_id || '';
      const fcmToken = req.query?.fcmToken || '';

      if (req.userId && (clientId || fcmToken)) {
        await unlinkUserDevices(db, req.userId, { clientId, fcmToken });
      }
    } catch (e) {
      console.warn('[auth/logout] unlink failed:', e && e.message ? e.message : e);
    }

    res.clearCookie(auth.COOKIE_NAME);
    safeRedirect(res, req.query.returnTo);
  });

  // ──────────────────────────────────────────
  // 4. 認証状態確認 / プロフィール取得
  // ──────────────────────────────────────────
  app.get('/api/user/me', auth.requireAuth, async (req, res) => {
    try {
      const user = await dbGet(db,
        'SELECT id, email, display_name, avatar_url, oshi_since, created_at FROM users WHERE id = ?',
        [req.userId]
      );
      if (!user) return res.status(404).json({ error: 'User not found' });

      const oshiDays = user.oshi_since
        ? Math.floor((Date.now() - new Date(user.oshi_since).getTime()) / 86400000)
        : null;

      res.json({ ...user, oshi_days: oshiDays });
    } catch (e) {
      console.error('[/api/user/me]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────
  // 5. 推し始めた日 取得・設定
  // ──────────────────────────────────────────
  app.get('/api/user/oshi', auth.requireAuth, async (req, res) => {
    try {
      const user = await dbGet(db, 'SELECT oshi_since FROM users WHERE id = ?', [req.userId]);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const oshiSince = user.oshi_since;
      const days = oshiSince
        ? Math.floor((Date.now() - new Date(oshiSince).getTime()) / 86400000)
        : null;

      res.json({ oshi_since: oshiSince, days });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/user/oshi', auth.requireAuth, async (req, res) => {
    const { oshi_since } = req.body;
    if (!oshi_since || isNaN(new Date(oshi_since).getTime())) {
      return res.status(400).json({ error: 'Valid date required (YYYY-MM-DD)' });
    }
    // 未来の日付はNG
    if (new Date(oshi_since) > new Date()) {
      return res.status(400).json({ error: 'Date cannot be in the future' });
    }
    try {
      await dbRun(db,
        'UPDATE users SET oshi_since = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [oshi_since, req.userId]
      );
      const days = Math.floor((Date.now() - new Date(oshi_since).getTime()) / 86400000);
      res.json({ success: true, oshi_since, days });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────
  // 6. 通知フィルター設定 取得・更新
  // ──────────────────────────────────────────
  app.get('/api/user/notification-settings', auth.requireAuth, async (req, res) => {
    try {
      // ① user_subscriptions から取得（ログイン済みユーザーの設定）
      const row = await dbGet(db,
        'SELECT settings_json FROM user_subscriptions WHERE user_id = ? LIMIT 1',
        [req.userId]
      );
      if (row) {
        return res.json(mergeSettings(row.settings_json));
      }

      // ② user_subscriptions が空 → 匿名 subscriptions テーブルにフォールバック
      // ユーザーに紐づいた client_id を user_subscriptions 経由で探せないので
      // /api/user/link-subscription が呼ばれるまでの間、client_id はフロントから渡す必要がある
      // ここでは clientId クエリパラメータで補完する
      const clientId = req.query.clientId;
      if (clientId) {
        const anonRow = await dbGet(db,
          'SELECT settings_json FROM subscriptions WHERE client_id = ?',
          [clientId]
        );
        if (anonRow) {
          return res.json(mergeSettings(anonRow.settings_json));
        }
      }

      // ③ どこにも設定がなければデフォルト値を返す
      res.json({ ...DEFAULT_PLATFORM_SETTINGS });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/user/notification-settings', auth.requireAuth, async (req, res) => {
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: 'Request body must be a plain object' });
    }

    // 許可キー以外を除去（セキュリティ）
    const allowedKeys = Object.keys(DEFAULT_PLATFORM_SETTINGS);
    const filtered = {};
    for (const key of allowedKeys) {
      if (key in updates) filtered[key] = Boolean(updates[key]);
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: 'No valid settings keys provided' });
    }

    try {
      const rows = await dbAll(db,
        'SELECT id, client_id, settings_json FROM user_subscriptions WHERE user_id = ?',
        [req.userId]
      );

      const json = JSON.stringify({ ...DEFAULT_PLATFORM_SETTINGS, ...filtered });

      if (rows.length > 0) {
        // ① user_subscriptions がある場合：全デバイス更新 + 匿名テーブルに同期
        for (const row of rows) {
          const current = mergeSettings(row.settings_json);
          const merged  = JSON.stringify({ ...current, ...filtered });

          await dbRun(db,
            'UPDATE user_subscriptions SET settings_json = ? WHERE id = ?',
            [merged, row.id]
          );
          // 既存の通知送信ロジック（subscriptions テーブル参照）との後方互換
          await dbRun(db,
            'UPDATE subscriptions SET settings_json = ? WHERE client_id = ?',
            [merged, row.client_id]
          ).catch(() => {});
        }
        const finalSettings = mergeSettings(rows[0].settings_json);
        const finalMerged   = { ...finalSettings, ...filtered };
        return res.json({ success: true, settings: finalMerged, updated_devices: rows.length });

      } else {
        // ② user_subscriptions が空 → clientId クエリで匿名テーブルを直接更新
        const clientId = req.query.clientId || req.body.clientId;
        if (clientId) {
          await dbRun(db,
            'UPDATE subscriptions SET settings_json = ? WHERE client_id = ?',
            [json, clientId]
          ).catch(() => {});
        }
        // ログイン後に link-subscription が呼ばれた時のために
        // users テーブルにキャッシュとして保持（次のログイン時にマイグレーションで拾う）
        return res.json({
          success: true,
          settings: { ...DEFAULT_PLATFORM_SETTINGS, ...filtered },
          updated_devices: 0,
          note: 'Saved to anonymous subscription. Will sync on next migration.'
        });
      }
    } catch (e) {
      console.error('[/api/user/notification-settings PUT]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────
  // 7. 登録デバイス一覧 / デバイス名変更 / 削除
  // ──────────────────────────────────────────
  app.get('/api/user/devices', auth.requireAuth, async (req, res) => {
    try {
      const rows = await dbAll(db,
        'SELECT id, client_id, device_name, settings_json, created_at FROM user_subscriptions WHERE user_id = ? ORDER BY created_at DESC',
        [req.userId]
      );
      res.json(rows.map(r => ({ ...r, settings: mergeSettings(r.settings_json) })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/user/devices/:id', auth.requireAuth, async (req, res) => {
    const { device_name } = req.body;
    if (!device_name || typeof device_name !== 'string') {
      return res.status(400).json({ error: 'device_name required' });
    }
    try {
      const result = await dbRun(db,
        'UPDATE user_subscriptions SET device_name = ? WHERE id = ? AND user_id = ?',
        [device_name.slice(0, 100), req.params.id, req.userId]
      );
      if (result.changes === 0) return res.status(404).json({ error: 'Device not found' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/user/devices/:id', auth.requireAuth, async (req, res) => {
    try {
      const device = await dbGet(db,
        'SELECT client_id FROM user_subscriptions WHERE id = ? AND user_id = ?',
        [req.params.id, req.userId]
      );
      if (!device) return res.status(404).json({ error: 'Device not found' });

      await dbRun(db, 'DELETE FROM user_subscriptions WHERE id = ?', [req.params.id]);
      // 匿名テーブルからも削除
      await dbRun(db, 'DELETE FROM subscriptions WHERE client_id = ?', [device.client_id]).catch(() => {});

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────
  // 8. 匿名デバイスをアカウントに手動紐づけ
  //    （ログイン後にclient_idを送ると紐づける）
  // ──────────────────────────────────────────
  app.post('/api/user/link-subscription', auth.requireAuth, async (req, res) => {
    const { client_id, device_name } = req.body;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    try {
      await migrateSubscription(db, client_id, req.userId);

      // device_name があれば更新
      if (device_name) {
        await dbRun(db,
          'UPDATE user_subscriptions SET device_name = ? WHERE client_id = ? AND user_id = ?',
          [device_name.slice(0, 100), client_id, req.userId]
        ).catch(() => {});
      }

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────
  // 9. 個別スケジュール（将来用）
  // ──────────────────────────────────────────
  app.get('/api/user/schedules', auth.requireAuth, async (req, res) => {
    try {
      const rows = await dbAll(db,
        `SELECT us.id, us.event_id, COALESCE(us.source, 'user') AS source,
                us.title, us.note, us.url, us.thumbnail_url, us.scheduled_at, us.reminder_minutes,
                us.created_at, us.updated_at,
                e.title AS event_title, e.start_time, e.platform, e.url AS event_url, e.status AS event_status
         FROM user_schedules us
         LEFT JOIN events e ON e.id = us.event_id
         WHERE us.user_id = ?
         ORDER BY COALESCE(us.scheduled_at, e.start_time) ASC`,
        [req.userId]
      );
      res.json(rows.map((row) => {
        const editable = !row.event_id && row.source !== 'admin';
        return { ...row, editable };
      }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/user/schedules', auth.requireAuth, async (req, res) => {
    const { event_id, title, note, text, url, thumbnail_url, scheduled_at, reminder_minutes } = req.body;
    try {
      const normalizedText = normalizeOptionalText(note ?? text, MAX_SCHEDULE_TEXT_LEN);
      const normalizedUrl = normalizeOptionalHttpUrl(url);
      const normalizedThumbUrl = normalizeOptionalHttpUrl(thumbnail_url);
      const normalizedReminder = normalizeReminderMinutes(reminder_minutes, 30);

      if (event_id !== undefined && event_id !== null) {
        const event = await dbGet(db, 'SELECT id FROM events WHERE id = ?', [event_id]);
        if (!event) return res.status(404).json({ error: 'Event not found' });

        const result = await dbRun(db,
          `INSERT INTO user_schedules (user_id, event_id, source, note, url, thumbnail_url, reminder_minutes)
           VALUES (?, ?, 'admin', ?, ?, ?, ?)`,
          [req.userId, event_id, normalizedText ?? null, normalizedUrl ?? null, normalizedThumbUrl ?? null, normalizedReminder]
        );
        return res.status(201).json({ success: true, id: result.lastID, source: 'admin' });
      }

      const normalizedTitle = normalizeRequiredTitle(title);
      if (!normalizedTitle) {
        return res.status(400).json({ error: 'title required' });
      }
      if (!scheduled_at || isNaN(new Date(scheduled_at).getTime())) {
        return res.status(400).json({ error: 'valid scheduled_at required' });
      }

      const result = await dbRun(db,
        `INSERT INTO user_schedules (user_id, event_id, source, title, note, url, thumbnail_url, scheduled_at, reminder_minutes)
         VALUES (?, NULL, 'user', ?, ?, ?, ?, ?, ?)`,
        [req.userId, normalizedTitle, normalizedText ?? null, normalizedUrl ?? null, normalizedThumbUrl ?? null, scheduled_at, normalizedReminder]
      );
      res.status(201).json({ success: true, id: result.lastID, source: 'user' });
    } catch (e) {
      const msg = String(e && e.message ? e.message : '');
      if (msg === 'URL_INVALID' || msg === 'URL_SCHEME_INVALID') {
        return res.status(400).json({ error: 'URL must be http/https' });
      }
      if (msg === 'URL_TOO_LONG') {
        return res.status(400).json({ error: `URL too long (max ${MAX_SCHEDULE_URL_LEN})` });
      }
      if (msg === 'REMINDER_INVALID') {
        return res.status(400).json({ error: 'reminder_minutes must be one of: 60,30,10,5,3,0' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/user/schedules/:id', auth.requireAuth, async (req, res) => {
    const { title, note, text, url, thumbnail_url, scheduled_at, reminder_minutes } = req.body;
    try {
      const normalizedTitle = normalizeOptionalText(title, MAX_SCHEDULE_TITLE_LEN);
      const normalizedText = normalizeOptionalText(note ?? text, MAX_SCHEDULE_TEXT_LEN);
      const normalizedUrl = normalizeOptionalHttpUrl(url);
      const normalizedThumbUrl = normalizeOptionalHttpUrl(thumbnail_url);
      const normalizedReminder = (reminder_minutes === undefined)
        ? undefined
        : normalizeReminderMinutes(reminder_minutes, 30);

      if (title !== undefined && !normalizedTitle) {
        return res.status(400).json({ error: 'title required' });
      }
      if (scheduled_at !== undefined && scheduled_at !== null && scheduled_at !== '' && isNaN(new Date(scheduled_at).getTime())) {
        return res.status(400).json({ error: 'valid scheduled_at required' });
      }

      const result = await dbRun(db,
        `UPDATE user_schedules
         SET title = COALESCE(?, title),
             note = COALESCE(?, note),
             url = COALESCE(?, url),
             thumbnail_url = COALESCE(?, thumbnail_url),
             scheduled_at = COALESCE(?, scheduled_at),
             reminder_minutes = COALESCE(?, reminder_minutes),
             reminder_sent_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?
           AND COALESCE(source, 'user') = 'user'
           AND event_id IS NULL`,
        [
          normalizedTitle ?? null,
          normalizedText ?? null,
          normalizedUrl ?? null,
          normalizedThumbUrl ?? null,
          scheduled_at ?? null,
          normalizedReminder ?? null,
          req.params.id,
          req.userId
        ]
      );
      if (result.changes === 0) {
        return res.status(403).json({ error: 'Admin schedules are read-only' });
      }
      res.json({ success: true });
    } catch (e) {
      const msg = String(e && e.message ? e.message : '');
      if (msg === 'URL_INVALID' || msg === 'URL_SCHEME_INVALID') {
        return res.status(400).json({ error: 'URL must be http/https' });
      }
      if (msg === 'URL_TOO_LONG') {
        return res.status(400).json({ error: `URL too long (max ${MAX_SCHEDULE_URL_LEN})` });
      }
      if (msg === 'REMINDER_INVALID') {
        return res.status(400).json({ error: 'reminder_minutes must be one of: 60,30,10,5,3,0' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/user/schedules/:id', auth.requireAuth, async (req, res) => {
    try {
      // 削除前にレコードを取得して存在・権限確認
      const schedule = await dbGet(db,
        `SELECT id, reminder_sent_at FROM user_schedules
         WHERE id = ? AND user_id = ?
           AND COALESCE(source, 'user') = 'user'
           AND event_id IS NULL`,
        [req.params.id, req.userId]
      );
      if (!schedule) {
        return res.status(403).json({ error: 'Admin schedules are read-only' });
      }

      // sendUserScheduleReminders() がこのスケジュールを掴まないよう
      // 先にロック値をセットしてから削除する（レースコンディション防止）
      await dbRun(db,
        `UPDATE user_schedules
         SET reminder_sent_at = 'deleted'
         WHERE id = ? AND reminder_sent_at IS NULL`,
        [req.params.id]
      );

      // スケジュール本体を削除
      await dbRun(db,
        `DELETE FROM user_schedules WHERE id = ? AND user_id = ?`,
        [req.params.id, req.userId]
      );

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Android端末とログインユーザーを紐づけ
  app.post('/api/android/link-user', auth.requireAuth, async (req, res) => {
    try {
      const { clientId, fcmToken } = req.body || {};
      if (!clientId && !fcmToken) {
        return res.status(400).json({ error: 'clientId or fcmToken required' });
      }

      const sql = fcmToken
        ? 'UPDATE android_devices SET user_id = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE fcm_token = ?'
        : 'UPDATE android_devices SET user_id = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE client_id = ?';
      const param = fcmToken ? String(fcmToken).trim() : String(clientId).trim();

      const result = await dbRun(db, sql, [req.userId, param]);
      if (result.changes === 0) {
        return res.json({ success: true, updated: false, message: 'No android device found' });
      }
      return res.json({ success: true, updated: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });
  console.log('[user-routes] all routes registered');
}

module.exports = { register, initUserTables };
