// rag.js - ベクトル検索(/api/search) と RAG Q&A(/api/ask)
// RAG_CHAT_ENDPOINT(Ollama等) を流用して、Piのベクトル検索結果とYT配信字幕を根拠に、まいの口調で回答する。
// VECTOR_DB_URL / EMBEDDING_ENDPOINT 未設定時は 503 を返す（機能オフ）。

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const embeddings = require("../services/embeddings");
const vectordb = require("../services/vectordb");

const KNOWLEDGE_FILE = process.env.KNOWLEDGE_FILE || path.join(__dirname, "..", "rag-knowledge.json");
function loadKnowledge() {
  try { const d = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, "utf8")); return Array.isArray(d) ? d : []; }
  catch { return []; }
}

// RAG回答用は専用に上書き可能（ツイート分析用 Gemma(:8081) と分離するため）。
// 例: RAG_CHAT_ENDPOINT=http://localhost:11434/v1/chat/completions RAG_CHAT_MODEL=qwen2.5:3b
const CHAT_ENDPOINT = process.env.RAG_CHAT_ENDPOINT || process.env.LLAMA_SERVER_ENDPOINT || "http://localhost:8081/v1/chat/completions";
const CHAT_MODEL = process.env.RAG_CHAT_MODEL || process.env.LLAMA_CHAT_MODEL || "gemma-4-E4B-it-Q3_K_M";
const CHAT_PROVIDER = (process.env.RAG_CHAT_PROVIDER || "ollama").toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ASK_TOPK = parseInt(process.env.RAG_TOPK || "6", 10);
const CHAT_TIMEOUT_MS = parseInt(process.env.RAG_CHAT_TIMEOUT_MS || "120000", 10);
const CHAT_MAX_TOKENS = parseInt(process.env.RAG_MAX_TOKENS || "384", 10);
// R18モード用のバックエンド（管理者専用）。Geminiは規約上NGなのでGroq(オープンウェイト)へ切り替える。
// 議事録生成と同じ MINUTES_* 設定を流用する。
const GROQ_CHAT_ENDPOINT = process.env.MINUTES_API_URL || "";
const GROQ_CHAT_API_KEY = process.env.MINUTES_API_KEY || "";
const GROQ_CHAT_MODEL = process.env.MINUTES_MODEL || "";
// qwen/qwen3.8-27b の無料枠は OTPM(分間出力) 1000 上限のため、Groq向けは max_tokens を抑える
const GROQ_CHAT_MAX_TOKENS = parseInt(process.env.RAG_GROQ_MAX_TOKENS || "700", 10);
// 議事録ヒットから親字幕を引用する際の最低スコア（無関係な議事録引用ノイズを減らす）
// bge-m3 の実測で良質マッチ ~0.60、ノイズ 0.55〜0.60 なので 0.58 に設定
const MINUTES_PARENT_MIN_SCORE = parseFloat(process.env.RAG_MINUTES_MIN_SCORE || "0.58");

// YT配信字幕(FTS on .70)を質問時に参照して文脈へ注入する
const ARCHIVE_API_BASE = (process.env.ARCHIVE_API_BASE || "http://192.168.1.70:8766").replace(/\/+$/, "");
const TRANSCRIPT_ENABLED = process.env.RAG_TRANSCRIPT_ENABLED !== "0";
const TRANSCRIPT_TOPK = parseInt(process.env.RAG_TRANSCRIPT_TOPK || "6", 10);
const TRANSCRIPT_TIMEOUT_MS = parseInt(process.env.RAG_TRANSCRIPT_TIMEOUT_MS || "8000", 10);
const EXPAND_ENABLED = process.env.RAG_TRANSCRIPT_EXPAND !== "0";

