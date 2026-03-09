// platformFetch/index.js
const twitch = require('./twitch');
const twitcasting = require('./twitcasting');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'data.db'));

const YOUTUBE_LOOKAHEAD_MS     = 14 * 24 * 60 * 60 * 1000; // 2週間
const NEAR_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;            // ±10分

async function updateSchedule() {
    console.log('[Schedule Update] Start');

    // YouTube は webhook 側 (youtube.js) でイベント同期する運用に変更
    const results = await Promise.all([
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

    // YouTube イベントは現在時刻から2週間以内のものだけ登録する
    if (ev.platform === 'youtube') {
        const startMs = new Date(ev.start_time).getTime();
        const now = Date.now();
        if (startMs > now + YOUTUBE_LOOKAHEAD_MS) {
            console.log(`[upsertEvent] YouTube event too far ahead, skip: ${ev.title} (${ev.start_time})`);
            return;
        }
    }

    const sqlSelect = `SELECT id FROM events WHERE external_id = ? AND platform = ?`;
    const sqlInsert = `
        INSERT INTO events (title, start_time, end_time, url, thumbnail_url, platform, event_type, description, status, external_id, confirmed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const sqlUpdate = `
        UPDATE events SET title=?, start_time=?, end_time=?, url=?, thumbnail_url=?, event_type=?, description=?, status=?
        WHERE id=?
    `;

    return new Promise((resolve, reject) => {
        db.get(sqlSelect, [ev.external_id, ev.platform], (err, row) => {
            if (err) return reject(err);

            if (row) {
                // 既存レコードを上書き
                const params = [
                    ev.title,
                    ev.start_time,
                    ev.end_time || null,
                    ev.url || null,
                    ev.thumbnail_url || null,
                    ev.event_type || 'live',
                    ev.description || null,
                    ev.status || 'scheduled',
                    row.id
                ];
                db.run(sqlUpdate, params, err => err ? reject(err) : resolve());
            } else {
                // 新規登録
                // confirmed の判定（外部連携は未確認扱い）
                let confirmed = null;
                if (ev.status === 'ended') {
                    confirmed = true;
                } else if (ev.start_time) {
                    const eventDate = new Date(ev.start_time);
                    const now = new Date();
                    confirmed = eventDate < now ? true : null;
                }

                // YouTube 新規登録時: ±10分以内の既存スケジュールを重複とみなして削除
                const maybeDeleteNearDuplicates = (callback) => {
                    if (ev.platform !== 'youtube') return callback();

                    const startMs = new Date(ev.start_time).getTime();
                    const rangeFrom = new Date(startMs - NEAR_DUPLICATE_WINDOW_MS).toISOString();
                    const rangeTo   = new Date(startMs + NEAR_DUPLICATE_WINDOW_MS).toISOString();

                    // external_id が異なる（=別登録の）同時刻帯スケジュールを削除
                    db.run(
                        `DELETE FROM events
                         WHERE platform = 'youtube'
                           AND (external_id IS NULL OR external_id != ?)
                           AND start_time >= ?
                           AND start_time <= ?`,
                        [ev.external_id, rangeFrom, rangeTo],
                        function(delErr) {
                            if (delErr) {
                                console.error('[upsertEvent] near-duplicate delete err:', delErr.message);
                            } else if (this.changes > 0) {
                                console.log(`[upsertEvent] Removed ${this.changes} near-duplicate YouTube event(s) around ${ev.start_time}`);
                            }
                            callback();
                        }
                    );
                };

                maybeDeleteNearDuplicates(() => {
                    const params = [
                        ev.title,
                        ev.start_time,
                        ev.end_time || null,
                        ev.url || null,
                        ev.thumbnail_url || null,
                        ev.platform || 'other',
                        ev.event_type || 'live',
                        ev.description || null,
                        ev.status || 'scheduled',
                        ev.external_id || null,
                        confirmed
                    ];
                    db.run(sqlInsert, params, err => err ? reject(err) : resolve());
                });
            }
        });
    });
}

module.exports = { updateSchedule, upsertEvent };