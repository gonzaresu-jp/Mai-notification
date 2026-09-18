// minutes-sync.js - 議事録(video_minutes) -> ベクトルDB 同期
// vector-sync.js のサブセット。source='minutes' として Pi へ埋め込み・upsert する。
// 生成直後（minutes-gen.js）と定期同期（vector-sync.js）の両方から呼ばれる。

const embeddings = require("./embeddings");
const vectordb = require("./vectordb");

const MINUTES_OFFSET = 4_000_000_000;
const BATCH = parseInt(process.env.MINUTES_SYNC_BATCH || "200", 10);

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r || []))));
}

// 埋め込み用テキスト: タイトル + 話題 + 事実
function buildText(m) {
  let topics = [], facts = [], detail = "";
  try { topics = JSON.parse(m.topics || "[]"); } catch {}
  try { facts = JSON.parse(m.facts || "[]"); } catch {}
  try { detail = JSON.parse(m.summary || "[]").join(" "); } catch { detail = m.summary || ""; }
  const parts = [];
  if (m.title) parts.push(m.title);
  if (m.topic) parts.push(m.topic);
  if (Array.isArray(topics) && topics.length) parts.push(topics.join("、"));
  if (Array.isArray(facts) && facts.length) parts.push(facts.join("。 "));
  if (detail) parts.push(detail);
  return parts.filter(Boolean).join("｜");
}

async function upsertRows(db, rows) {
  if (!rows.length) return 0;
  const texts = rows.map(buildText);
  const vectors = await embeddings.embed(texts, "doc");
  const points = rows.map((m, i) => ({
    id: MINUTES_OFFSET + Number(m.id),
    vector: vectors[i],
    payload: {
      source: "minutes",
      ref_id: Number(m.id),
      video_id: m.video_id || "",
      start_ms: Number(m.start_ms || 0),
      end_ms: Number(m.end_ms || 0),
      topic: m.topic || "",
      summary: m.summary || "",
      facts: m.facts || "",
      title: m.title || "",
      stream_date_jst: m.stream_date_jst || "",
      url: m.url || "",
    },
  }));
  await vectordb.upsert(points);
  return rows.length;
}

// 全議事録を upsert（冪等：同じ id は上書き）。生成直後や全再同期に使う。
async function embedMinutes(db, batchSize = BATCH) {
  if (!vectordb.isEnabled() || !embeddings.isEnabled()) return 0;
  await vectordb.ensureCollection(embeddings.getDim());
  let total = 0, offset = 0;
  while (true) {
    const rows = await dbAll(
      db, "SELECT id, video_id, start_ms, end_ms, topic, summary, facts, title, stream_date_jst, url " +
        "FROM video_minutes ORDER BY id LIMIT ? OFFSET ?", [batchSize, offset]);
    if (!rows.length) break;
    total += await upsertRows(db, rows);
    offset += rows.length;
  }
  return total;
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { e ? reject(e) : resolve(this); }));
}

// 増分同期（vector-sync.js の 5分毎 から呼ばれる）。new な行だけ流す。
async function syncMinutesIncremental(db, limit = BATCH) {
  if (!vectordb.isEnabled() || !embeddings.isEnabled()) return 0;
  const lastId = await new Promise((resolve, reject) =>
    db.get("SELECT last_id FROM vector_sync_state WHERE source='minutes'", [], (e, r) => (e ? reject(e) : resolve(r ? Number(r.last_id) : 0))));
  const rows = await dbAll(
    db, "SELECT id, video_id, start_ms, end_ms, topic, summary, facts, title, stream_date_jst, url " +
      "FROM video_minutes WHERE id > ? ORDER BY id LIMIT ?", [lastId, limit]);
  if (!rows.length) return 0;
  const n = await upsertRows(db, rows);
  const maxId = rows.reduce((m, r) => Math.max(m, Number(r.id)), lastId);
  await dbRun(db,
    "INSERT INTO vector_sync_state (source, last_id, updated_at) VALUES ('minutes', ?, CURRENT_TIMESTAMP) " +
    "ON CONFLICT(source) DO UPDATE SET last_id = excluded.last_id, updated_at = CURRENT_TIMESTAMP", [maxId]);
  return n;
}

module.exports = { embedMinutes, syncMinutesIncremental, buildText, MINUTES_OFFSET };