/**
 * YouTube アーカイブ検索 API のリバースプロキシ
 *
 * 実体は別ホスト (192.168.1.70:8766) で動く api.py（SQLite FTS5 + ひらがな正規化）。
 * このホストからは到達できるが公開されていないため、ここで同一オリジンに中継する。
 * 詳細: 恋乃夜まい_YT_Data/API_HANDOVER.md
 *
 *   GET /api/archive/videos?category=&limit=&offset=&sort=
 *   GET /api/archive/search?q=&kind=&category=&limit=&offset=
 *   GET /api/archive/video/:id
 *   GET /api/archive/stats
 *   GET /api/archive/thumbnail/:id
 */

const ARCHIVE_API_BASE = (process.env.ARCHIVE_API_BASE || "http://192.168.1.70:8766").replace(/\/+$/, "");

const JSON_TIMEOUT_MS = 12000;
const SEARCH_TIMEOUT_MS = 25000;
const THUMB_TIMEOUT_MS = 15000;

// 上流は単一プロセスの Python HTTP サーバなので、短時間の再問い合わせはキャッシュで吸収する
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  // LRU: 参照したものを末尾に回す
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

async function fetchUpstream(pathWithQuery, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(ARCHIVE_API_BASE + pathWithQuery, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 上流の JSON をキャッシュ付きで中継する */
async function proxyJson(res, pathWithQuery, { timeoutMs = JSON_TIMEOUT_MS, useCache = true } = {}) {
  if (useCache) {
    const cached = cacheGet(pathWithQuery);
    if (cached) {
      res.set("X-Archive-Cache", "HIT");
      return res.status(cached.status).json(cached.body);
    }
  }

  let upstream;
  try {
    upstream = await fetchUpstream(pathWithQuery, timeoutMs);
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    return res.status(aborted ? 504 : 502).json({
      error: aborted ? "アーカイブAPIがタイムアウトしました" : "アーカイブAPIに接続できません",
      detail: String((err && err.message) || err),
    });
  }

  let body;
  try {
    body = await upstream.json();
  } catch {
    return res.status(502).json({ error: "アーカイブAPIの応答を解釈できません" });
  }

  if (useCache && upstream.ok) cacheSet(pathWithQuery, { status: upstream.status, body });
  res.set("X-Archive-Cache", "MISS");
  return res.status(upstream.status).json(body);
}

/** クエリから許可したキーだけを取り出して上流へ渡す */
function pickQuery(req, keys) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = req.query[key];
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(Array.isArray(value) ? value[0] : value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function register(app) {
  app.get("/api/archive/health", async (req, res) => {
    await proxyJson(res, "/api/health", { useCache: false });
  });

  app.get("/api/archive/stats", async (req, res) => {
    await proxyJson(res, "/api/stats");
  });

  app.get("/api/archive/videos", async (req, res) => {
    await proxyJson(res, "/api/videos" + pickQuery(req, ["category", "limit", "offset", "sort"]));
  });

  app.get("/api/archive/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) return res.status(400).json({ error: "検索キーワード (q) が必要です" });
    if (q.length > 100) return res.status(400).json({ error: "検索キーワードが長すぎます" });
    await proxyJson(res, "/api/search" + pickQuery(req, ["q", "kind", "category", "limit", "offset"]), {
      timeoutMs: SEARCH_TIMEOUT_MS,
    });
  });

  app.get("/api/archive/video/:id", async (req, res) => {
    const id = req.params.id;
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: "invalid video_id" });
    await proxyJson(res, `/api/video/${id}`);
  });

  app.get("/api/archive/thumbnail/:id", async (req, res) => {
    const id = String(req.params.id || "").replace(/\.(jpg|jpeg|webp|png)$/i, "");
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: "invalid video_id" });

    let upstream;
    try {
      upstream = await fetchUpstream(`/api/thumbnail/${id}`, THUMB_TIMEOUT_MS);
    } catch {
      return res.status(502).end();
    }
    if (!upstream.ok) return res.status(upstream.status).end();

    let buf;
    try {
      buf = Buffer.from(await upstream.arrayBuffer());
    } catch {
      return res.status(502).end();
    }

    res.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    // nginx の /api/ ロケーションが no-store を付けるため実際には効かないが、
    // 直叩き・将来的な location 追加に備えて上流の意図を保持しておく
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    const etag = upstream.headers.get("etag");
    if (etag) res.set("ETag", etag);
    return res.send(buf);
  });
}

module.exports = { register, ARCHIVE_API_BASE };
