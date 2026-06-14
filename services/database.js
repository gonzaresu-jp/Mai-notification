const ctx = require("./context");

function initDatabase() {
  const db = ctx.db;
  db.serialize(() => {
    db.run("PRAGMA busy_timeout = 5000");
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA synchronous = NORMAL");
    db.run("PRAGMA temp_store = MEMORY");

    db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, body TEXT, url TEXT, icon TEXT,
      platform TEXT, status TEXT DEFAULT 'success',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, data TEXT
    )`, (err) => { if (err) console.error("notifications create err:", err.message); });

    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, client_id TEXT NOT NULL UNIQUE,
      endpoint TEXT NOT NULL UNIQUE,
      subscription_json TEXT, settings_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => { if (err) console.error("subscriptions create err:", err.message); });

    db.run(`CREATE TABLE IF NOT EXISTS android_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, client_id TEXT NOT NULL,
      fcm_token TEXT NOT NULL UNIQUE, device_name TEXT,
      settings_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen_at DATETIME
    )`, (err) => { if (err) console.error("android_devices create err:", err.message); });

    db.run(`CREATE TABLE IF NOT EXISTS scraper_status (
      id TEXT PRIMARY KEY, name TEXT, last_run DATETIME,
      status TEXT, message TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => { if (err) console.error("scraper_status create err:", err.message); });

    db.run(`CREATE TABLE IF NOT EXISTS scheduled_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at INTEGER NOT NULL, payload_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent INTEGER DEFAULT 0, sent_at INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, start_time DATETIME, end_time DATETIME,
      url TEXT, thumbnail_url TEXT, platform TEXT,
      event_type TEXT DEFAULT 'live',
      description TEXT, status TEXT DEFAULT 'scheduled',
      external_id TEXT,
      time_period TEXT,
      confirmed INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0,1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => { if (err) console.error("events create err:", err.message); });

    db.run(`CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_start_time_asc ON events (start_time ASC, status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_status ON events (status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_platform ON events (platform)`);

    db.run(`CREATE TABLE IF NOT EXISTS weekly_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL UNIQUE,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => { if (err) console.error("weekly_messages create err:", err.message); });
    db.run(`CREATE INDEX IF NOT EXISTS idx_weekly_messages_week_start ON weekly_messages (week_start)`);

    ensureNotificationsSchema();
    ensureScheduledSchema();
    ensureEventsSchema();
    ensureSubscriptionsSchema();
    ensureAndroidSchema();
    ensureIndexes();
    cleanupDuplicates();
    backfillPlatformSettingsDefaults();

    const userRoutes = require("../user-routes");
    userRoutes.initUserTables(db);

    const twitterMediaSaver = require("../twitter-media-saver");
    twitterMediaSaver.initMediaDb(db);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received: closing DB and exiting");
    db.close((err) => {
      if (err) console.error("DB close err:", err.message);
      else console.log("DB closed");
      process.exit(err ? 1 : 0);
    });
  });
}

function ensureNotificationsSchema() {
  const db = ctx.db;
  db.all("PRAGMA table_info(notifications)", [], (err, columns) => {
    if (err) { console.error("PRAGMA notifications err:", err.message); return; }
    const colNames = columns.map(c => c.name);
    if (!colNames.includes("platform")) {
      db.run("ALTER TABLE notifications ADD COLUMN platform TEXT");
      console.log("notifications.platform added");
    }
    if (!colNames.includes("tweet_id")) {
      db.run("ALTER TABLE notifications ADD COLUMN tweet_id TEXT");
      console.log("notifications.tweet_id added");
    }
    if (!colNames.includes("status")) {
      db.run("ALTER TABLE notifications ADD COLUMN status TEXT");
      db.run("UPDATE notifications SET status='success' WHERE status IS NULL");
      console.log("notifications.status added");
    }
    if (!colNames.includes("image")) {
      db.run("ALTER TABLE notifications ADD COLUMN image TEXT");
      console.log("notifications.image added");
    }
  });
}

function ensureEventsSchema() {
  const db = ctx.db;
  db.all("PRAGMA table_info(events)", [], (err, columns) => {
    if (err) { console.error("PRAGMA events err:", err.message); return; }
    const colNames = columns.map(c => c.name);
    if (!colNames.includes("confirmed")) {
      db.run("ALTER TABLE events ADD COLUMN confirmed INTEGER");
      console.log("events.confirmed added");
    }
    if (!colNames.includes("time_period")) {
      db.run("ALTER TABLE events ADD COLUMN time_period TEXT");
      console.log("events.time_period added");
    }
  });
}

