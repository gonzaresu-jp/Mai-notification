const ctx = require("../services/context");

function register(app, db) {
  app.get("/api/scraper-status", (req, res) => {
    db.all("SELECT * FROM scraper_status ORDER BY updated_at DESC", [], (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error", detail: err.message });
      res.json({ items: rows || [] });
    });
  });

  app.post("/api/internal/scraper-status", (req, res) => {
    const { id, name, status, message } = req.body || {};
    const token = req.headers["x-local-api-token"] || req.headers["x-notify-token"];
    if (!id) return res.status(400).json({ error: "id required" });
    if (ctx.LOCAL_API_TOKEN && token !== ctx.LOCAL_API_TOKEN) return res.status(401).json({ error: "Unauthorized" });
    const lastRun = (status === "success" || status === "running") ? new Date().toISOString() : null;
    const now = new Date().toISOString();
    db.run("INSERT INTO scraper_status (id, name, status, message, last_run, updated_at) VALUES (?, ?, ?, ?, COALESCE(?, (SELECT last_run FROM scraper_status WHERE id = ?)), ?) ON CONFLICT(id) DO UPDATE SET name = COALESCE(excluded.name, scraper_status.name), status = excluded.status, message = excluded.message, last_run = COALESCE(excluded.last_run, scraper_status.last_run), updated_at = excluded.updated_at",
      [id, name, status, message, lastRun, id, now], function (err) {
        if (err) return res.status(500).json({ error: "DB error", detail: err.message });
        res.json({ success: true });
      });
  });
}

module.exports = { register };
