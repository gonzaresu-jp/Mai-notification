const adminAuth = require("../admin/admin");
const notif = require("../services/notification");

function register(app, db) {
  app.post("/api/admin/login", adminAuth.login);
  app.post("/api/admin/logout", adminAuth.logout);
  app.get("/api/admin/verify", adminAuth.requireAuth, (req, res) => { res.json({ success: true, user: req.adminUser }); });

  app.post("/api/admin/notify", adminAuth.requireAuth, async (req, res) => {
    try {
      const { scheduleAt } = req.body;
      if (scheduleAt) {
        const runAt = new Date(scheduleAt).getTime();
        if (isNaN(runAt) || runAt <= Date.now()) return res.status(400).json({ error: "scheduleAt must be future time" });
        db.run("INSERT INTO scheduled_notifications (run_at, payload_json) VALUES (?, ?)", [runAt, JSON.stringify(req.body)], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, scheduled: true, id: this.lastID, runAt });
        });
        return;
      }
      const result = await notif.handleAdminNotify(req.body, req.adminUser);
      res.json({ success: true, message: `Notification sent to ${result.sentCount} clients`, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
