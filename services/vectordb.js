// vectordb.js - ベクトルDBクライアント（バックエンド切替）
//   VECTOR_DB_BACKEND=qdrant : Pi(64bit)上の Qdrant (REST :6333)
//   VECTOR_DB_BACKEND=simple : Pi(32bit可)上の pi-vector-service (依存ゼロNode)
// どちらも母艦からは VECTOR_DB_URL / VECTOR_DB_API_KEY で接続。
// VECTOR_DB_URL 未設定なら isEnabled()=false（同期・検索とも無効化、既存機能に影響なし）。

const fetch = require("node-fetch");

const BACKEND = (process.env.VECTOR_DB_BACKEND || "qdrant").toLowerCase();
const BASE_URL = (process.env.VECTOR_DB_URL || "").replace(/\/+$/, "");
const COLLECTION = process.env.VECTOR_DB_COLLECTION || "mai";
const API_KEY = process.env.VECTOR_DB_API_KEY || null;
const TIMEOUT_MS = parseInt(process.env.VECTOR_DB_TIMEOUT_MS || "15000", 10);

function isEnabled() {
  return !!BASE_URL;
}

async function call(method, pathSuffix, body, authHeaderName) {
  if (!BASE_URL) throw new Error("VECTOR_DB_URL not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = { "Content-Type": "application/json" };
    if (API_KEY) headers[authHeaderName] = API_KEY;
    const res = await fetch(`${BASE_URL}${pathSuffix}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`vectordb ${method} ${pathSuffix} -> ${res.status}: ${text.slice(0, 200)}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ── Qdrant バックエンド ──────────────────────────────
const qdrant = {
  async ensureCollection(dim) {
    try { await call("GET", `/collections/${COLLECTION}`, null, "api-key"); return; }
    catch { /* 無ければ作成 */ }
    await call("PUT", `/collections/${COLLECTION}`, { vectors: { size: dim, distance: "Cosine" } }, "api-key");
    console.log(`[vectordb:qdrant] collection created: ${COLLECTION} (dim=${dim})`);
  },
  async upsert(points) {
    if (!points || points.length === 0) return;
    await call("PUT", `/collections/${COLLECTION}/points?wait=true`, { points }, "api-key");
  },
  async search(vector, topK, filter) {
    const body = { vector, limit: topK, with_payload: true };
    if (filter) body.filter = filter;
    const res = await call("POST", `/collections/${COLLECTION}/points/search`, body, "api-key");
    return res?.result || [];
  },
};

// ── simple バックエンド（pi-vector-service） ──────────
// filter は {source:'notifications'} 形式に変換して渡す
function toSimpleFilter(qdrantFilter) {
  const m = qdrantFilter?.must?.find(x => x.key === "source");
  return m ? { source: m.match.value } : null;
}
const simple = {
  async ensureCollection(dim) {
    await call("POST", `/collections/${encodeURIComponent(COLLECTION)}`, { dim }, "x-api-key");
  },
  async upsert(points) {
    if (!points || points.length === 0) return;
    await call("PUT", `/points`, { collection: COLLECTION, points }, "x-api-key");
  },
  async search(vector, topK, filter) {
    const res = await call("POST", `/search`, { collection: COLLECTION, vector, topK, filter: toSimpleFilter(filter) }, "x-api-key");
    return res?.result || [];
  },
};

const impl = BACKEND === "simple" ? simple : qdrant;

module.exports = {
  isEnabled,
  ensureCollection: (dim) => impl.ensureCollection(dim),
  upsert: (points) => impl.upsert(points),
  search: (vector, topK = 5, filter = null) => impl.search(vector, topK, filter),
  COLLECTION,
  BACKEND,
};
