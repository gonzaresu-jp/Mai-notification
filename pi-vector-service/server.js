// pi-vector-service - 32bit Raspberry Pi でも動く超軽量ベクトルDB
// 依存ゼロ（Node標準のみ）。SQLite/ネイティブ拡張/Docker 不要。
// ベクトルはメモリ保持＋JSONLでディスク永続化、検索は総当たりcosine。
// 通知/予定の規模（数千〜数万件）なら検索は数〜数十ms。
//
// 起動: PORT=6333 API_KEY=xxx DATA_FILE=./data/vectors.jsonl node server.js
// 母艦からは VECTOR_DB_BACKEND=simple / VECTOR_DB_URL=http://<pi>:6333 / VECTOR_DB_API_KEY=xxx で接続。

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || "6333", 10);
const API_KEY = process.env.API_KEY || null;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "vectors.jsonl");

// collections[name] = { dim, points: Map<id, {vector:number[], norm:number, payload:object}> }
const collections = new Map();

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function norm(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  return Math.sqrt(s) || 1;
}

function getColl(name) {
  if (!collections.has(name)) collections.set(name, { dim: null, points: new Map() });
  return collections.get(name);
}

function applyPoint(name, p) {
  const c = getColl(name);
  c.points.set(p.id, { vector: p.vector, norm: norm(p.vector), payload: p.payload || {} });
}

// 起動時: JSONLを読み込み（同一idは後勝ち）→ そのままコンパクトに書き戻す
function loadAndCompact() {
  ensureDir(DATA_FILE);
  if (fs.existsSync(DATA_FILE)) {
    const lines = fs.readFileSync(DATA_FILE, "utf8").split("\n");
    let loaded = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.collection && rec.id != null && Array.isArray(rec.vector)) {
          const c = getColl(rec.collection);
          if (c.dim == null) c.dim = rec.vector.length;
          applyPoint(rec.collection, rec);
          loaded++;
        }
      } catch { /* 壊れた行はスキップ */ }
    }
    // コンパクション（最新状態のみで書き直し）
    const out = [];
    for (const [name, c] of collections) {
      for (const [id, pt] of c.points) {
        out.push(JSON.stringify({ collection: name, id, vector: pt.vector, payload: pt.payload }));
      }
    }
    fs.writeFileSync(DATA_FILE, out.length ? out.join("\n") + "\n" : "");
    console.log(`[pi-vector] loaded ${loaded} points, compacted to ${out.length}`);
  }
}

function appendPoints(name, points) {
  const out = points.map(p => JSON.stringify({ collection: name, id: p.id, vector: p.vector, payload: p.payload || {} }));
  fs.appendFileSync(DATA_FILE, out.join("\n") + "\n");
}

function search(name, vector, topK, filter) {
  const c = collections.get(name);
  if (!c) return [];
  const qn = norm(vector);
  const src = filter && filter.source ? String(filter.source) : null;
  const heap = [];
  for (const [id, pt] of c.points) {
    if (src && pt.payload.source !== src) continue;
    let dot = 0;
    const v = pt.vector;
    const len = Math.min(v.length, vector.length);
    for (let i = 0; i < len; i++) dot += v[i] * vector[i];
    const score = dot / (qn * pt.norm);
    heap.push({ id, score, payload: pt.payload });
  }
  heap.sort((a, b) => b.score - a.score);
  return heap.slice(0, topK);
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 64 * 1024 * 1024) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // 認証（/health 以外）
    if (req.url !== "/health" && API_KEY) {
      const key = req.headers["x-api-key"];
      if (key !== API_KEY) return sendJson(res, 401, { error: "unauthorized" });
    }

    const u = new URL(req.url, "http://localhost");

    if (req.method === "GET" && u.pathname === "/health") {
      let total = 0;
      for (const c of collections.values()) total += c.points.size;
      return sendJson(res, 200, { status: "ok", collections: collections.size, points: total });
    }

    // コレクション作成/確認: POST /collections/:name { dim }
    if (req.method === "POST" && u.pathname.startsWith("/collections/")) {
      const name = decodeURIComponent(u.pathname.slice("/collections/".length));
      const body = await readBody(req);
      const c = getColl(name);
      if (c.dim == null && body.dim) c.dim = body.dim;
      return sendJson(res, 200, { ok: true, collection: name, dim: c.dim, count: c.points.size });
    }

    // upsert: PUT /points { collection, points:[{id,vector,payload}] }
    if (req.method === "PUT" && u.pathname === "/points") {
      const body = await readBody(req);
      const name = body.collection || "default";
      const points = Array.isArray(body.points) ? body.points : [];
      const c = getColl(name);
      for (const p of points) { if (c.dim == null && Array.isArray(p.vector)) c.dim = p.vector.length; applyPoint(name, p); }
      if (points.length) appendPoints(name, points);
      return sendJson(res, 200, { ok: true, upserted: points.length });
    }

    // search: POST /search { collection, vector, topK, filter }
    if (req.method === "POST" && u.pathname === "/search") {
      const body = await readBody(req);
      const name = body.collection || "default";
      const topK = Math.min(100, Math.max(1, parseInt(body.topK, 10) || 5));
      if (!Array.isArray(body.vector)) return sendJson(res, 400, { error: "vector required" });
      const result = search(name, body.vector, topK, body.filter || null);
      return sendJson(res, 200, { result });
    }

    sendJson(res, 404, { error: "not found" });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

loadAndCompact();
server.listen(PORT, "0.0.0.0", () => console.log(`[pi-vector] listening on :${PORT} (data: ${DATA_FILE})`));
