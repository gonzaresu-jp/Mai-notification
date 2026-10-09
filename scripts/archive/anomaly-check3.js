#!/usr/bin/env node
// 明確な認識ミスだけを拾う — YT字幕と突き合わせて「Whisper独自の意味不明」を表示
const sqlite3 = require("sqlite3");
const path = require("path");
const DB = path.join(__dirname, "..", "data.db");
const BASE = process.env.ARCHIVE_API_BASE || "http://192.168.1.70:8766";

const db = new sqlite3.Database(DB, (e) => { if (e) { console.error(e.message); process.exit(1); } });

function fmt(ms) {
  ms = Math.max(0, ms || 0);
  return String(Math.floor(ms / 60000) % 60).padStart(2, "0") + ":" +
         String(Math.floor(ms / 1000) % 60).padStart(2, "0");
}

// 明確な認識ミス判定: 意味不明どころか「意味が通らない」もの
function badW(t) {
  if (!t) return null;
  const s = t.trim();
  if (!s) return null;
  if (s.length > 40 && (s.match(/[？?]{2,}/g) || []).length >= 2) return "??連続(混乱)";
  // 記号だけ(1文字の「ん」「あ」除く)
  const sym = s.replace(/[ぁ-んァ-ヶ一-龠0-9a-zA-Z　、。！？…〜・]/g, "");
  if (sym.length >= 5) return "記号の羅列";
  // 子音だけのモゴモゴ・舌打ち
  if (/^[ンンmɴぁぱーーー]+$/.test(s) && s.length > 2) return "音のみ";
  // 「〜〜」等
  if (/^[〜〜…]+$/.test(s) && s.length > 3) return "伸ばしのみ";
  // わからない音 → 硬直: 「?」「????」
  if (/^[?？]+$/.test(s)) return "????";
  // 固定文の無限繰り返し(ハルシネーション)
  if (/(「.+」|Thank you|ありがとう|すみません|あー|うー).*\1/.test(s)) return "繰返(幻覚)";
  // 途中で切れたような末尾 「…て」「…の」
  if (/^[ぁ-ん]{1,4}[ての](、[ぁ-ん]{1,4}[ての])*$/.test(s) && s.length > 2) return "断片";
  return null;
}

async function main() {
  const videos = await new Promise((res, rej) => db.all(
    "SELECT DISTINCT video_id FROM video_whisper_segments", (e, r) => e ? rej(e) : res(r)));
  for (const v of videos.map((x) => x.video_id)) {
    const w = await new Promise((res, rej) => db.all(
      "SELECT start_ms, end_ms, text FROM video_whisper_segments WHERE video_id=? ORDER BY start_ms", [v], (e, r) => e ? rej(e) : res(r)));
    let yt = [];
    try {
      const res = await fetch(`${BASE}/api/transcript/${v}`);
      if (res.ok) yt = ((await res.json()).segments || []).filter((s) => s && String(s.text).trim());
    } catch { yt = []; }
    const ytBySec = {};
    for (const y of yt) ytBySec[Math.round((Number(y.start_ms) || 0) / 1000)] = String(y.text);

    const finds = w.map((s, i) => ({ s, why: badW(s.text), i })).filter((x) => x.why);
    console.log(`\n===== ${v} — Whisper明確な認識ミス候補 ${finds.length} =====`);
    let shown = 0;
    for (const f of finds.slice(0, 10)) {
      const sec = Math.round(f.s.start_ms / 1000);
      let ytHit = null;
      for (let d = 0; d <= 8; d++) {
        if (ytBySec[sec + d]) { ytHit = ytBySec[sec + d]; break; }
        if (ytBySec[sec - d]) { ytHit = ytBySec[sec - d]; break; }
      }
      const mark = ytHit && badW(ytHit);
      console.log(`[${fmt(f.s.start_ms)}] ${f.why}`);
      console.log(`  W: ${f.s.text.slice(0, 90)}`);
      if (ytHit) console.log(`  Y: ${ytHit.slice(0, 90)}${mark ? "  ← YTも変" : ""}`);
      else console.log("  Y: (該当なし)");
      if (++shown >= 10) break;
    }
  }
  db.close();
}
main().catch((e) => { console.error(e); process.exit(1); });