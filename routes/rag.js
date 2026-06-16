// rag.js - ベクトル検索(/api/search) と RAG Q&A(/api/ask)
// 既存の回答用 llama-server(:8081, Gemma) を流用して、Piのベクトル検索結果を根拠に回答する。
// VECTOR_DB_URL / EMBEDDING_ENDPOINT 未設定時は 503 を返す（機能オフ）。

const fetch = require("node-fetch");
const embeddings = require("../services/embeddings");
const vectordb = require("../services/vectordb");

// RAG回答用は専用に上書き可能（ツイート分析用 Gemma(:8081) と分離するため）。
// 例: RAG_CHAT_ENDPOINT=http://localhost:11434/v1/chat/completions RAG_CHAT_MODEL=qwen2.5:3b
const CHAT_ENDPOINT = process.env.RAG_CHAT_ENDPOINT || process.env.LLAMA_SERVER_ENDPOINT || "http://localhost:8081/v1/chat/completions";
const CHAT_MODEL = process.env.RAG_CHAT_MODEL || process.env.LLAMA_CHAT_MODEL || "gemma-4-E4B-it-Q3_K_M";
const ASK_TOPK = parseInt(process.env.RAG_TOPK || "6", 10);
const CHAT_TIMEOUT_MS = parseInt(process.env.RAG_CHAT_TIMEOUT_MS || "120000", 10);
const CHAT_MAX_TOKENS = parseInt(process.env.RAG_MAX_TOKENS || "384", 10);

function ready() {
  return vectordb.isEnabled() && embeddings.isEnabled();
}

const PERIOD_LABELS = { MORNING: "朝", NOON: "昼", EVENING: "夕方", NIGHT: "夜", LATE_NIGHT: "深夜" };

// 現在時刻を naive JST 文字列 "YYYY-MM-DDTHH:MM:SS" で返す（TZ=Asia/Tokyo前提）
function nowJst() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// DBから「今後の配信予定」を時間順で取得（ベクトル検索では未来/過去を区別できないため直接SQL）
function getUpcomingEvents(db, nowStr, limit) {
  return new Promise((resolve) => {
    db.all(
      `SELECT title, start_time, platform, time_period, url, event_type FROM events
       WHERE start_time IS NOT NULL AND status != 'cancelled' AND event_type != 'memo' AND start_time >= ?
       ORDER BY start_time ASC LIMIT ?`,
      [nowStr, limit],
      (err, rows) => resolve(err ? [] : (rows || []))
    );
  });
}

function fmtUpcoming(e) {
  const datePart = String(e.start_time || "").slice(0, 10);
  const when = e.time_period ? `${datePart} ${PERIOD_LABELS[e.time_period] || ""}ごろ` : String(e.start_time || "").replace("T", " ");
  return `- ${e.title || "配信予定"}（${when}${e.platform ? "/" + e.platform : ""}）${e.url || ""}`;
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
      body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0.2, max_tokens: CHAT_MAX_TOKENS, extra_body: { think: false } }),
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

  // --- RAG Q&A 本体（公開/管理共通） ---
  async function handleAsk(req, res) {
    if (!ready()) return res.status(503).json({ error: "RAG not configured" });
    const question = (req.body?.question || req.body?.q || "").toString().trim();
    if (!question) return res.status(400).json({ error: "question required" });
    try {
      const nowStr = nowJst();
      const [vec, upcoming] = await Promise.all([
        embeddings.embedQuery(question),
        getUpcomingEvents(db, nowStr, 5),
      ]);
      const hits = await vectordb.search(vec, ASK_TOPK);
      const hitLines = hits.map((h, i) => `${i + 1}. ${sourceLine(h)}`).join("\n");
      const upLines = upcoming.length ? upcoming.map(fmtUpcoming).join("\n") : "(登録されている今後の予定はありません)";

      const messages = [
        {
          role: "system",
          content:
            "あなたはVTuber「恋乃夜まい」の情報アシスタントです。日本語で、前置き・思考過程・引用番号は書かず結論から簡潔に答えてください。" +
            "「次の配信」「今後の予定」を聞かれたら必ず『今後の配信予定』欄のみを根拠にし、『過去の通知・ツイート』を未来の予定として答えないこと。" +
            "「どんな人/どんな子/性格/雰囲気」など人物像の質問は、過去のツイート・通知から読み取れる範囲で要約してよい。" +
            "日時・数値・固有名などの事実は与えられた情報にあるものだけを使い、無い情報は創作しないこと。本当に手がかりが無いときだけ「わかりません」と答える。",
        },
        {
          role: "user",
          content:
            `現在日時: ${nowStr}（JST）\n\n` +
            `■ 今後の配信予定（時間順）:\n${upLines}\n\n` +
            `■ 関連する過去の通知・ツイート:\n${hitLines || "(なし)"}\n\n` +
            `質問: ${question}`,
        },
      ];

      const answer = await chat(messages);
      res.json({
        question,
        answer,
        upcoming: upcoming.map(e => ({ title: e.title, start_time: e.start_time, time_period: e.time_period, url: e.url })),
        sources: hits.map(h => ({ score: h.score, source: h.payload?.source, title: h.payload?.title, url: h.payload?.url })),
      });
    } catch (e) {
      console.error("[/api/ask] error:", e?.message);
      res.status(500).json({ error: e.message });
    }
  }

  // 管理者専用（管理画面のチャットUI用・認証必須）
  const adminAuth = require("../admin/admin");
  app.post("/api/admin/ask", adminAuth.requireAuth, handleAsk);

  // 公開（後方互換・必要なら削除可）
  app.post("/api/ask", handleAsk);
}

module.exports = { register };
