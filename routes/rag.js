// rag.js - ベクトル検索(/api/search) と RAG Q&A(/api/ask)
// 既存の回答用 llama-server(:8081, Gemma) を流用して、Piのベクトル検索結果を根拠に回答する。
// VECTOR_DB_URL / EMBEDDING_ENDPOINT 未設定時は 503 を返す（機能オフ）。

const fetch = require("node-fetch");
const embeddings = require("../services/embeddings");
const vectordb = require("../services/vectordb");

const CHAT_ENDPOINT = process.env.LLAMA_SERVER_ENDPOINT || "http://localhost:8081/v1/chat/completions";
const CHAT_MODEL = process.env.LLAMA_CHAT_MODEL || "gemma-4-E4B-it-Q3_K_M";
const ASK_TOPK = parseInt(process.env.RAG_TOPK || "6", 10);
const CHAT_TIMEOUT_MS = parseInt(process.env.RAG_CHAT_TIMEOUT_MS || "60000", 10);

function ready() {
  return vectordb.isEnabled() && embeddings.isEnabled();
}

// 検索結果ペイロード → 表示/コンテキスト用の1行テキスト
function sourceLine(hit) {
  const p = hit.payload || {};
  if (p.source === "events") {
    return `[予定] ${p.title || ""}${p.start_time ? `（${p.start_time}）` : ""}${p.url ? ` ${p.url}` : ""}`;
  }
  return `[${p.platform || "通知"}] ${p.title || ""}${p.body ? `: ${p.body}` : ""}${p.url ? ` ${p.url}` : ""}`;
}

async function chat(messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0.2, extra_body: { think: false } }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Chat server ${res.status}`);
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

function register(app, db) {
  // --- セマンティック検索 ---
  // GET /api/search?q=...&k=10&source=notifications|events
  app.get("/api/search", async (req, res) => {
    if (!ready()) return res.status(503).json({ error: "vector search not configured" });
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ error: "q required" });
    const k = Math.min(50, Math.max(1, parseInt(req.query.k, 10) || 10));
    const source = req.query.source ? String(req.query.source) : null;
    const filter = source ? { must: [{ key: "source", match: { value: source } }] } : null;
    try {
      const vec = await embeddings.embedQuery(q);
      const hits = await vectordb.search(vec, k, filter);
      res.json({
        query: q,
        results: hits.map(h => ({ score: h.score, source: h.payload?.source, ...h.payload })),
      });
    } catch (e) {
      console.error("[/api/search] error:", e?.message);
      res.status(500).json({ error: e.message });
    }
  });

  // --- RAG Q&A ---
  // POST /api/ask { question: "次の配信いつ？" }
  app.post("/api/ask", async (req, res) => {
    if (!ready()) return res.status(503).json({ error: "RAG not configured" });
    const question = (req.body?.question || req.body?.q || "").toString().trim();
    if (!question) return res.status(400).json({ error: "question required" });
    try {
      const vec = await embeddings.embedQuery(question);
      const hits = await vectordb.search(vec, ASK_TOPK);
      const context = hits.map((h, i) => `${i + 1}. ${sourceLine(h)}`).join("\n");

      const messages = [
        {
          role: "system",
          content:
            "あなたはVTuber「恋乃夜まい」の情報アシスタントです。" +
            "以下のコンテキスト（過去の通知・ツイート・配信予定）だけを根拠に、日本語で簡潔に答えてください。" +
            "コンテキストに無いことは推測せず「わかりません」と答えてください。",
        },
        { role: "user", content: `コンテキスト:\n${context || "(該当なし)"}\n\n質問: ${question}` },
      ];

      const answer = await chat(messages);
      res.json({
        question,
        answer,
        sources: hits.map(h => ({ score: h.score, source: h.payload?.source, title: h.payload?.title, url: h.payload?.url })),
      });
    } catch (e) {
      console.error("[/api/ask] error:", e?.message);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { register };
