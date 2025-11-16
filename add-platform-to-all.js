// add-platform-to-all.js
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = '/var/www/html/mai-push/data.db'; // 環境に合わせて変更
const PLATFORM_KEYS = ['bilibili']; // 追加したいプラットフォーム名をここに入れる

const db = new sqlite3.Database(DB_PATH);

function safeParse(str) {
  if (!str) return {};
  try { return JSON.parse(str); } catch (e) { return {}; }
}

db.serialize(() => {
  db.all('SELECT id, settings_json FROM subscriptions', [], (err, rows) => {
    if (err) { console.error('SELECT err', err); process.exit(1); }
    const updateStmt = db.prepare('UPDATE subscriptions SET settings_json = ? WHERE id = ?');

    let updated = 0;
    rows.forEach(row => {
      const settings = safeParse(row.settings_json);
      let changed = false;
      PLATFORM_KEYS.forEach(k => {
        if (!(k in settings)) { settings[k] = true; changed = true; }
      });
      if (changed) {
        updateStmt.run(JSON.stringify(settings), row.id, (uErr) => {
          if (uErr) console.error('UPDATE err id=', row.id, uErr);
        });
        updated++;
      }
    });

    updateStmt.finalize(() => {
      console.log(`Done. Updated ${updated} rows (added keys: ${PLATFORM_KEYS.join(', ')})`);
      db.close();
    });
  });
});
