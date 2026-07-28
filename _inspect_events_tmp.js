const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
const days = ['日', '月', '火', '水', '木', '金', '土'];

db.all(
  "SELECT id, title, start_time, platform, event_type, status, time_period, confirmed, created_at FROM events WHERE start_time IS NOT NULL ORDER BY id DESC LIMIT 60",
  [],
  (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    rows.forEach(r => {
      const d = new Date(r.start_time);
      console.log(
        r.id, '|', r.start_time, '->', days[d.getDay()] + '曜日',
        '| created:', r.created_at,
        '| title:', r.title,
        '| type:', r.event_type,
        '| period:', r.time_period,
        '| status:', r.status
      );
    });
    db.close();
  }
);
