// platformFetch/index.js
const youtube = require('./youtube');
const twitch = require('./twitch');
const twitcasting = require('./twitcasting');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/db.sqlite');

async function updateSchedule() {
    console.log('[Schedule Update] Start');

    // 各プラットフォームから取得
    const results = await Promise.all([
        youtube.fetchLatest(),
        twitch.fetchLatest(),
        twitcasting.fetchLatest()
    ]);

    for (const events of results) {
        for (const ev of events) {
            await upsertEvent(ev);
        }
    }

    console.log('[Schedule Update] Done');
}

async function upsertEvent(ev) {
    if (!ev.start_time) return;

    const sqlSelect = `SELECT id FROM events WHERE start_time = ? AND platform = ?`;
    const sqlInsert = `
        INSERT INTO events (title, start_time, end_time, url, thumbnail_url, platform, event_type, description, status, external_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const sqlUpdate = `
        UPDATE events SET title=?, end_time=?, url=?, thumbnail_url=?, event_type=?, description=?, status=?, external_id=?
        WHERE id=?
    `;

    return new Promise((resolve, reject) => {
        db.get(sqlSelect, [ev.start_time, ev.platform], (err, row) => {
            if (err) return reject(err);

            if (row) {
                // 上書き
                const params = [
                    ev.title,
                    ev.end_time || null,
                    ev.url || null,
                    ev.thumbnail_url || null,
                    ev.event_type || 'live',
                    ev.description || null,
                    null,           // ← status は null
                    ev.external_id || null,
                    row.id
                ];
                db.run(sqlUpdate, params, err => err ? reject(err) : resolve());
            } else {
                // 新規登録
                const params = [
                    ev.title,
                    ev.start_time,
                    ev.end_time || null,
                    ev.url || null,
                    ev.thumbnail_url || null,
                    ev.platform || 'other',
                    ev.event_type || 'live',
                    ev.description || null,
                    null,           // ← status は null
                    ev.external_id || null
                ];
                db.run(sqlInsert, params, err => err ? reject(err) : resolve());
            }
        });
    });
}

module.exports = { updateSchedule };
