// 管理画面用: まいちゃんのツイート統計API
// GET /api/admin/twitter/stats → services/twitter-stats.js の集計結果JSON
const { getStats } = require("../services/twitter-stats");
const { getMaiState } = require("../services/mai-state");
const { getPressureRisk } = require("../services/pressure");

function register(app, db) {
  const adminAuth = require("../lib/admin");
  // まいちゃんの活動傾向（配信意欲・体調サイン・曜日×プラットフォーム・7日間の見込み）
  // pressure は管理画面専用の気圧リスク表示（通知には使わない・取得失敗時は null）
  app.get("/api/admin/mai-state", adminAuth.requireAuth, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const [state, pressure] = await Promise.all([
        getMaiState(db, { force: req.query.refresh === "1" }),
        getPressureRisk().catch((e) => {
          console.warn("[pressure] fetch failed:", e?.message);
          return null;
        }),
      ]);
      res.json({ ...state, pressure });
    } catch (e) {
      console.error("[/api/admin/mai-state] error:", e?.message);
      res.status(500).json({ error: e.message });
    }
  });
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
