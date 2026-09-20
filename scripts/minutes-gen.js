// minutes-gen.js - 配信字幕から議事録を生成し、video_minutes テーブルへ保存
// 使い方:
//   node scripts/minutes-gen.js --vids "Id1 Id2 ..."
//   node scripts/minutes-gen.js --recent 20
//   node scripts/minutes-gen.js --recent 20 --embed   # 生成後に埋め込み→Pi upsert まで実行
//   node scripts/minutes-gen.js --file list.txt --embed
// 進捗: video_minutes に video_id が存在すればスキップ（--reset で再生成）
require("dotenv").config({ path: "/var/www/html/mai-push/.env" });
const fetch = require("node-fetch");
const fs = require("fs");
const os = require("os");
const sqlite3 = require("sqlite3");
const path = require("path");

const DB_PATH = process.env.RAG_DB_PATH || path.join(__dirname, "..", "data.db");
const ARCHIVE_API_BASE = process.env.ARCHIVE_API_BASE || "http://192.168.1.70:8766";
const API_URL = process.env.MINUTES_API_URL || process.env.GEMINI_URL || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const API_KEY = process.env.MINUTES_API_KEY || process.env.GEMINI_API_KEY || "";
const MODEL = process.env.MINUTES_MODEL || "gemini-3.5-flash-lite";
const CHUNK_MS = 300 * 1000; // 5分チャンク
const CONCURRENCY = 1; // API 呼び出しの並列数（レート制限対策で1）
const MAX_RETRY = 3;
const PACE_MS = parseInt(process.env.MINUTES_PACE_MS || "60000", 10); // 成功後のインターバル（Groq無料枠のOTPM 1000/分を踏まえた既定値）

// --- Cloudflare Workers AI 日次無料枠(Neurons)管理 ----------------------------------
// Workers AI は USD $0.011 / 1,000 neurons、無料枠は 10,000 neurons/日 (UTC 00:00 リセット)。
// 使い切ったら翌日のリセットまで眠る。--force-free-tier で無料枠を無視する。
const NEURON_BUDGET = Math.min(
  parseFloat(process.env.CF_NEURON_BUDGET || "9500"), // 既定: 無料枠10,000のうち安全マージン込み
  10000
);
const NEURON_STATE_FILE = path.join(__dirname, "..", "tmp", "minutes_neurons_state.json");
const NEURON_STATE_DAY = () => new Date().toISOString().slice(0, 10); // UTC日付
let neuronState = { day: NEURON_STATE_DAY(), used: 0 };
function loadNeuronState() {
  try {
    const raw = fs.readFileSync(NEURON_STATE_FILE, "utf8");
    const s = JSON.parse(raw);
    if (s.day === NEURON_STATE_DAY()) return s;
    return { day: NEURON_STATE_DAY(), used: 0 };
  } catch {
    return { day: NEURON_STATE_DAY(), used: 0 };
  }
}
function saveNeuronState() {
  try {
    fs.mkdirSync(path.dirname(NEURON_STATE_FILE), { recursive: true });
    fs.writeFileSync(NEURON_STATE_FILE, JSON.stringify(neuronState), "utf8");
  } catch (e) { /* 状態保存はベストエフォート */ }
}
function neuronsLeft() {
  const left = NEURON_BUDGET - neuronState.used;
  return Math.max(0, left);
}
async function sleepMs(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}
async function waitUntilNextUtcDay() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  next.setUTCMinutes(0, 15, 0);
  let waitMs = next.getTime() - now.getTime();
  if (waitMs <= 0) waitMs = 60 * 60 * 1000;
  console.log(`\n[neurons] 日次無料枠を使い切りました (used=${neuronState.used.toFixed(0)}/${NEURON_BUDGET})。`);
  console.log(`[neurons] リセット(UTC 00:15 ≒ JST 09:15)まで ${fmtDuration(waitMs)} 待機します。停止するなら Ctrl+C。`);
  await sleepMs(waitMs);
  neuronState = loadNeuronState();
}
async function ensureNeurons() {
  while (neuronState.used >= NEURON_BUDGET) {
    await waitUntilNextUtcDay();
  }
}

