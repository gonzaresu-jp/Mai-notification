#!/usr/bin/env node
// whisper セグメントの「おかしな字幕」検査
const sqlite3 = require("sqlite3");
const path = require("path");
const DB = path.join(__dirname, "..", "data.db");

const db = new sqlite3.Database(DB, (e) => { if (e) { console.error("open fail", e.message); process.exit(1); } });

const HUH = /[。、！？…〜\s]*/; // 無視用

function calcScore(text) {
  let sc = 0;
  // 1) 明らかな「音のみ」または機械ミス
  const t = text.trim();
  if (!t) return 999;
  // 長すぎない・短すぎないか
  if (t.length < 1) return 999;
  // 2) 英語混入率(会見が日本語のため英語だけだと怪しい)
  const ja = (t.match(/[ぁ-んァ-ヶ一-龠]/g) || []).length;
  const en = (t.match(/[a-zA-Z]/g) || []).length;
  // 3) 記号だけ
  const symOnly = t.replace(/[ぁ-んァ-ヶ一-龠0-9a-zA-Z　、。！？…〜・\s]/g, "");
  // 4) 繰り返し(「ぁぁぁぁ」「なになになに」)
  const dup = t.match(/(.)\1{3,}/);
  // 5) 疑問符だらけ or 意味不明の「っ」「゛」等
  return { ja, en, symOnly, symLen: symOnly.length, dup, text: t };
}

db.all(
  "SELECT video_id, start_ms, end_ms, text FROM video_whisper_segments WHERE text != '' ORDER BY video_id, start_ms",
  (err, rows) => {
    if (err) { console.error(err.message); process.exit(1); }
    console.log("total segs: " + rows.length);
    const flagged = [];
    for (const r of rows) {
      const a = calcScore(r.text);
      if (a === 999) continue;
      let reasons = [];
      if (a.symLen >= 4) reasons.push(`記号等 ${a.symLen}個`);
      if (a.en > 0 && a.ja === 0 && a.text.length >= 3) reasons.push("英語のみ(要確認)");
      if (a.dup) reasons.push("連続繰り返し");
      if (a.text.length > 200) reasons.push("超長文");
      if (a.text.length < 2) reasons.push("極短文");
      if (reasons.length) {
        flagged.push({ ...r, ...a, reasons: reasons.join(" / ") });
      }
    }
    console.log("flagged: " + flagged.length);
    // 動画ごとに変なものを最大5件ずつ表示
    const byVid = {};
    for (const f of flagged) (byVid[f.video_id] = byVid[f.video_id] || []).push(f);
    for (const [vid, arr] of Object.entries(byVid)) {
      console.log(`\n### ${vid} (flagged ${arr.length})`);
      for (const f of arr.slice(0, 6)) {
        const t0 = (n) => String(Math.floor(n / 60000)).padStart(2, "0") + ":" + String(Math.floor((n % 60000) / 1000)).padStart(2, "0");
        console.log(`  [${t0(f.start_ms)}] ${f.reasons}: ${f.text.slice(0, 90)}`);
      }
    }
    db.close();
  }
);