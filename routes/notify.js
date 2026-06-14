const rateLimit = require("express-rate-limit");
const ctx = require("../services/context");
const notif = require("../services/notification");
const sse = require("../services/sse");
const { scheduleHistoryJsonUpdate } = require("../services/history");

const notifyLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many notify requests, please try again later." } });

function register(app, db) {
  const { sendPushNotification, sendFcmNotification, initFcm, isInvalidFcmError, getNotificationHash, parseAndMergePlatformSettings, transformUrl, mapWithLimit } = notif;

  function requireNotifyToken(req, res, next) {
    const token = req.headers["x-notify-token"] || req.headers["x-local-api-token"];
    if (!ctx.ADMIN_NOTIFY_TOKEN) return next();
    if (token === ctx.ADMIN_NOTIFY_TOKEN) return next();
    return res.status(401).json({ error: "Unauthorized: invalid notify token" });
  }

  function verifyNotifyHmac(req, res, next) {
    if (!ctx.NOTIFY_HMAC_SECRET) return next();
    const hmac = req.headers["x-notify-hmac"] || req.headers["x-hmac-signature"];
    if (!hmac) return res.status(401).json({ error: "Missing HMAC signature" });
    const crypto = require("crypto");
    const payload = JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", ctx.NOTIFY_HMAC_SECRET).update(payload).digest("hex");
    if (hmac !== expected) return res.status(401).json({ error: "Invalid HMAC signature" });
    next();
  }

  app.post("/api/notify", notifyLimiter, requireNotifyToken, verifyNotifyHmac, (req, res) => {
    const { data, type, settingKey } = req.body;
    if (!data || !type) return res.status(400).json({ error: "Missing data or type" });
    console.log("[/api/notify] Received:", { title: data.title, settingKey });

    const notificationHash = getNotificationHash(data, settingKey);
    const now = Date.now();
    const lastSent = ctx.recentNotifications.get(notificationHash);
    if (lastSent && now - lastSent < ctx.DUPLICATE_WINDOW_MS) {
      return res.json({ success: true, message: "Duplicate notification ignored", duplicate: true });
    }
    ctx.recentNotifications.set(notificationHash, now);
    if (ctx.recentNotifications.size > 1000) {
      const cutoff = now - ctx.DUPLICATE_WINDOW_MS;
      for (const [hash, timestamp] of ctx.recentNotifications.entries()) {
        if (timestamp < cutoff) ctx.recentNotifications.delete(hash);
      }
    }

    db.run("INSERT INTO notifications (title, body, url, icon, image, platform, status, tweet_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [data.title, data.body, data.url, data.icon, data.image || null, settingKey || type, "success", data.tweet_id || null],
      function (insertErr) {
        if (!insertErr) {
          scheduleHistoryJsonUpdate();
          sse.sendSseEvent({ type: "history-updated", lastUpdated: Math.floor(Date.now() / 1000), added: [this.lastID] });
        }
      });

    db.all("SELECT client_id, subscription_json, settings_json FROM subscriptions", [], async (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error", detail: err.message });
      const total = rows?.length || 0;
      const CONCURRENCY = Math.max(1, parseInt(process.env.NOTIFY_CONCURRENCY, 10) || 20);

      async function sendForRow(row) {
        const clientId = row.client_id;
        if (!row.subscription_json) return { clientId, sent: false, reason: "no_subscription" };
        let subscription;
        try { subscription = JSON.parse(row.subscription_json); } catch (e) { return { clientId, sent: false, reason: "parse_error" }; }
        let settings = parseAndMergePlatformSettings(row.settings_json);
        if (settingKey && settings[settingKey] === false) return { clientId, sent: false, reason: "disabled" };
        const transformedData = { ...data };
        if (data.url) transformedData.url = transformUrl(data.url, settingKey || type, settings);
        try {
          const sent = await sendPushNotification(subscription, transformedData);
          return { clientId, sent };
        } catch (e) { return { clientId, sent: false, error: e?.message }; }
      }

      const results = await mapWithLimit(rows, CONCURRENCY, sendForRow);
      const webSentCount = results.filter(r => r?.sent).length;
      let androidSentCount = 0;
      let androidTotal = 0;

      const fcm = initFcm();
      if (fcm) {
        try {
          const androidRows = await new Promise((resolve, reject) => db.all("SELECT client_id, fcm_token, settings_json FROM android_devices", [], (err2, rows2) => err2 ? reject(err2) : resolve(rows2 || [])));
          androidTotal = androidRows.length;
          if (androidTotal) {
            const ANDROID_CONCURRENCY = Math.max(1, parseInt(process.env.ANDROID_NOTIFY_CONCURRENCY, 10) || 20);
            async function sendForAndroidRow(row) {
              if (!row?.fcm_token) return { sent: false, reason: "no_token" };
              if (settingKey) { const s = parseAndMergePlatformSettings(row.settings_json); if (s[settingKey] === false) return { sent: false, reason: "disabled" }; }
              const result = await sendFcmNotification(fcm, row.fcm_token, data, type, settingKey);
              if (!result.sent && result.error && isInvalidFcmError(result.error)) db.run("DELETE FROM android_devices WHERE fcm_token = ?", [row.fcm_token]);
              return { sent: result.sent };
            }
            const androidResults = await mapWithLimit(androidRows, ANDROID_CONCURRENCY, sendForAndroidRow);
            androidSentCount = androidResults.filter(r => r?.sent).length;
          }
        } catch (e) { console.error("[/api/notify] Android error:", e?.message); }
      } else { console.log("[/api/notify] FCM not configured; skipping Android"); }

      const sentCount = webSentCount + androidSentCount;
      console.log(`[/api/notify] Done: ${sentCount}/${total + androidTotal} (web=${webSentCount}, android=${androidSentCount})`);
      res.json({ success: true, message: `Notification sent to ${sentCount} clients`, sentCount, totalCount: total + androidTotal, detailsSummary: { attempted: total + androidTotal, succeeded: sentCount, failed: total + androidTotal - sentCount }, webPush: { sentCount: webSentCount, totalCount: total }, android: { sentCount: androidSentCount, totalCount: androidTotal } });
    });
  });
}

module.exports = { register };
