const ctx = require("../services/context");
const notif = require("../services/notification");
const auth = require("../auth");

function register(app, db) {
  const { parseAndMergePlatformSettings } = notif;

  app.post("/api/android/register", auth.optionalAuth, (req, res) => {
    const { clientId, fcmToken, deviceName, settings } = req.body || {};
    if (!clientId || typeof clientId !== "string") return res.status(400).json({ error: "clientId required" });
    if (!fcmToken || typeof fcmToken !== "string") return res.status(400).json({ error: "fcmToken required" });
    const trimmedClientId = clientId.trim();
    const trimmedToken = fcmToken.trim();
    if (!trimmedClientId || trimmedClientId.length > 256) return res.status(400).json({ error: "invalid clientId" });
    if (trimmedToken.length < 20 || trimmedToken.length > 4096) return res.status(400).json({ error: "invalid fcmToken" });
    const mergedSettings = settings ? parseAndMergePlatformSettings(settings) : { ...ctx.DEFAULT_PLATFORM_SETTINGS };
    const settingsJson = JSON.stringify(mergedSettings);
    const upsertSql = `INSERT INTO android_devices (client_id, fcm_token, device_name, settings_json, updated_at, last_seen_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(fcm_token) DO UPDATE SET client_id = excluded.client_id, device_name = excluded.device_name, settings_json = excluded.settings_json, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP`;
    const params = [trimmedClientId, trimmedToken, deviceName || null, settingsJson];
    function linkUser() { if (req.userId) db.run("UPDATE android_devices SET user_id = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE fcm_token = ?", [req.userId, trimmedToken]); }
    db.run(upsertSql, params, function (err) {
      if (!err) { linkUser(); return res.json({ success: true, message: "Android device registered" }); }
      db.run("UPDATE android_devices SET client_id = ?, device_name = ?, settings_json = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE fcm_token = ?", [trimmedClientId, deviceName || null, settingsJson, trimmedToken], function (updateErr) {
        if (updateErr) return res.status(500).json({ error: "DB error", detail: updateErr.message });
        if (this.changes > 0) { linkUser(); return res.json({ success: true, message: "Android device updated" }); }
        db.run("INSERT INTO android_devices (client_id, fcm_token, device_name, settings_json, updated_at, last_seen_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", params, function (insertErr) {
          if (insertErr) return res.status(500).json({ error: "DB error", detail: insertErr.message });
          linkUser();
          res.json({ success: true, message: "Android device registered" });
        });
      });
    });
  });

  app.delete("/api/android/register", (req, res) => {
    const fcmToken = req.body?.fcmToken || req.query.fcmToken;
    const clientId = req.body?.clientId || req.query.clientId;
    if (!fcmToken && !clientId) return res.status(400).json({ error: "fcmToken or clientId required" });
    const sql = fcmToken ? "DELETE FROM android_devices WHERE fcm_token = ?" : "DELETE FROM android_devices WHERE client_id = ?";
    const param = fcmToken ? String(fcmToken).trim() : String(clientId).trim();
    db.run(sql, [param], function (err) {
      if (err) return res.status(500).json({ error: "DB error", detail: err.message });
      res.json({ success: true, deleted: this.changes || 0 });
    });
  });

  app.patch("/api/android/settings", (req, res) => {
    const { clientId, fcmToken, settings } = req.body || {};
    if (!settings || typeof settings !== "object") return res.status(400).json({ error: "settings required" });
    if (!clientId && !fcmToken) return res.status(400).json({ error: "clientId or fcmToken required" });
    const merged = parseAndMergePlatformSettings(settings);
    const sql = fcmToken ? "UPDATE android_devices SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE fcm_token = ?" : "UPDATE android_devices SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE client_id = ?";
    const param = fcmToken ? String(fcmToken).trim() : String(clientId).trim();
    db.run(sql, [JSON.stringify(merged), param], function (err) {
      if (err) return res.status(500).json({ error: "DB error", detail: err.message });
      res.json({ success: true, updated: this.changes > 0 });
    });
  });
}

module.exports = { register };