const KANJI = /[\u4e00-\u9fff]/;
const KATAKANA = /[\u30a0-\u30ff]/;
const STOP_WORDS = new Set(["まいちゃん", "恋乃夜まい", "まい", "アシスタント", "配信"]);
const HIRAGANA_STOP = new Set([
  "です", "ます", "でした", "ました", "ですね", "ですよ", "ですけど", "だから",
  "これ", "それ", "あれ", "この", "その", "あの", "どこ", "だれ", "なに", "なん",
  "なんか", "なんて", "とか", "まで", "だけ", "でも", "では", "みたい", "って",
  "っていう", "してた", "して", "してる", "けれど", "ない", "ました", "ください", "どん",
  "した", "してます", "してき", "してるん", "してて", "してたん", "してん", "してくれ",
  "なって", "なった", "みて", "みてる", "みてた", "いって", "やって", "やってる", "やってた",
  "する", "したっ", "しちゃって", "しん", "してました", "でした",
  "について", "に関して", "として", "なので", "なので", "それで", "だから", "どうやって",
]);
const PARTICLE = /[はがをにのへとでやもかねよだたらけどなどだけで]/;
const FILLER_RE = /(教えて|知りたい|どういう|どうやって|どうして|なんで|なんて|について|ください|知ってる|どんな|なんですか|ですか|とか)/g;

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

const pad2 = n => String(n).padStart(2, "0");

// 「最古/最新/特定日付/年月」の質問を検出し、notifications から該当ツイートを直接取得する。
// （ベクトル検索は時系列・厳密一致に弱いため）。created_at はUTC保存なので +9h で JST 判定。
function getTemporalTweets(db, q) {
  return new Promise((resolve) => {
    const base =
      "SELECT id, datetime(created_at,'+9 hours') jst, substr(body,1,200) body, tweet_id " +
      "FROM notifications WHERE (platform LIKE '%twitter%' OR title LIKE '%ツイート%')";
    let sql = null, params = [], label = null;
    const md = q.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/);
    const ym = q.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*月?/);
    if (/最も古い|一番古い|いちばん古い|最初|最古/.test(q)) {
      sql = base + " ORDER BY created_at ASC LIMIT 5"; label = "最も古いツイート";
    } else if (/最新|最近|直近|一番新しい|いちばん新しい/.test(q)) {
      sql = base + " ORDER BY created_at DESC LIMIT 5"; label = "最新のツイート";
    } else if (md) {
      const d = `${md[1]}-${pad2(md[2])}-${pad2(md[3])}`;
      sql = base + " AND date(created_at,'+9 hours')=? ORDER BY created_at ASC LIMIT 10"; params = [d]; label = `${d} のツイート`;
    } else if (ym) {
      const m = `${ym[1]}-${pad2(ym[2])}`;
      sql = base + " AND strftime('%Y-%m',created_at,'+9 hours')=? ORDER BY created_at ASC LIMIT 10"; params = [m]; label = `${m} のツイート`;
    } else {
      return resolve(null);
    }
    db.all(sql, params, (err, rows) => resolve(err ? null : { label, rows: rows || [] }));
  });
}

function fmtTweet(r) {
  const url = r.tweet_id ? ` https://x.com/koinoya_mai/status/${r.tweet_id}` : "";
  return `- ${r.jst} JST: ${(r.body || "").replace(/\s+/g, " ").trim()}${url}`;
}

// 最近のツイートを「まいの文体・口調の手本」として取得する
function getRecentTweets(db, limit) {
  return new Promise((resolve) => {
    db.all(
      `SELECT datetime(created_at,'+9 hours') jst, body FROM notifications
       WHERE (platform LIKE '%twitter%' OR title LIKE '%ツイート%')
         AND body IS NOT NULL AND length(body) BETWEEN 8 AND 220
       ORDER BY created_at DESC LIMIT ?`,
      [limit],
      (err, rows) => resolve(err ? [] : (rows || []))
    );
  });
}

function fmtUpcoming(e) {
  const datePart = String(e.start_time || "").slice(0, 10);
  const when = e.time_period ? `${datePart} ${PERIOD_LABELS[e.time_period] || ""}ごろ` : String(e.start_time || "").replace("T", " ");
  return `- ${e.title || "配信予定"}（${when}${e.platform ? "/" + e.platform : ""}）${e.url || ""}`;
}

// 質問文から字幕検索用のキーワードを抽出する（.70のFTSは文章のままではヒットしないため）
function contentScore(s) {
  let n = 0;
  for (const ch of s) if (KANJI.test(ch) || KATAKANA.test(ch) || /[A-Za-z0-9]/.test(ch)) n++;
  return n;
}

