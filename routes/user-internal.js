'use strict';

const { dbGet, dbRun, dbAll, normalizeRequiredTitle, normalizeOptionalText, normalizeOptionalHttpUrl, normalizeReminderMinutes, MAX_SCHEDULE_TITLE_LEN, MAX_SCHEDULE_TEXT_LEN, MAX_SCHEDULE_URL_LEN } = require('./user-helpers');

const VALID_TIME_PERIODS = ['MORNING', 'NOON', 'EVENING', 'NIGHT', 'LATE_NIGHT'];
function normalizeTimePeriod(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toUpperCase();
  return VALID_TIME_PERIODS.includes(v) ? v : null;
}

function register(app, db) {
  function getInternalToken(req) {
    const token = process.env.ADMIN_NOTIFY_TOKEN || null;
    const authToken = req.headers['x-notify-token'] || req.query.token || '';
    if (!token) return { authorized: false, error: 'Internal API not configured' };
    if (authToken !== token) return { authorized: false, error: 'Unauthorized' };
    return { authorized: true, token };
  }

  app.post('/api/internal/events/create', async (req, res) => {
    const auth = getInternalToken(req);
    if (!auth.authorized) return res.status(auth.error === 'Unauthorized' ? 401 : 503).json({ error: auth.error });

    try {
      const { title, scheduled_at, note, url, thumbnail_url, platform, external_id, time_period } = req.body;
      const normalizedTitle = normalizeRequiredTitle(title);
      if (!normalizedTitle) return res.status(400).json({ error: 'title required' });
      if (!scheduled_at || isNaN(new Date(scheduled_at).getTime())) return res.status(400).json({ error: 'valid scheduled_at required' });

      const normalizedText = normalizeOptionalText(note, MAX_SCHEDULE_TEXT_LEN);
      const normalizedUrl = normalizeOptionalHttpUrl(url);
      const normalizedThumbUrl = normalizeOptionalHttpUrl(thumbnail_url);
      const normalizedPeriod = normalizeTimePeriod(time_period);
      // 具体時刻ありの自動追加は「確定」、時間帯のみの推定は「未定」にする。
      // （従来は常に NULL = 未定 になっていた）
      const confirmedValue = normalizedPeriod ? null : 1;

      const result = await dbRun(db,
        `INSERT INTO events (title, start_time, description, url, thumbnail_url, platform, event_type, status, external_id, confirmed, time_period)
         VALUES (?, ?, ?, ?, ?, ?, 'live', 'scheduled', ?, ?, ?)`,
        [normalizedTitle, scheduled_at, normalizedText ?? null, normalizedUrl ?? null, normalizedThumbUrl ?? null, platform || 'twitter', external_id ?? null, confirmedValue, normalizedPeriod]
      );

      res.status(201).json({ success: true, id: result.lastID, platform: platform || 'twitter' });
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg === 'URL_INVALID' || msg === 'URL_SCHEME_INVALID') return res.status(400).json({ error: 'URL must be http/https' });
      if (msg === 'URL_TOO_LONG') return res.status(400).json({ error: `URL too long (max ${MAX_SCHEDULE_URL_LEN})` });
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/internal/events/find-duplicate', async (req, res) => {
    const auth = getInternalToken(req);
    if (!auth.authorized) return res.status(auth.error === 'Unauthorized' ? 401 : 503).json({ error: auth.error });

    try {
      const { external_id, scheduled_at, title } = req.query;
      if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at required' });

      let rows = [];
      if (external_id) {
        rows = await dbAll(db, 'SELECT * FROM events WHERE external_id = ?', [external_id]);
      }

      if (rows.length === 0) {
        const targetDate = new Date(scheduled_at);
        const minTime = new Date(targetDate.getTime() - 4 * 60 * 60 * 1000);
        const maxTime = new Date(targetDate.getTime() + 4 * 60 * 60 * 1000);

        const timeRows = await dbAll(db,
          'SELECT * FROM events WHERE start_time BETWEEN ? AND ? ORDER BY start_time DESC',
          [minTime.toISOString(), maxTime.toISOString()]
        );

        const isLiveRelated = str => /配信|ライブ|生放送|stream|live|🔴/i.test(str);
        rows = timeRows.filter(r => r.platform === 'twitter' || (isLiveRelated(r.title) && isLiveRelated(title || '')));
      }

      res.json({ found: rows.length > 0, duplicates: rows || [], near: rows.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/internal/events/update', async (req, res) => {
    const auth = getInternalToken(req);
    if (!auth.authorized) return res.status(auth.error === 'Unauthorized' ? 401 : 503).json({ error: auth.error });

    try {
      const { schedule_id, title, scheduled_at, note, url, platform, thumbnail_url } = req.body;
      if (!schedule_id) return res.status(400).json({ error: 'schedule_id required' });

      const normalizedTitle = normalizeOptionalText(title, MAX_SCHEDULE_TITLE_LEN);
      const normalizedText = normalizeOptionalText(note, MAX_SCHEDULE_TEXT_LEN);
      const normalizedUrl = normalizeOptionalHttpUrl(url);
      const normalizedThumbUrl = normalizeOptionalHttpUrl(thumbnail_url);

      // time_period は明示更新（null を渡すとラベルをクリア＝実時刻表示へ切替）。
      // body に time_period が含まれるときだけ更新対象にする。
      // あわせて confirmed も連動：具体時刻に確定（period=null）→ 確定(1)、時間帯のみ→ 未定(null)。
      let periodSet = '';
      const extraParams = [];
      if (Object.prototype.hasOwnProperty.call(req.body, 'time_period')) {
        const np = normalizeTimePeriod(req.body.time_period);
        periodSet = ', time_period = ?, confirmed = ?';
        extraParams.push(np, np ? null : 1);
      }

      const result = await dbRun(db,
        `UPDATE events SET title = COALESCE(?, title), start_time = COALESCE(?, start_time), description = COALESCE(?, description), url = COALESCE(?, url), thumbnail_url = COALESCE(?, thumbnail_url), platform = COALESCE(?, platform)${periodSet}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [normalizedTitle ?? null, scheduled_at ?? null, normalizedText ?? null, normalizedUrl ?? null, normalizedThumbUrl ?? null, platform ?? null, ...extraParams, schedule_id]
      );

      if (result.changes === 0) return res.status(404).json({ error: 'Event not found' });
      res.json({ success: true, updated: true });
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg === 'URL_INVALID' || msg === 'URL_SCHEME_INVALID') return res.status(400).json({ error: 'URL must be http/https' });
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { register };
