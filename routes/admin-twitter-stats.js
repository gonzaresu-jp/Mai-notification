// 管理画面用: まいちゃんのツイート統計API
// GET /api/admin/twitter/stats → services/twitter-stats.js の集計結果JSON
const { getStats } = require("../services/twitter-stats");

function register(app, db) {
  const adminAuth = require("../admin/admin");
  app.get("/api/admin/twitter/stats", adminAuth.requireAuth, async (req, res) => {
    try {
      const stats = await getStats(db);
      res.json(stats);
    } catch (e) {
      console.error("[/api/admin/twitter/stats] error:", e?.message);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { register };