function ensureScheduledSchema() {
  const db = ctx.db;
  db.all("PRAGMA table_info(scheduled_notifications)", [], (err, columns) => {
    if (err) { console.error("PRAGMA scheduled_notifications err:", err.message); return; }
    const colNames = columns.map(c => c.name);
    if (!colNames.includes("sent_at")) {
      db.run("ALTER TABLE scheduled_notifications ADD COLUMN sent_at INTEGER");
      console.log("scheduled_notifications.sent_at added");
    }
    if (!colNames.includes("kind")) {
      db.run("ALTER TABLE scheduled_notifications ADD COLUMN kind TEXT", (alterErr) => {
        if (!alterErr) { console.log("scheduled_notifications.kind added"); ensureIndexes(); }
      });
    }
    if (!colNames.includes("ref_id")) {
      db.run("ALTER TABLE scheduled_notifications ADD COLUMN ref_id INTEGER", (alterErr) => {
        if (!alterErr) { console.log("scheduled_notifications.ref_id added"); ensureIndexes(); }
      });
    }
  });
}

function ensureSubscriptionsSchema() {
  const db = ctx.db;
  db.all("PRAGMA table_info(subscriptions)", [], (err, columns) => {
    if (err) { console.error("PRAGMA subscriptions err:", err.message); return; }
    const colNames = columns.map(c => c.name);
    if (!colNames.includes("user_id")) {
      db.run("ALTER TABLE subscriptions ADD COLUMN user_id INTEGER", (alterErr) => {
        if (alterErr) console.error("subscriptions.user_id add failed:", alterErr.message);
        else console.log("subscriptions.user_id added");
      });
    }
  });
}

function ensureAndroidSchema() {
  const db = ctx.db;
  db.all("PRAGMA table_info(android_devices)", [], (err, columns) => {
    if (err) { console.error("PRAGMA android_devices err:", err.message); return; }
    const colNames = columns.map(c => c.name);
    if (!colNames.includes("user_id")) {
      db.run("ALTER TABLE android_devices ADD COLUMN user_id INTEGER", (alterErr) => {
        if (alterErr) console.error("android_devices.user_id add failed:", alterErr.message);
        else console.log("android_devices.user_id added");
      });
    }
  });
}

function ensureIndexes() {
  const db = ctx.db;
  db.run("CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id ON subscriptions (client_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_android_devices_client_id ON android_devices (client_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_android_devices_user_id ON android_devices (user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC)");
  db.run("CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_due ON scheduled_notifications (sent, run_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_event_ref ON scheduled_notifications (kind, ref_id, sent)");
  console.log("indexes ensured");
}

function cleanupDuplicates() {
  const db = ctx.db;
  db.all("SELECT client_id, COUNT(*) c FROM subscriptions GROUP BY client_id HAVING c > 1", [], (err, duplicates) => {
    if (err || !duplicates?.length) return;
    console.log("duplicates:", duplicates.length);
    db.run("BEGIN");
    let pending = duplicates.length;
    duplicates.forEach((d) => {
      db.run("DELETE FROM subscriptions WHERE client_id = ? AND id NOT IN (SELECT MAX(id) FROM subscriptions WHERE client_id = ?)", [d.client_id, d.client_id], function () {
        pending--;
        if (pending === 0) db.run("COMMIT");
      });
    });
  });
}

function backfillPlatformSettingsDefaults() {
  const db = ctx.db;
  db.all("SELECT id, settings_json FROM subscriptions", [], (err, rows) => {
    if (err || !rows?.length) return;
    const targets = [];
    for (const row of rows) {
      let parsed = {};
      if (row.settings_json && typeof row.settings_json === "string") {
        try { parsed = JSON.parse(row.settings_json); } catch { parsed = {}; }
      }
      const merged = { ...ctx.DEFAULT_PLATFORM_SETTINGS, ...parsed };
      if (!merged.customLinks || typeof merged.customLinks !== "object") merged.customLinks = {};
      const mergedJson = JSON.stringify(merged);
      if (mergedJson !== (row.settings_json || "")) targets.push({ id: row.id, settingsJson: mergedJson });
    }
    if (!targets.length) return;
    let pending = targets.length;
    let updated = 0;
    for (const target of targets) {
      db.run("UPDATE subscriptions SET settings_json = ? WHERE id = ?", [target.settingsJson, target.id], function (updateErr) {
        if (!updateErr) updated += this.changes || 0;
        pending--;
        if (pending === 0) console.log("subscriptions.settings_json backfilled:", updated);
      });
    }
  });
}

module.exports = { initDatabase };