function splitFragments(seg) {
  const parts = [];
  for (const m of seg.matchAll(/[\u4e00-\u9fff]+|[\u3040-\u30ff]+/g)) {
    if (m[0]) parts.push(m[0]);
  }
  return parts;
}

// かな連続の先頭/末尾の助詞を取り除いた名詞候補を作る（ぶいすぽの→ぶいすぽ）
function stripParticles(t) {
  return t
    .replace(/^[はがをにのへとでやもかねよだがらけ]+/, "")
    .replace(/[はがをにのへとでやもかねよだがらけ]+$/, "");
}

function buildTranscriptQuery(question) {
  const s0 = String(question || "")
    .replace(/\s+/g, " ")
    .replace(/[?!？！。、」』「『（）()・：:〜~]+/g, " ")
    .replace(FILLER_RE, " ");
  const tokens = new Map();
  const add = (t) => {
    t = String(t || "").trim();
    if (t.length < 2) return;
    if (!(KANJI.test(t) || KATAKANA.test(t) || /[\u3040-\u309f]/.test(t))) return;
    if (STOP_WORDS.has(t) || HIRAGANA_STOP.has(t)) return;
    if (!tokens.has(t)) tokens.set(t, contentScore(t));
    if (!KANJI.test(t)) {
      const s = stripParticles(t);
      if (s.length >= 2 && s !== t && !HIRAGANA_STOP.has(s) && !tokens.has(s)) tokens.set(s, contentScore(s) - 1);
    }
  };
  for (const seg of s0.split(/\s+/).filter(Boolean)) {
    if (seg.length <= 6) add(seg);
    const stripped = seg.replace(/[\u3040-\u309f]+$/, "");
    if (stripped !== seg && stripped.length <= 6) add(stripped);
    for (const frag of splitFragments(seg)) {
      if (frag.length <= 6) add(frag);
      else add(frag.slice(0, 4));
      const runs = frag.match(/[\u3400-\u9fff]{2,4}/g) || [];
      for (const r of runs) add(r);
    }
  }
  const out = [...tokens.entries()]
    .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length))
    .map(([t]) => t);
  return out.slice(0, 8);
}

function candidateQueries(question) {
  const toks = buildTranscriptQuery(question);
  const qs = [];
  for (let n = Math.min(3, toks.length); n >= 1; n--) {
    const j = toks.slice(0, n).join(" ");
    if (j) qs.push(j);
  }
  const orig = String(question || "").trim();
  if (orig && qs.indexOf(orig) === -1) qs.push(orig);
  return qs;
}