function fmtJst(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function getTranscript(videoId) {
  const res = await fetch(`${ARCHIVE_API_BASE}/api/transcript/${videoId}`, { timeout: 30000 });
  if (!res.ok) throw new Error(`transcript ${res.status}`);
  return await res.json();
}

function chunkSegments(segments, chunkMs) {
  const chunks = [];
  let cur = null;
  for (const s of segments) {
    if (!s || !s.text || !s.text.trim()) continue;
    const start = s.start_ms, end = s.end_ms || start;
    if (!cur || start - cur.start >= chunkMs) {
      cur = { start, end, segs: [] };
      chunks.push(cur);
    } else {
      cur.end = Math.max(cur.end, end);
    }
    cur.segs.push(s);
  }
  return chunks;
}

async function summarize(chunk) {
  const text = chunk.segs.map(s => `${fmtJst(s.start_ms)} ${s.text.trim()}`).join("\n");
  const messages = [
    {
      role: "system",
      content:
        "あなたは配信の文字起こしから「議事録」を作るアシスタントです。与えられた字幕区間から、" +
        "まいちゃん(恋乃夜まい)が話した話題・明言した事実（好きなもの、エピソード、意見、予定、人間関係などの具体的な名前・固有名詞は省略しない）を抽出します。" +
        "自動字幕なので誤字・誤認識が含まれますが、文脈から意味を推測して要点をまとめてください。" +
        "字幕は複数の話題が混ざるので、話題ごとに別の要素に分割してください。字幕に含まれない要素は一切でっち上げないでください。" +
        "時刻情報は不要です。必ず有効なJSON配列を1つだけ出力してください。Markdownのコードブロックや余計な説明は不要です。\n" +
        '形式: [{"topic": "話題タイトル(15字以内)", "facts": ["事実1", "事実2", ...]または[], "detail": "この区間の1〜3文の要約"}, ...]',
    },
    { role: "user", content: `区間字幕（各行頭は先頭の [HH:MM:SS] 開始時刻）:\n${text}` },
  ];
  let lastErr;
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: 2048 }),
        timeout: 90000,
      });
      if (!res.ok) throw new Error(`api ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      // Cloudflare Workers AI は usage.neurons に実消費量を返す
      if (data?.usage?.neurons != null) {
        neuronState.used = Math.min(NEURON_BUDGET, neuronState.used + data.usage.neurons);
        saveNeuronState();
        console.log(`[neurons] +${data.usage.neurons.toFixed(1)} (残 ${neuronsLeft().toFixed(0)})`);
      }
      const out = (data.choices?.[0]?.message?.content || "").trim();
      const cleaned = out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    } catch (e) {
      lastErr = e;
      await sleepMs(2000 * (i + 1));
    }
  }
  throw new Error(`summarize failed: ${lastErr?.message || lastErr}`);
}

function dbOpen() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, err => (err ? reject(err) : resolve(db)));
  });
}
const dbRun = (db, sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { e ? rej(e) : res(this); }));
const dbGet = (db, sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r || null))));
const dbAll = (db, sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r || []))));

function parseArgs(argv) {
  const args = { vids: [], recent: null, file: null, embed: false, reset: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--recent") args.recent = parseInt(argv[++i], 10);
    else if (a === "--vids") args.vids = String(argv[++i] || "").trim().split(/\s+/).filter(Boolean);
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--embed") args.embed = true;
    else if (a === "--reset") args.reset = true;
    else args.vids.push(a);
  }
  return args;
}

async function resolveVideos(db, args) {
  if (args.recent) {
    // 字幕持ち・雑談/マシュマロ系を stream_at 降順で指定数
    const rows = await dbAll(db,
      `SELECT video_id, title, stream_date_jst FROM video_minutes`, []);
    const done = new Set(rows.map(r => r.video_id));
    // include_deleted=1 で「YTから削除された動画」も要約生成の対象にする（AIのみ利用）
    const list = await fetch(`${ARCHIVE_API_BASE}/api/videos?limit=100&sort=stream_at_desc&include_deleted=1`).then(r => r.json()).catch(() => null);
    let candidates = [];
    if (list && Array.isArray(list.videos)) {
      // v_catalog には caption 有無の列が無いため、タイトルで候補を絞る。
      // 字幕が無い動画は getTranscript が 404 を返すので呼び出し側で skip される。
      candidates = list.videos.filter(v =>
        /(雑談|マシュマロ|相談|晩酌|ごごまい|ASMR)/.test(v.title || ""));
    } else throw new Error("archive /api/videos failed");
    const out = [];
    for (const v of candidates) {
      if (done.has(v.video_id)) continue;
      out.push(v);
      if (out.length >= args.recent) break;
    }
    return out;
  }
  if (args.file) {
    const fs = require("fs");
    const txt = fs.readFileSync(args.file, "utf8");
    return txt.trim().split(/\s+/).map(id => ({ video_id: id }));
  }
  return args.vids.map(id => ({ video_id: id }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!API_KEY) { console.error("API key required (MINUTES_API_KEY or GEMINI_API_KEY)"); process.exit(1); }
  const db = await dbOpen();
  await dbRun(db, `CREATE TABLE IF NOT EXISTS video_minutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    topic TEXT,
    summary TEXT,
    facts TEXT,
    title TEXT,
    stream_date_jst TEXT,
    url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_video_minutes_video_id ON video_minutes (video_id)`);

  const targets = await resolveVideos(db, args);
  console.log(`targets: ${targets.length}`);
  for (const t of targets) console.log(" -", t.video_id, "|", t.title || "");

  let totalChunks = 0, totalItems = 0, skipped = 0;
  for (const t of targets) {
    const videoId = t.video_id;
    let tr;
    try { tr = await getTranscript(videoId); } catch (e) { console.error(`getTranscript fail ${videoId}:`, e.message); continue; }
    const meta = tr.meta || {};
    const title = t.title || meta.title || "";
    const streamAt = meta.stream_at || "";
    const streamDateJst = streamAt ? streamAt.slice(0, 10) : (meta.stream_date_jst || "");
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const chunks = chunkSegments(tr.segments || [], CHUNK_MS);
    const existing = await dbGet(db, "SELECT COUNT(DISTINCT start_ms) n FROM video_minutes WHERE video_id=?", [videoId]);
    if (existing && existing.n >= chunks.length && !args.reset) {
      console.log(`skip (already done): ${videoId} (${existing.n}/${chunks.length} chunks)`);
      skipped++;
      continue;
    }
    totalChunks += chunks.length;
    console.log(`\n=== ${videoId} | ${title.slice(0, 40)} | chunks: ${chunks.length} | existing: ${existing ? existing.n : 0}`);

    // 部分完了・重複があれば消してから生成し直す（同一チャンク再投入で重複させない）
    await dbRun(db, "DELETE FROM video_minutes WHERE video_id=?", [videoId]);

    // 直列→並列実行(小並列)
    let index = 0;
    const worker = async () => {
      while (index < chunks.length) {
        const ci = index++;
        const chunk = chunks[ci];
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await ensureNeurons();
            const items = await summarize(chunk);
            // トピックごとに1行。start_ms/end_ms は Gemini の推測でなくチャンクの実字幕時刻を使う
            // （Gemini は start_ms を誤った単位で返すことがあり、引用時刻として不正確のため）。
            let inserted = 0;
            for (const it of items) {
              const dup = await dbGet(db, "SELECT 1 FROM video_minutes WHERE video_id=? AND start_ms=?", [videoId, chunk.start]);
              if (dup) continue;
              await dbRun(db,
                `INSERT INTO video_minutes (video_id, start_ms, end_ms, topic, summary, facts, title, stream_date_jst, url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [videoId, chunk.start, chunk.end,
                 it.topic || "", it.detail || "",
                 JSON.stringify((it.facts || []).filter(Boolean)),
                 title, streamDateJst, url]);
              inserted++;
            }
            totalItems += items.length;
            console.log(`  [${ci + 1}/${chunks.length}] ${fmtJst(chunk.start)} items=${items.length}`);
            await sleepMs(PACE_MS);
            break;
          } catch (e) {
            console.error(`  chunk ${ci} attempt ${attempt + 1} fail:`, e.message);
            // 429（レート制限）は間隔を空けてリトライ
            const is429 = /429|quota|rate.?limit/i.test(e.message);
            const waitMs = is429 ? 15000 : 3000;
            await sleepMs(waitMs);
            if (attempt === 0) continue;
            await ensureNeurons();
            const attempt2retry = await summarize(chunk).catch(() => null);
            if (attempt2retry) {
              let inserted = 0;
              for (const it of attempt2retry) {
                const dup = await dbGet(db, "SELECT 1 FROM video_minutes WHERE video_id=? AND start_ms=?", [videoId, chunk.start]);
                if (dup) continue;
                await dbRun(db,
                  `INSERT INTO video_minutes (video_id, start_ms, end_ms, topic, summary, facts, title, stream_date_jst, url)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [videoId, chunk.start, chunk.end,
                   it.topic || "", it.detail || "",
                   JSON.stringify((it.facts || []).filter(Boolean)),
                   title, streamDateJst, url]);
                inserted++;
              }
              totalItems += attempt2retry.length;
              console.log(`  [${ci + 1}/${chunks.length}] (retry ok) items=${attempt2retry.length}`);
            } else {
              console.error(`  chunk ${ci} dropped`);
            }
          }
        }
      }
    };
    const workers = Array.from({ length: CONCURRENCY }, worker);
    await Promise.all(workers);
    console.log(`done: ${videoId} (${chunks.length} chunks)`);
  }

  console.log(`\n=== SUMMARY: chunks=${totalChunks} items=${totalItems} skipped=${skipped}`);

  if (args.embed) {
    const { embedMinutes } = require("../services/minutes-sync");
    const n = await embedMinutes(db);
    console.log(`embed/upsert done: ${n} points`);
  }

  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });