
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('data.db');
const HISTORY_JSON_PATH = path.join(__dirname, 'webui', 'history.json');
const HISTORY_JSON_LIMIT = 20;

async function updateHistoryJson() {
  try {
    const query = (limit) =>
      new Promise((resolve, reject) => {
        db.all(
          `SELECT id, title, body, url, icon, platform, status,
                  strftime('%s', created_at) AS timestamp
           FROM notifications
           ORDER BY created_at DESC
           LIMIT ?`,
          [limit],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

    const countQuery = () => 
      new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM notifications', [], (err, row) => {
          if (err) reject(err);
          else resolve(row.count || 0);
        });
      });

    const [rows, dbTotal] = await Promise.all([
      query(HISTORY_JSON_LIMIT),
      countQuery()
    ]);

    const jsonLogs = rows.map(r => ({
      id: r.id,
      title: r.title,
      body: r.body,
      url: r.url,
      icon: r.icon,
      platform: r.platform || '不明',
      status: r.status || 'success',
      timestamp: r.timestamp ? Number(r.timestamp) : 0
    }));

    const jsonData = {
      logs: jsonLogs,
      total: dbTotal,
      limit: HISTORY_JSON_LIMIT,
      lastUpdated: Math.floor(Date.now() / 1000)
    };

    if (!fs.existsSync(path.dirname(HISTORY_JSON_PATH))) {
      fs.mkdirSync(path.dirname(HISTORY_JSON_PATH), { recursive: true });
    }

    fs.writeFileSync(
      HISTORY_JSON_PATH,
      JSON.stringify(jsonData, null, 2),
      'utf8'
    );

    console.log(`✅ history.json updated. Total: ${dbTotal}`);
    db.close();
  } catch (e) {
    console.error('Error:', e);
    db.close();
  }
}

updateHistoryJson();
