// platformFetch/index.js
const twitch = require('./twitch');
const twitcasting = require('./twitcasting');
const youtube = require('./youtube');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'data.db'));

const YOUTUBE_LOOKAHEAD_MS     = 14 * 24 * 60 * 60 * 1000; // 2週間
const NEAR_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;            // ±10分

function toJstNaive(dateStr) {
    if (!dateStr) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth()+1)}-${pad(jst.getUTCDate())}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}`;
}

async function updateSchedule() {
    console.log('[Schedule Update] Start');

    const [twitchEvents, twitEvents, ytEvents] = await Promise.all([
        twitch.fetchLatest().catch(e => { console.error('[Schedule Update] Twitch error:', e.message); return []; }),
        twitcasting.fetchLatest().catch(e => { console.error('[Schedule Update] TwitCasting error:', e.message); return []; }),
        youtube.fetchLatest().catch(e => { console.error('[Schedule Update] YouTube error:', e.message); return []; })
    ]);

    console.log(`[Schedule Update] Twitch: ${twitchEvents.length}, TwitCasting: ${twitEvents.length}, YouTube: ${ytEvents.length}`);

    for (const ev of [...twitchEvents, ...twitEvents, ...ytEvents]) {
        // YouTube: scheduled/live のみ処理（ended は無視して重複防止）
        if (ev.platform === 'youtube' && ev.status !== 'scheduled' && ev.status !== 'live') continue;
        await upsertEvent(ev);
    }

    console.log('[Schedule Update] Done');
}

async function upsertEvent(ev) {
    if (!ev.start_time) return;

    // YouTube/外部プラットフォームのUTC文字列をJST naiveに変換
    if (ev.platform === 'youtube') {
        ev.start_time = toJstNaive(ev.start_time);
        if (ev.end_time) ev.end_time = toJstNaive(ev.end_time);
    }

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

    // YouTube: ±10分以内の近似重複レコードの候補を取得するクエリ。
    // 以前は platform = 'youtube' の行だけを対象にしていたため、Twitter/Gemma解析
    // 経由で先に作られた同一配信の予定（platform = 'twitter' 等）が対象外になり、
    // 重複が作られていた。ここでは event_type = 'live' の行を広く候補にする。
    // ※ ended の行は対象外（古い動画が未来の予定を誤上書き防止）
    const sqlNearDuplicateCandidates = `
        SELECT id, start_time FROM events
        WHERE event_type = 'live'
          AND status = 'scheduled'
          AND (external_id IS NULL OR external_id != ?)
    `;

    // confirmed の判定：具体的な時刻がある予定は確認定は確認済み扱い。
    // 時間帯のみ（time_period）で時刻未定のもののみ null（未定）。
    let confirmed = null;
    if (ev.status === 'ended') {
        confirmed = 1;
    } else if (ev.start_time && /T\d{2}:\d{2}/.test(ev.start_time)) {
        confirmed = 1;
    }

    // UPDATE時に external_id も更新するクエリ（近似重複の上書き用）
    const sqlUpdateFull = `
        UPDATE events SET title=?, start_time=?, end_time=?, url=?, thumbnail_url=?,
                          event_type=?, description=?, status=?, external_id=?, confirmed=COALESCE(confirmed, ?)
        WHERE id=?
    `;

    return new Promise((resolve, reject) => {
        db.get(sqlSelect, [ev.external_id, ev.platform], (err, row) => {
            if (err) return reject(err);

            if (row) {
                // external_id が一致 → 通常の UPDATE
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

            } else if (ev.platform === 'youtube') {
                // YouTube かつ external_id 不一致 → ±10分以内の近似重複を検索。
                // 候補はSQLで広めに取得し、実際の時刻一致判定はJS側で
                // Date（実ミリ秒）として比較する。start_time はソースにより
                // ナイーブJST文字列（"2026-07-17T22:30:00"）だったりUTC ISO文字列
                // （"2026-07-17T13:30:18Z"）だったりするため、SQLの文字列比較
                // （BETWEEN等）では同一時刻でも一致判定できないことがあるため。
                const startMs = new Date(ev.start_time).getTime();

                db.all(sqlNearDuplicateCandidates, [ev.external_id], (err, candidates) => {
                    if (err) return reject(err);

                    const nearRow = (candidates || []).find(c => {
                        const cMs = new Date(c.start_time).getTime();
                        return Number.isFinite(cMs) && Math.abs(cMs - startMs) <= NEAR_DUPLICATE_WINDOW_MS;
                    });

                    if (nearRow) {
                        // 近似重複が見つかった → external_id ごと上書き UPDATE
                        console.log(`[upsertEvent] Near-duplicate found (id=${nearRow.id}), overwriting with YouTube event: ${ev.title}`);
                        const params = [
                            ev.title,
                            ev.start_time,
                            ev.end_time || null,
                            ev.url || null,
                            ev.thumbnail_url || null,
                            ev.event_type || 'live',
                            ev.description || null,
                            ev.status || 'scheduled',
                            ev.external_id || null,
                            confirmed,
                            nearRow.id
                        ];
                        db.run(sqlUpdateFull, params, err => err ? reject(err) : resolve());

                    } else {
                        // 近似重複なし → 新規 INSERT
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
                    }
                });

            } else {
                // YouTube 以外の新規登録 → そのまま INSERT
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
            }
        });
    });
}

module.exports = { updateSchedule, upsertEvent };