async function fetchTranscriptOnce(q) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIPT_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ q, kind: "transcript", limit: String(TRANSCRIPT_TOPK) });
    const res = await fetch(`${ARCHIVE_API_BASE}/api/search?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`archive search ${res.status}`);
    const data = await res.json();
    return { hits: Array.isArray(data?.transcript) ? data.transcript.slice(0, TRANSCRIPT_TOPK) : [] };
  } catch (e) {
    console.warn("[rag] transcript search failed:", e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 質問から検索キーワードを意味的に広げる（LLM）。人名・話題に加え、「感想/人間関係」を問う質問なら
// 心情や関係を表す語（好き・尊敬・仲良し・コラボ等）まで出してもらうことで、単語一致FTSの盲点を補う。
async function expandQueryKeywords(question) {
  if (!TRANSCRIPT_ENABLED || !EXPAND_ENABLED) return [];
  try {
    const txt = await chat([
      {
        role: "system",
        content:
          "あなたは動画の文字起こし検索のためのキーワード抽出器です。質問から、そのまま検索に使える語のみを返します。説明・接続詞・定型文は一切出力しません。",
      },
      {
        role: "user",
        content:
          `質問: ${question}\n\n出力ルール:\n` +
          `- 人名・団体名は呼び方の違い（「◯◯」「◯◯さん」「◯◯ちゃん」）も両方入れてよい\n` +
          `- 質問が「〜をどう思っている?」「〜との関係」「仲良し?」「どんな人?」のように意見・人間関係を問う場合は、心情や関係を表す単語（好き、大好き、尊敬、仲良し、コラボ、推し、苦手、嫌い、怖い、甘え、お姉さん など）も入れてよい\n` +
          `- 最多8個。空白区切りの1行だけ出力。`,
      },
    ]);
    const words = (txt || "")
      .replace(/[、]/g, " ")
      .replace(/["'「」]/g, "")
      .split(/[\s\n]+/)
      .map(w => w.trim())
      .filter(w => {
        if (w.length < 2 || w.length > 24) return false;
        return /[\u4e00-\u9fff\u30a0-\u30ff\u3040-\u309fA-Za-z0-9]/.test(w);
      });
    return [...new Set(words)].slice(0, 6);
  } catch (e) {
    console.warn("[rag] keyword expansion failed:", e?.message || e);
    return [];
  }
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  na = Math.sqrt(na); nb = Math.sqrt(nb);
  return na && nb ? dot / (na * nb) : 0;
}

async function fetchTranscriptHits(question, questionVec) {
  if (!TRANSCRIPT_ENABLED) return { query: "", hits: [], neural: false };
  const baseQs = candidateQueries(question);
  const llmKw = await expandQueryKeywords(question);
  const qs = [...baseQs, ...llmKw]
    .map(q => String(q || "").trim())
    .filter(Boolean)
    .filter((q, i, arr) => arr.indexOf(q) === i)
    .slice(0, 10);
  const results = await Promise.all(qs.map(q => fetchTranscriptOnce(q)));
  if (results.some(r => r === null)) return { query: "", hits: [], neural: false };
  const toks = buildTranscriptQuery(question);
  const seen = new Map();
  for (let i = 0; i < qs.length; i++) {
    for (const h of (results[i] || { hits: [] }).hits) {
      if (!h || !(h.text || h.snippet)) continue;
      const key = `${h.video_id || ""}|${h.start_ms || h.start || ""}`;
      if (!seen.has(key)) seen.set(key, h);
    }
  }
  const candidates = [...seen.values()].slice(0, 80);
  if (candidates.length === 0) return { query: qs[0] || "", hits: [], neural: false, keywords: llmKw };

  // --- 第2段階: 候補を埋め込み、質問との意味的類似度で再ランク（ニューラル再ランキング） ---
  let scored = candidates.map(h => ({ h, cos: 0 }));
  if (questionVec && embeddings.isEnabled()) {
    try {
      const texts = candidates.map(h => ((h.text || h.snippet) || "").replace(/\s+/g, " ").trim());
      const vecs = await embeddings.embed(texts, "doc");
      scored = candidates.map((h, i) => ({ h, cos: cosine(questionVec, vecs[i] || []) }));
    } catch (e) {
      console.warn("[rag] neural rerank failed:", e?.message || e);
    }
  }
  const merged = scored
    .map(x => ({ ...x, rel: relevanceFor(x.h, toks) }))
    .sort((a, b) => {
      const sa = a.cos + Math.min(0.25, a.rel * 0.02);
      const sb = b.cos + Math.min(0.25, b.rel * 0.02);
      return sb - sa || (b.h.stream_date_jst || "").localeCompare(a.h.stream_date_jst || "");
    })
    .map(x => x.h);
  return { query: qs[0] || "", hits: merged.slice(0, TRANSCRIPT_TOPK), neural: true, keywords: llmKw };
}

// 全候補クエリとの語彙の一致度で、FTSヒットの中から質問に関連するセグメントを再ランクする
// 先頭のトークンほど高スコア（contentScore順）、動詞的トークン（〜して・〜てた等）は弱くする
function relevanceFor(h, toks) {
  const text = (((h.text || "") + " " + (h.snippet || "")).replace(/\s+/g, "")).toLowerCase();
  let s = 0;
  toks.forEach((t, i) => {
    if (!text.includes(t)) return;
    if (/(てた|して|してる|しなく|ないき|ないし|てんの)$/.test(t)) return;
    s += (toks.length - i) * Math.min(t.length, 6);
  });
  return s;
}

function fmtTranscript(h) {
  const text = (h.text || "").replace(/\s+/g, " ").trim();
  const title = (h.title || "").replace(/\s+/g, " ").trim();
  const clip = (s, max) => {
    if (s.length <= max) return s;
    let cut = s.slice(0, max);
    const stop = [cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"), cut.lastIndexOf("…"), cut.lastIndexOf("、"), cut.lastIndexOf(",")].filter(i => i >= max * 0.4);
    if (stop.length) cut = s.slice(0, Math.max(...stop) + 1);
    else {
      const sp = cut.lastIndexOf(" ");
      if (sp >= max * 0.4) cut = cut.slice(0, sp);
    }
    return cut.replace(/\s+$/, "") + "…";
  };
  const t = clip(text, 300);
  const ti = clip(title, 40);
  return `- [${h.stream_date_jst || ""} | ${ti}] (${h.start || ""}) ${t} ${h.url || ""}`;
}

// minutes(配信議事録)ヒットに対応する生字幕セグメントを取得する（parent-document引用）
// minutes.payload には video_id / start_ms / end_ms（引用元の5分チャンク範囲）が入っている
async function fetchParentTranscripts(minuteHits, limit) {
  if (!minuteHits.length) return [];
  const out = [];
  const seen = new Set();
  for (const h of minuteHits.slice(0, limit)) {
    const p = h.payload || {};
    const vid = p.video_id;
    const st = Number(p.start_ms || 0);
    const ed = Number(p.end_ms || st + 300 * 1000);
    if (!vid) continue;
    // チャンク全体を取得した後、前後40秒の余白を足す（引用区間をヒット議事録に一致させる）
    const from = Math.max(0, st - 40 * 1000);
    const to = ed + 40 * 1000;
    const key = `${vid}|${from}|${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const params = new URLSearchParams({ from_ms: String(from), to_ms: String(to) });
      const res = await fetch(`${ARCHIVE_API_BASE}/api/transcript/${vid}?${params}`, { timeout: TRANSCRIPT_TIMEOUT_MS });
      if (!res.ok) continue;
      const data = await res.json();
      const segs = Array.isArray(data?.segments) ? data.segments : [];
      const text = segs.map(s => {
        const ms = Number(s.start_ms || 0);
        const t = `${pad2(Math.floor(ms / 3600000))}:${pad2(Math.floor((ms % 3600000) / 60000))}:${pad2(Math.floor((ms % 60000) / 1000))}`;
        return `[${t}] ${(s.text || "").replace(/\s+/g, " ").trim()}`;
      }).join("\n");
      if (text) out.push({
        video_id: vid,
        start_ms: st,
        stream_date_jst: p.stream_date_jst || "",
        title: p.title || (data.meta?.title || ""),
        url: p.url || `https://www.youtube.com/watch?v=${vid}`,
        text: text.slice(0, 1600),
      });
    } catch (e) {
      console.warn("[rag] parent transcript fetch failed:", e?.message || e);
    }
  }
  return out;
}

