function register(app, db) {
  app.get("/api/notifications/stats", (req, res) => {
    const years = parseInt(req.query.years, 10) || 1;
    db.all("SELECT strftime('%Y-%m-%d', created_at, 'localtime') as date, COUNT(*) as count FROM notifications WHERE created_at >= date('now', 'localtime', '-' || ? || ' year') GROUP BY date ORDER BY date ASC", [years], (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error", detail: err.message });
      const stats = {};
      (rows || []).forEach(row => { stats[row.date] = row.count; });
      res.json(stats);
    });
  });

  app.get("/api/history", (req, res) => {
    let limit = parseInt(req.query.limit, 10) || 10;
    let offset = parseInt(req.query.offset, 10) || 0;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (isNaN(offset) || offset < 0) offset = 0;
    const MAX_LIMIT = 100;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    db.get("SELECT COUNT(*) AS cnt FROM notifications", [], (countErr, countRow) => {
      if (countErr) return res.status(500).json({ error: "DB error", detail: countErr.message });
      const total = countRow?.cnt ? parseInt(countRow.cnt, 10) : 0;
      if (!total) return res.json({ logs: [], total: 0, hasMore: false });
      db.all(`SELECT n.id, n.title, n.body, n.url, n.icon, n.image, n.platform, n.status, strftime('%s', n.created_at) AS timestamp, (SELECT tm.id FROM twitter_media tm WHERE tm.tweet_id = n.tweet_id ORDER BY tm.id LIMIT 1) AS media_id, (SELECT tm.media_type FROM twitter_media tm WHERE tm.tweet_id = n.tweet_id ORDER BY tm.id LIMIT 1) AS media_type FROM notifications n ORDER BY n.created_at DESC LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
        if (err) return res.status(500).json({ error: "DB error", detail: err.message });
        const safeRows = Array.isArray(rows) ? rows : [];
        const hasMore = offset + safeRows.length < total;
        const logs = safeRows.map(r => ({ id: r.id, title: r.title, body: r.body, url: r.url, icon: r.icon, image: r.image, platform: r.platform || "不明", status: r.status || "success", timestamp: r.timestamp ? parseInt(r.timestamp, 10) : 0, media_url: (r.media_id && r.platform !== 'twitterSub') ? `/api/twitter-media/file/${r.media_id}` : null, media_type: (r.platform !== 'twitterSub') ? r.media_type : null }));
        res.json({ logs, total, hasMore });
      });
    });
  });
}

module.exports = { register };
