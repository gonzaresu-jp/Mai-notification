// vector-sync.js - SQLite -> ベクトルDB(Qdrant) 増分同期
// notifications(通知/ツイート本文) と events(配信スケジュール) を埋め込み、Piのベクトルへ upsert する。
// VECTOR_DB_URL / EMBEDDING_ENDPOINT が未設定なら何もしない（既存機能に影響なし）。

const ctx = require("./context");
const embeddings = require("./embeddings");
const vectordb = require("./vectordb");

const BATCH = parseInt(process.env.VECTOR_SYNC_BATCH || "100", 10);
const SYNC_INTERVAL_MS = parseInt(process.env.VECTOR_SYNC_INTERVAL_MS || String(5 * 60 * 1000), 10);

// source 毎に数値IDを衝突しないようオフセットする（Qdrantのpoint idは符号なし整数）
const SOURCE_OFFSET = { notifications: 1_000_000_000, events: 2_000_000_000 };

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => ctx.db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r || []))));
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => ctx.db.get(sql, params, (e, r) => (e ? reject(e) : resolve(r || null))));
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => ctx.db.run(sql, params, function (e) { e ? reject(e) : resolve(this); }));
}

async function getLastId(source) {
  const row = await dbGet("SELECT last_id FROM vector_sync_state WHERE source = ?", [source]);
  return row ? Number(row.last_id) : 0;
}
async function setLastId(source, lastId) {
  await dbRun(
    "INSERT INTO vector_sync_state (source, last_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(source) DO UPDATE SET last_id = excluded.last_id, updated_at = CURRENT_TIMESTAMP",
    [source, lastId]
  );
}

// 1ソース分の1バッチを同期。新規行が無ければ 0 を返す。
async function syncSource(source, loadRows, buildText, buildPayload) {
  const lastId = await getLastId(source);
  const rows = await loadRows(lastId, BATCH);
  if (rows.length === 0) return 0;

  const texts = rows.map(buildText);
  const vectors = await embeddings.embed(texts, "doc");

  const points = rows.map((row, i) => ({
    id: SOURCE_OFFSET[source] + Number(row.id),
    vector: vectors[i],
    payload: { source, ref_id: Number(row.id), ...buildPayload(row) },
  }));

  await vectordb.upsert(points);
  const maxId = rows.reduce((m, r) => Math.max(m, Number(r.id)), lastId);
  await setLastId(source, maxId);
  return rows.length;
}

async function syncNotifications() {
  return syncSource(
    "notifications",
    (lastId, limit) => dbAll(
      "SELECT id, title, body, url, platform, created_at FROM notifications WHERE id > ? ORDER BY id ASC LIMIT ?",
      [lastId, limit]
    ),
    (r) => [r.platform, r.title, r.body].filter(Boolean).join(" / "),
    (r) => ({ title: r.title || "", body: r.body || "", url: r.url || "", platform: r.platform || "", created_at: r.created_at || null })
  );
}

async function syncEvents() {
  return syncSource(
    "events",
    (lastId, limit) => dbAll(
      "SELECT id, title, start_time, platform, url, event_type FROM events WHERE id > ? AND status != 'cancelled' ORDER BY id ASC LIMIT ?",
      [lastId, limit]
    ),
    (r) => [r.platform, r.event_type, r.title, r.start_time].filter(Boolean).join(" / "),
    (r) => ({ title: r.title || "", start_time: r.start_time || "", url: r.url || "", platform: r.platform || "", event_type: r.event_type || "" })
  );
}

let running = false;

// 各ソースを新規が尽きるまで（または安全上限まで）流す。
async function syncVectors() {
  if (!vectordb.isEnabled() || !embeddings.isEnabled()) return;
  if (running) return;
  running = true;
  try {
    await vectordb.ensureCollection(embeddings.getDim());
    let total = 0;
    for (const fn of [syncNotifications, syncEvents]) {
      // 1ティックあたり最大 20 バッチで打ち切り（Piへの負荷とループ暴走防止）
      for (let i = 0; i < 20; i++) {
        const n = await fn();
        total += n;
        if (n < BATCH) break;
      }
    }
    if (total > 0) console.log(`[vector-sync] upserted ${total} points`);
  } catch (e) {
    console.error("[vector-sync] error:", e?.message || e);
  } finally {
    running = false;
  }
}

function startVectorSync() {
  if (!vectordb.isEnabled() || !embeddings.isEnabled()) {
    console.log("[vector-sync] disabled (VECTOR_DB_URL / EMBEDDING_ENDPOINT 未設定)");
    return;
  }
  console.log(`[vector-sync] enabled (interval ${SYNC_INTERVAL_MS / 1000}s)`);
  setTimeout(() => { syncVectors().catch(e => console.error("[vector-sync] startup err:", e?.message)); }, 20 * 1000);
  setInterval(() => { syncVectors().catch(e => console.error("[vector-sync] interval err:", e?.message)); }, SYNC_INTERVAL_MS).unref();
}

module.exports = { syncVectors, startVectorSync };