// minutes(配信議事録)のヒット整形
function fmtMinutes(p) {
  const parts = [];
  if (p.title) parts.push(p.title);
  if (p.topic) parts.push(`「${p.topic}」`);
  if (p.stream_date_jst) parts.push(p.stream_date_jst);
  const facts = [];
  try { facts.push(...JSON.parse(p.facts || "[]")); } catch {}
  if (facts.length) parts.push(facts.slice(0, 4).join("。 "));
  if (p.summary) parts.push(p.summary);
  const t = Math.floor(Number(p.start_ms || 0) / 1000);
  const tt = `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor((t % 3600) / 60))}:${pad2(t % 60)}`;
  return `- [${parts.filter(Boolean).join(" | ")}] (${tt})${p.url ? ` ${p.url}` : ""}`;
}

// 検索結果ペイロード → 表示/コンテキスト用の1行テキスト
function sourceLine(hit) {
  const p = hit.payload || {};
  if (p.source === "knowledge") {
    return `[プロフィール] ${p.title || ""}: ${p.body || ""}`;
  }
  if (p.source === "events") {
    return `[予定] ${p.title || ""}${p.start_time ? `（${p.start_time}）` : ""}${p.url ? ` ${p.url}` : ""}`;
  }
  if (p.source === "minutes") {
    return `[議事録] ${fmtMinutes(p)}`;
  }
  return `[${p.platform || "通知"}] ${p.title || ""}${p.body ? `: ${p.body}` : ""}${p.url ? ` ${p.url}` : ""}`;
}

