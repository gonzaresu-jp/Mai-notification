#!/usr/bin/env node
// Whisper vs YT の「意味不明」判定 — 両方を確認しやすい比較表示
const sqlite3 = require("sqlite3");
const path = require("path");
const DB = path.join(__dirname, "..", "data.db");
const BASE = process.env.ARCHIVE_API_BASE || "http://192.168.1.70:8766";

const db = new sqlite3.Database(DB, (e) => { if (e) { console.error(e.message); process.exit(1); } });

// 意味不明判定: TRUEなら怪しい
function suspicious(t) {
  if (!t || !t.trim()) return null;
  const s = t.trim();
  const ja = (s.match(/[一-龠ぁ-んァ-ヶ]/g) || []).length;
  const en = (s.match(/[a-zA-Z]/g) || []).length;
  const alnum = ja + en + (s.match(/[0-9]/g) || []).length;
  // かな・漢字がほぼ無い
  if (ja === 0 && s.length >= 3) return "漢字/かななし";
  // 記号・特殊文字の高密度
  const sym = s.replace(/[ぁ-んァ-ヶ一-龠0-9a-zA-Z　、。！？…〜・ぃっ]/g, "");
  if (sym.length >= 6 && sym.length / s.length > 0.4) return "記号率高";
  // 連続する「ん」「っ」「ぁ」のみ(声/ため息)
  if (/^[んっぁあえおぅ]、?[んっぁあえおぅ、。\s]*$/.test(s) && s.length <= 6) return "息/声のみ";
  // 「??」のような？
  if (/[？?]{2,}/.test(s)) return "疑問符連続";
  // 変な繰り返し(1文字 x 5+)
  if (/(.)\1{4,}/.test(s) && !/わわわ|ふふ|ぱぱ|ららら|きゃきゃ/.test(s)) return "連続繰返";
  return null;
}

function fmt(ms) {
  ms = Math.max(0, ms || 0);
  return String(Math.floor(ms / 3600000)).padStart(2, "0") + ":" +
         String(Math.floor(ms / 60000) % 60).padStart(2, "0") + ":" +
         String(Math.floor(ms / 1000) % 60).padStart(2, "0");
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

    const wBad = w.map((s) => ({ ...s, why: suspicious(s.text) })).filter((x) => x.why);
    const yBad = yt.map((s) => ({ ...s, why: suspicious(String(s.text)) })).filter((x) => x.why);
    console.log(`\n===== ${v} — Whisper怪しい ${wBad.length} / YT怪しい ${yBad.length} =====`);

    // YT側も怪しい所は除き、Whisperだけ怪しいものを表示(比較しやすいようYTの該当時間付き)
    const yByStart = {};
    for (const y of yt) yByStart[Math.round((Number(y.start_ms) || 0) / 1000)] = { text: String(y.text), start: Number(y.start_ms) || 0 };

    let shown = 0;
    for (const x of wBad.slice(0, 12)) {
      // 同じ秒のYT字幕を探す(±3s)
      const sec = Math.round(x.start_ms / 1000);
      let ytHit = null;
      for (let d = 0; d <= 6; d++) {
        if (yByStart[sec + d]) { ytHit = yByStart[sec + d]; break; }
        if (yByStart[sec - d]) { ytHit = yByStart[sec - d]; break; }
      }
      const ySame = yBad.some((yy) => Math.abs((Number(yy.start_ms) || 0) - x.start_ms) < 4000);
      if (ySame) {
        // YTも同じだったら Whisper固有の問題ではないので「(YTも同様)」マーク
      }
      console.log(`[${fmt(x.start_ms)}] W: ${x.why} → ${x.text.slice(0, 100)}`);
      if (ytHit) console.log(`   └YT(${fmt(ytHit.start)}): ${ytHit.text.slice(0, 100)}`);
      else console.log(`   └YT: (該当なし)`);
      if (++shown >= 12) break;
    }
  }
  db.close();
}
main().catch((e) => { console.error(e); process.exit(1); });