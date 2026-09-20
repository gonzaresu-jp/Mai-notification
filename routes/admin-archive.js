/**
 * アーカイブ管理API（管理者専用）
 *
 * .70 (192.168.1.70:8766) の api.py へ、管理者認証（X-Admin-Token）付きで読み書きを中継する。
 * 前提: docs/ARCHIVE-ADMIN-SPEC.md のとおり nassy 側 api.py に管理者エンドポイントが実装されていること。
 * 未実装・トークン未設定の間は 501 / 401 が返る（= このルートは安全側に倒す）。
 *
 *   GET    /api/admin/archive/status             上流の管理者API状態確認
 *   GET    /api/admin/archive/videos             動画一覧（include_deleted/availability 対応・キャッシュなし）
 *   GET    /api/admin/archive/video/:id          動画詳細
 *   PATCH  /api/admin/archive/video/:id          カテゴリ編集 / availability 変更 / 新規登録（upsert）
 *   DELETE /api/admin/archive/video/:id          カタログ索引から完全削除（ファイルは残す）
 *   GET    /api/admin/archive/categories         カテゴリマスター一覧（.70 /api/categories 優先、stats フォールバック）
 *   GET    /api/admin/archive/minutes/:id        要約（video_minutes）状態
 *   POST   /api/admin/archive/minutes/:id        1本の要約を手動生成（flock で cron と衝突回避）
 */

const path = require("path");
const { execFile } = require("child_process");
const ctx = require("../services/context");
const adminAuth = require("../admin/admin");

const ARCHIVE_API_BASE = (process.env.ARCHIVE_API_BASE || "http://192.168.1.70:8766").replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.ARCHIVE_ADMIN_TOKEN || "";

const ADMIN_TIMEOUT_MS = 12000;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// .70 側 PUT /api/admin/video/:id が受け付けるフィールド（このリスト以外は受け渡さない）
const VIDEO_PUT_FIELDS = [
  "title",
  "kind",
  "availability",
  "stream_date_jst",
  "stream_at_jst",
  "duration_sec",
  "url",
  "categories",
  "game_title",
];

function tokenEnabled() {
  return !!ADMIN_TOKEN;
}

