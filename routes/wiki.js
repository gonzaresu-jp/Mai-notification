/**
 * まいちゃんwiki API（仮公開・表示レイヤーのみ）
 *
 * 材料は既存データだけで完結する（LLM生成なし）:
 *   - rag-knowledge.json      … 公式プロフィール（3件）
 *   - rag-personality.json    … 字幕からの統計抽出（r18_kinks は出力しない）
 *   - nassy archive.db        … 動画カタログ（811本・年別/カテゴリ集計）
 *   - data.db video_minutes   … 5分単位の要約（明言した事実を含む）
 *
 *   GET /api/wiki/profile   → { knowledge: [...], personality: {...} }
 *   GET /api/wiki/overview  → { years: [...], categories: {...}, minutes: {...}, recentMinutes: [...] }
 */

const fs = require("fs");
const path = require("path");

const ARCHIVE_API_BASE = (process.env.ARCHIVE_API_BASE || "http://192.168.1.70:8766").replace(/\/+$/, "");
const KNOWLEDGE_FILE = process.env.KNOWLEDGE_FILE || path.join(__dirname, "..", "rag-knowledge.json");
const PERSONALITY_FILE = process.env.RAG_PERSONALITY_FILE || path.join(__dirname, "..", "rag-personality.json");

// 公開レスポンスに含めるキー（_meta と r18_kinks は含めない）
const PERSONALITY_KEYS = ["fact", "trait", "behavior", "emotion", "style", "relationship", "exemplars"];

const OVERVIEW_TTL_MS = 10 * 60 * 1000;
let overviewCache = { value: null, at: 0, stale: null };

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || [])));
  });
}

function loadProfile() {
  const raw = loadJson(KNOWLEDGE_FILE);
  const knowledge = Array.isArray(raw)
    ? raw.map((k) => ({ id: k.id, title: String(k.title || ""), text: String(k.text || "") }))
    : [];
  const p = loadJson(PERSONALITY_FILE);
  const personality = {};
  if (p && typeof p === "object") {
    for (const k of PERSONALITY_KEYS) if (Array.isArray(p[k])) personality[k] = p[k];
  }
  return { knowledge, personality };
}

async function fetchCatalog() {
  // 上流APIは limit=100 上限。total(811) まで offset で全件取得する。
  const limit = 100;
  let offset = 0;
  let total = 0;
  const videos = [];
  for (let page = 0; page < 12; page++) {
    const r = await fetch(
      `${ARCHIVE_API_BASE}/api/videos?limit=${limit}&offset=${offset}&sort=stream_at_asc&include_deleted=0`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!r.ok) throw new Error(`archive videos ${r.status}`);
    const j = await r.json();
    total = Number(j.total) || total;
    const batch = Array.isArray(j.videos) ? j.videos : [];
    videos.push(...batch);
    if (!batch.length || videos.length >= total) break;
    offset += batch.length;
  }
  return { total, videos };
}

function buildYears(videos) {
  const map = new Map();
  for (const v of videos) {
    if (v.availability && v.availability !== "public") continue;
    const y = String(v.stream_date_jst || "").slice(0, 4);
    if (!/^\d{4}$/.test(y)) continue;
    let e = map.get(y);
    if (!e) {
      e = { year: Number(y), videos: 0, seconds: 0, top: [] };
      map.set(y, e);
    }
    e.videos += 1;
    e.seconds += Number(v.duration_sec) || 0;
    e.top.push({
      video_id: v.video_id,
      title: String(v.title || ""),
      url: v.url || `https://www.youtube.com/watch?v=${v.video_id}`,
      stream_date_jst: String(v.stream_date_jst || ""),
      view_count: Number(v.view_count) || 0,
      thumbnail: String(v.thumbnail || ""),
    });
  }
  const years = [...map.values()].sort((a, b) => b.year - a.year);
  for (const e of years) {
    e.hours = Math.round((e.seconds / 3600) * 10) / 10;
    delete e.seconds;
    e.top.sort((a, b) => b.view_count - a.view_count);
    e.top = e.top.slice(0, 4);
  }
  return years;
}

function buildCategories(videos) {
  const cat = {};
  for (const v of videos) {
    if (v.availability && v.availability !== "public") continue;
    for (const c of Array.isArray(v.categories) ? v.categories : []) {
      if (!c) continue;
      cat[c] = (cat[c] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(cat).sort((a, b) => b[1] - a[1]));
}

function buildRecentMinutes(rows) {
  const vids = new Map();
  for (const r of rows) {
    let v = vids.get(r.video_id);
    if (!v) {
      if (vids.size >= 6) continue;
      v = {
        video_id: r.video_id,
        title: String(r.title || ""),
        stream_date_jst: String(r.stream_date_jst || ""),
        url: r.url || `https://www.youtube.com/watch?v=${r.video_id}`,
        sections: [],
        _last: null,
      };
      vids.set(r.video_id, v);
    }
    const secName = String(r.section || "");
    if (!v._last || v._last.section !== secName) {
      v._last = { section: secName, items: [] };
      v.sections.push(v._last);
    }
    if (v._last.items.length >= 10) continue; // 1セクションあたり表示は10トピックまで
    let facts = [];
    try {
      const f = JSON.parse(r.facts || "[]");
      if (Array.isArray(f)) facts = f.slice(0, 6).map(String);
    } catch { /* facts が壊れていても無視 */ }
    v._last.items.push({ topic: String(r.topic || ""), facts });
  }
  return [...vids.values()].map((v) => {
    delete v._last;
    return v;
  });
}

async function buildOverview(db) {
  const [catalog, minCount, minYear, recent] = await Promise.all([
    fetchCatalog(),
    dbAll(db, "SELECT COUNT(DISTINCT video_id) AS videos, COUNT(*) AS chunks FROM video_minutes"),
    dbAll(
      db,
      `SELECT substr(stream_date_jst,1,4) AS year, COUNT(DISTINCT video_id) AS videos
       FROM video_minutes WHERE stream_date_jst IS NOT NULL GROUP BY 1 ORDER BY 1`
    ),
    dbAll(
      db,
      `SELECT video_id, title, stream_date_jst, url, section, topic, facts
       FROM video_minutes WHERE stream_date_jst IS NOT NULL
       ORDER BY stream_date_jst DESC, start_ms ASC LIMIT 150`
    ),
  ]);
  const mc = minCount[0] || {};
  const years = buildYears(catalog.videos);
  return {
    generatedAt: new Date().toISOString(),
    catalogTotal: years.reduce((n, y) => n + y.videos, 0),
    years,
    categories: buildCategories(catalog.videos),
    minutes: {
      videos: Number(mc.videos) || 0,
      chunks: Number(mc.chunks) || 0,
      perYear: minYear.map((r) => ({ year: Number(r.year), videos: Number(r.videos) || 0 })),
    },
    recentMinutes: buildRecentMinutes(recent),
  };
}

function register(app, db) {
  app.get("/api/wiki/profile", (req, res) => {
    try {
      res.json(loadProfile());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/wiki/overview", async (req, res) => {
    if (overviewCache.value && Date.now() - overviewCache.at < OVERVIEW_TTL_MS) {
      return res.json(overviewCache.value);
    }
    try {
      const value = await buildOverview(db);
      overviewCache = { value, at: Date.now(), stale: value };
      return res.json(value);
    } catch (e) {
      console.error("[wiki] overview err:", e.message);
      if (overviewCache.stale) return res.json({ ...overviewCache.stale, stale: true });
      res.status(502).json({ error: "overview unavailable" });
    }
  });
}

module.exports = { register };