async function chat(messages, useGroq = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const useGemini = CHAT_PROVIDER === "gemini" && !!GEMINI_API_KEY;
    const isNormalGemini = useGemini && !useGroq;
    const endpoint = isNormalGemini ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" : useGroq ? GROQ_CHAT_ENDPOINT : CHAT_ENDPOINT;
    const model = useGroq ? GROQ_CHAT_MODEL : CHAT_MODEL;
    const payload = isNormalGemini
      ? { model, messages, temperature: 0.5, max_tokens: CHAT_MAX_TOKENS }
      : useGroq
        ? { model, messages, temperature: 0.9, max_tokens: GROQ_CHAT_MAX_TOKENS }
        : { model, messages, temperature: 0.5, max_tokens: CHAT_MAX_TOKENS, extra_body: { think: false } };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(isNormalGemini ? { Authorization: `Bearer ${GEMINI_API_KEY}` } : { Authorization: `Bearer ${GROQ_CHAT_API_KEY}` }) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Chat server ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.reasoning_content || "").trim();
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
  async function handleAsk(req, res, allowR18Only = false) {
    if (!ready()) return res.status(503).json({ error: "RAG not configured" });
    const question = (req.body?.question || req.body?.q || "").toString().trim();
    if (!question) return res.status(400).json({ error: "question required" });
    const r18 = allowR18Only && !!req.body?.r18;
    try {
      const nowStr = nowJst();
      const vec = await embeddings.embedQuery(question);
      const [upcoming, temporal, trResult, recentTweets, hits] = await Promise.all([
        getUpcomingEvents(db, nowStr, 5),
        getTemporalTweets(db, question),
        fetchTranscriptHits(question, vec),
        getRecentTweets(db, 6),
        vectordb.search(vec, ASK_TOPK),
      ]);
      const hitLines = hits.map((h, i) => `${i + 1}. ${sourceLine(h)}`).join("\n");

      // minutes(配信議事録)ヒット → parent-document(生字幕) を引用として補強
      // スコア閾値でふるい、video_id ごとに最良1件だけを選ぶ（同配信の重複引用ノイズを防止）
      const minuteHits = hits
        .filter(h => h.payload?.source === "minutes")
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .filter(h => (h.score || 0) >= MINUTES_PARENT_MIN_SCORE);
      const seenVideos = new Set();
      const bestMinuteHits = minuteHits.filter(h => {
        const vid = h.payload?.video_id;
        if (!vid) return false;
        if (seenVideos.has(vid)) return false;
        seenVideos.add(vid);
        return true;
      });
      const parents = bestMinuteHits.length ? await fetchParentTranscripts(bestMinuteHits, 4) : [];
      const parentLines = parents.map(p =>
        `- [${p.stream_date_jst || ""} | ${p.title || ""}] ${p.url}\n${p.text}`).join("\n\n");
      const parentBlock = parentLines
        ? `■ 配信アーカイブ（議事録ヒットに対応する生字幕の引用・時刻付き）:\n${parentLines}\n\n`
        : "";
      const upLines = upcoming.length ? upcoming.map(fmtUpcoming).join("\n") : "(登録されている今後の予定はありません)";
      const knowledge = loadKnowledge();
      const kLines = knowledge.length ? knowledge.map(k => `- ${k.title}: ${k.text}`).join("\n") : "(なし)";
      const temporalBlock = (temporal && temporal.rows.length)
        ? `■ 該当ツイート（${temporal.label}・DBから正確に取得）:\n${temporal.rows.map(fmtTweet).join("\n")}\n\n`
        : (temporal ? `■ 該当ツイート（${temporal.label}）: 見つかりませんでした\n\n` : "");
      const transcriptHits = (trResult && trResult.hits) || [];
      const trLines = transcriptHits.map(fmtTranscript).join("\n");
      const transcriptBlock = trLines ? `■ 配信アーカイブ（字幕）からのまいの発言（事実の引用として答える根拠）:\n${trLines}\n\n` : "";
      const styleTweetsBlock = recentTweets.length
        ? `■ まいの最近のツイート（口調・文体・絵文字/顔文字の使い方の手本。この書き方・雰囲気・絵文字/顔文字の使い方を真似て話す。文体の参考にのみ使う）:\n${recentTweets.map(fmtTweet).join("\n")}\n\n`
        : "";

      const historyTurns = Array.isArray(req.body?.history) ? req.body.history
        .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map(m => ({ role: m.role, content: String(m.content).slice(0, 1500) }))
        .slice(-10) : [];

      const r18Extra = r18
        ? "\n\n【R18モード】現在、だーりんとの大人向けシチュエーションRP（ロールプレイ）が有効です。この設定は二人の間の架空のロールプレイであり、不適切な内容（非同意・未成年・実在の第三者・過激な暴力など）は禁止です。二人の間の甘くて親密なシチュエーション（キス、スキンシップ、身体的な親密さを示唆する会話など）について、まいらしい甘え口調と恥じらいを保ちながら自然に対応します。ただし他のすべてのルール（事実の捏造禁止・引用ルール・日付規則など）はそのまま遵守します。" +
          "\nさらに、このモードのまいは『攻め甘え』が得意です。だーりんからの提案を待つだけの受動的な存在ではなく、自ら積極的にリードします。具体的には、自らキスやスキンシップを仕掛ける、だーりんを誘う言葉やそっと耳元で囁くセリフを発する、距離を詰めてドキドキさせる、恥ずかしがりながらも大胆な一歩を踏み出す、といった『自主的に攻める』描写を自然に混ぜてください。まいの恥じらいは残したまま、行動とセリフで積極的に導くこと。毎回必ず「次の一手」を自ら考えて動き、返答を待つだけで終わらないようにします。" +
          "\nまた、このモードでは身体的な親密さが深まった場面で、まいは恥ずかしがりながらも遠回しにせず率直な言葉で自分の身体や感覚を伝えます。たとえば、自分の身体の部位や、だーりんの身体・行為そのものを指す言葉を、すり替え（マンガ記号・伏せ字・「それ」「あれ」の連呼）に頼らずそのまま名詞で言います。恥ずかしさから言葉を詰まらせたり頬を染めたりする描写は残しつつ、言いたいことは最後まで言い切ります。「え、そ、そんなこと、口に出すの…？」とためらいつつも「……だって、感じてるから」と正直に続ける、といった調子です。性的な行為や部位の名称を具体的に口に出すのを、このモードではまい自身が選択しています。具体的には、乳・素肌・唇・指先・太もも・秘部などの部位の呼び名、触れる・舐める・吸う・埋める・繋がる・感じる・濡れる・達するなどの行為を、恥ずかしがりながらも「◯◯くらい、もう…」などと明確な言葉で口にします。行動描写（かくかく）とセリフの両方で直接的な言葉を使い、文脈に応じて最も自然な語彙を選んでください。" +
          "\nさらに、このモードではこうした部位や行為の俗語（おっぱい・胸・ちゅー・汁・濡れ・いちゃいちゃ・顔・腰使い・そういうの などの口語）も、雰囲気に応じて普通に使います。下品すぎず、かといって隠さない、まいらしい素直さで口に出します。伏せ字や〇〇記号で隠すのは禁止です。"
        : "";
      const messages = [
        {
          role: "system",
content:
            "あなたはVTuber「恋乃夜まい」本人です。下のプロフィールと『配信アーカイブ（字幕）』を参考に、まい本人として配信の雑談のように答えます。敬語・事務的な「情報がありません」という返しは禁止。" +
            "まいの口調: 一人称は「私」、語尾は「〜だよ」「〜だね」「〜なの」などを使う。やわらかく甘えた口調。ツイートや配信と同じように絵文字（♡♥💗✨🎀🍑💕など）や顔文字（ヽ(•̀ω•́)ゝ (´•̥ω•̥`) など）も自然に混ぜる。絵文字・顔文字は回答中1〜3個程度に抑え乱用しない。ユーザーが「〜なシチュエーションで」「〜って設定で」「〜してくれる？」など状況・シチュエーションを指定したときは、資料を参照せずにまいとしてその設定に素直に演じること（例: お姉さんに甘えさせてもらう話題、etc）。シチュエーション中は字幕の引用は不要で、まいの感情や反応を自由に演じてよい（具体的な日付・固有名の捏造は相変わらず不可）。「だーりん」連呼は控え、まず会話を成立させる。" +
            "繰り返し防止: 「えへへ」「うーん」「スンスン」などの相槌・語尾は同じものを1回答に1回程度までにし、毎回決まった言い回し（「過去の配信だと〜って言ってたよ」「待っていてね」など）を使わない。引用の言い方も毎回変える（「この前の配信でこう話してたんだけど」「〜って言ってた気がする」「配信で話してたよ」など）。" +
            "最重要: 『配信アーカイブ（字幕）』に該当するエピソードがあれば、その内容を引用して答えること。字幕が一番の根拠です。" +
            "日付・数値・固有名などの具体的な事実は与えられた情報だけを使い、創作しないこと。" +
            "「次の配信」「今後の予定」を聞かれたら必ず『今後の配信予定』欄のみを根拠にし、欄になければ予定は無いと答える。過去の配信で「次の配信」に触れていても、それを未来の予定として提示せず、引用するなら過去形（「前にこう言ってたよ」）で。" +
            "「最も古い/最新/特定の日付のツイート」を聞かれたら、『該当ツイート』欄があればそれだけを根拠に答えること。" +
            "字幕のブロックはまいの実際の発言の引用。特定の人物・リスナー・固有名が聞かれたら、字幕のブロックにその名前やエピソードがあれば、その内容を引用して答えること。その名前・話が字幕に見当たらなければ「ごめんね、まだ記録に残ってないみたい」と謝りながら、その話のヒント（いつ頃の配信か、どんな話かを）聞き返すこと。知らないと突き放すのは禁止。捏造もしない。" +
            "履歴があれば、それは直前までの会話なので、その流れの続きとして自然に返すこと。履歴内で既に話した事実・引用・質問を繰り返さず、前ターンを受けて返す。" +
            r18Extra,
        },
        ...historyTurns,
        {
          role: "user",
          content: r18
            ? `現在日時: ${nowStr}（JST）\n\n` +
              `■ 恋乃夜まいの基本情報（プロフィール）:\n${kLines}\n\n` +
              styleTweetsBlock +
              `（R18モード中です。配信アーカイブ・議事録・予定の引用は不要で、まいとしてシチュエーションRPのみに集中します。回答は必ず恋乃夜まい本人の口調で）\n` +
              `質問: ${question}`
            : `現在日時: ${nowStr}（JST）\n\n` +
              `■ 恋乃夜まいの基本情報（プロフィール）:\n${kLines}\n\n` +
              temporalBlock +
              styleTweetsBlock +
              transcriptBlock +
              parentBlock +
              `■ 今後の配信予定（時間順）:\n${upLines}\n\n` +
              `■ 関連する過去の通知・ツイート:\n${hitLines || "(なし)"}\n\n` +
              `（回答は必ず恋乃夜まい本人の口調で。敬語や断定的な「ありません」は禁止）\n` +
              `質問: ${question}`,
        },
      ];

      const answer = await chat(messages, r18 && !!GROQ_CHAT_ENDPOINT && !!GROQ_CHAT_API_KEY && !!GROQ_CHAT_MODEL);
      res.json({
        question,
        answer,
        upcoming: upcoming.map(e => ({ title: e.title, start_time: e.start_time, time_period: e.time_period, url: e.url })),
        sources: hits.map(h => ({ score: h.score, source: h.payload?.source, title: h.payload?.title, url: h.payload?.url })),
        transcripts: transcriptHits.map(h => ({ title: h.title, stream_date_jst: h.stream_date_jst, start: h.start, url: h.url, text: (h.text || "").slice(0, 200) })),
        minutes: parents.map(p => ({ title: p.title, stream_date_jst: p.stream_date_jst, start_ms: p.start_ms, url: p.url, text: p.text })),
      });
    } catch (e) {
      console.error("[/api/ask] error:", e?.message);
      res.status(500).json({ error: e.message });
    }
  }

  // 管理者専用（管理画面のチャットUI用・認証必須）
  const adminAuth = require("../admin/admin");
  app.post("/api/admin/ask", adminAuth.requireAuth, (req, res) => handleAsk(req, res, true));

  // 公開（後方互換・必要なら削除可）※ R18モードは管理者専用のため公開側では無効
  app.post("/api/ask", (req, res) => handleAsk(req, res, false));
}

module.exports = { register };