/** 上流の /api/admin/* をトークン付きで叩く（キャッシュなし） */
async function adminFetch(pathWithQuery, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADMIN_TIMEOUT_MS);
  try {
    const headers = { "X-Admin-Token": ADMIN_TOKEN };
    let payload;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(ARCHIVE_API_BASE + pathWithQuery, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function adminUnconfigured(res) {
  return res.status(501).json({ error: "ARCHIVE_ADMIN_TOKEN が未設定です（.env に設定すると有効になります）" });
}

/** PATCH ボディから上流に渡す許可フィールドだけ抽出する */
function allowedVideoUpdate(body) {
  const out = {};
  for (const key of VIDEO_PUT_FIELDS) {
    if (body && body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

/** 許可キーだけを上流へ渡す */
function pickAdminQuery(req, keys) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = req.query[key];
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(Array.isArray(value) ? value[0] : value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function register(app) {
  app.get("/api/admin/archive/status", adminAuth.requireAuth, async (req, res) => {
    if (!tokenEnabled()) return adminUnconfigured(res);
    const r = await adminFetch("/api/admin/status");
    return res.status(r.status).json({ ok: r.status === 200, upstream: r.data || null });
  });

  app.get("/api/admin/archive/videos", adminAuth.requireAuth, async (req, res) => {
    if (!tokenEnabled()) return adminUnconfigured(res);
    const qs = pickAdminQuery(req, ["category", "limit", "offset", "sort", "availability", "include_deleted"]);
    const r = await adminFetch(`/api/videos${qs}`);
    return res.status(r.status).json(r.data || {});
  });

  app.get("/api/admin/archive/video/:id", adminAuth.requireAuth, async (req, res) => {
    const id = String(req.params.id || "");
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: "invalid video_id" });
    if (!tokenEnabled()) return adminUnconfigured(res);
    const r = await adminFetch(`/api/video/${id}`);
    return res.status(r.status).json(r.data || {});
  });

  // カテゴリ編集 / availability 変更 / 削除済み動画の新規登録（upsert）
  app.patch("/api/admin/archive/video/:id", adminAuth.requireAuth, async (req, res) => {
    const id = String(req.params.id || "");
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: "invalid video_id" });
    if (!tokenEnabled()) return adminUnconfigured(res);
    const body = allowedVideoUpdate(req.body || {});
    if (!Object.keys(body).length) return res.status(400).json({ error: "更新するフィールドがありません" });
    const r = await adminFetch(`/api/admin/video/${id}`, { method: "PUT", body });
    return res.status(r.status).json(r.data || { error: `upstream ${r.status}` });
  });

  app.delete("/api/admin/archive/video/:id", adminAuth.requireAuth, async (req, res) => {
    const id = String(req.params.id || "");
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: "invalid video_id" });
    if (!tokenEnabled()) return adminUnconfigured(res);
    const r = await adminFetch(`/api/admin/video/${id}`, { method: "DELETE" });
    return res.status(r.status).json(r.data || { error: `upstream ${r.status}` });
  });

  // カテゴリのマスター一覧（.70 /api/categories 優先、未実装なら stats から合成）
  app.get("/api/admin/archive/categories", adminAuth.requireAuth, async (req, res) => {
    const raw = await adminFetch("/api/categories");
    if (raw.status === 200 && raw.data && Array.isArray(raw.data.categories)) {
      // .70 の実装では {category, count} を返すことがあるため、{name, count} に正規化する
      const categories = raw.data.categories.map((c) => ({
        name: c.name || c.category || "",
        count: c.count || 0,
      })).filter((c) => c.name);
      return res.json({ categories });
    }
    const stats = await adminFetch("/api/stats");
    const counts = (stats.data && stats.data.categories) || {};
    const categories = Object.keys(counts)
      .map((name) => ({ name, count: counts[name] }))
      .sort((a, b) => b.count - a.count);
    return res.json({ categories, fallback: true });
  });

  // 要約（video_minutes）の状態
  app.get("/api/admin/archive/minutes/:id", adminAuth.requireAuth, async (req, res) => {
    const id = String(req.params.id || "");
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: "invalid video_id" });
    if (!ctx.db) return res.status(503).json({ error: "db unavailable" });
    ctx.db.all(
      `SELECT start_ms, end_ms, topic, summary, created_at
       FROM video_minutes WHERE video_id=? ORDER BY start_ms ASC LIMIT 400`,
      [id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: "db error" });
        return res.json({
          video_id: id,
          count: (rows || []).length,
          segments: (rows || []).map((r) => ({
            start_ms: r.start_ms,
            end_ms: r.end_ms,
            topic: r.topic || "",
            summary: r.summary || "",
            created_at: r.created_at || "",
          })),
        });
      }
    );
  });

  // 1本の要約を手動生成（cron の flock と同じロックを使い、実行中ならスキップ）
  app.post("/api/admin/archive/minutes/:id", adminAuth.requireAuth, async (req, res) => {
    const id = String(req.params.id || "");
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: "invalid video_id" });
    if (process.env.NODE_ENV === "development") {
      return res.status(501).json({ error: "staging では要約生成を実行しません" });
    }
    const script = path.join(__dirname, "..", "scripts", "minutes-gen.js");
    const lock = "/tmp/minutes-gen.lock";
    // flock -w 0 <lock> <node> <script> <id> --embed
    execFile(
      "flock",
      ["-w", "0", lock, process.execPath, script, id, "--embed"],
      { cwd: path.join(__dirname, ".."), timeout: 15000 },
      (err, _stdout) => {
        if (err) {
          if (err.code === 1) return res.json({ started: false, reason: "minutes-gen が実行中のためスキップしました" });
          return res.status(500).json({ error: "要約生成を起動できませんでした", detail: String((err && err.message) || err) });
        }
        return res.json({ started: true, video_id: id });
      }
    );
  });
}

module.exports = { register };