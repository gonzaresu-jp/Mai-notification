// embeddings.js - テキスト埋め込み生成クライアント
// OpenAI互換の /v1/embeddings エンドポイント（llama.cpp の --embedding サーバ等）を叩く。
// 既存の回答用 llama-server(:8081, Gemma) とは別に、埋め込み専用モデルを立てる想定。
//   例: llama-server --embedding -m multilingual-e5-small.gguf --port 8082
//
// 設定が無ければ isEnabled()=false となり、呼び出し側で無効化される（既存機能に影響なし）。

const fetch = require("node-fetch");

const ENDPOINT = process.env.EMBEDDING_ENDPOINT || "http://localhost:8082/v1/embeddings";
const MODEL = process.env.EMBEDDING_MODEL || "multilingual-e5-small";
const DIM = parseInt(process.env.EMBEDDING_DIM || "384", 10);
const TIMEOUT_MS = parseInt(process.env.EMBEDDING_TIMEOUT_MS || "30000", 10);
// e5 系モデルは "query: " / "passage: " 接頭辞で精度が上がる。モデルに合わせて空にも変更可。
const QUERY_PREFIX = process.env.EMBEDDING_QUERY_PREFIX ?? "query: ";
const DOC_PREFIX = process.env.EMBEDDING_DOC_PREFIX ?? "passage: ";

function isEnabled() {
  return !!ENDPOINT;
}

function getDim() {
  return DIM;
}

/**
 * 複数テキストの埋め込みをまとめて取得する。
 * @param {string[]} texts
 * @param {"query"|"doc"} kind 接頭辞の種類
 * @returns {Promise<number[][]>} 埋め込みベクトルの配列（入力順）
 */
async function embed(texts, kind = "doc") {
  const list = (Array.isArray(texts) ? texts : [texts]).map(t => String(t == null ? "" : t));
  if (list.length === 0) return [];
  const prefix = kind === "query" ? QUERY_PREFIX : DOC_PREFIX;
  const input = list.map(t => `${prefix}${t}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Embedding server ${res.status}`);
    const data = await res.json();
    // OpenAI互換: { data: [{ embedding: [...] }, ...] }
    const out = (data?.data || []).map(d => d.embedding);
    if (out.length !== list.length) throw new Error(`embedding count mismatch: got ${out.length} for ${list.length}`);
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/** 単一テキストの埋め込み（クエリ用） */
async function embedQuery(text) {
  const [v] = await embed([text], "query");
  return v;
}

module.exports = { isEnabled, getDim, embed, embedQuery, ENDPOINT, MODEL };
