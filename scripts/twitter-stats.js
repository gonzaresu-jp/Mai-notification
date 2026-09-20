#!/usr/bin/env node
// まいちゃんのツイート統計CLI
// 使い方: node scripts/twitter-stats.js [--json]
//   --json  … data/twitter-stats.json にも書き出す
// 出力: DB（notifications）の全ツイート + logs/gemma.log の分析ラベルを集計する。
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { getStats } = require("../services/twitter-stats");

const writeJson = process.argv.includes("--json");
const OUT_PATH = path.join(__dirname, "..", "data", "twitter-stats.json");
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.db");

function fmtPct(v) { return v == null ? "-" : v.toFixed(1) + "%"; }

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  const s = await getStats(db);
  db.close();

  console.log("＝ まいちゃんツイート統計 ＝");
  console.log(`期間: ${s.range.from ?? "-"} 〜 ${s.range.to ?? "-"}   総数: ${s.total} 件 (Main ${s.main} / Sub ${s.sub})`);
  console.log(`リポスト: ${s.repost}  画像付き: ${s.withImage} (${fmtPct((s.withImage / (s.total || 1)) * 100)})`);
  console.log(`平均文字数: ${s.chars.avg} / 最長: ${s.chars.max}`);
  console.log("\n▶ 時間帯（JST・投稿数 Top10）");
  const h = s.hours.map((n, i) => [i, n]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [h1, n] of h) console.log(`   ${String(h1).padStart(2)}時: ${"#".repeat(Math.min(40, Math.round((n / (h[0][1] || 1)) * 40)))} ${n}`);
  console.log("\n▶ 曜日別");
  s.weekdays.forEach((n, i) => console.log(`   ${s.weekdaysJa[i]}: ${n}`));
  console.log("\n▶ 月別投稿数");
  for (const [m, n] of Object.entries(s.months)) console.log(`   ${m}: ${n}`);
  console.log("\n▶ リンクカテゴリ率");
  for (const [k, n] of Object.entries(s.links)) console.log(`   ${k}: ${n} (${fmtPct((n / (s.total || 1)) * 100)})`);
  console.log("\n▶ フレーズ使用率");
  for (const [k, n] of Object.entries(s.phrases)) console.log(`   ${k}: ${n} (${fmtPct((n / (s.total || 1)) * 100)})`);
  if (s.tags.length) {
    console.log("\n▶ ハッシュタグ Top");
    for (const t of s.tags) console.log(`   ${t.tag}: ${t.count}`);
  }
  console.log("\n▶ Gemma/Gemini 分析ラベル");
  console.log(`   被分析: ${s.analysis.assigned}/${s.total} (${fmtPct(s.analysis.coverage)}) [data保存 ${s.analysis.fromData} + ログ照合 ${s.analysis.fromLog}]`);
  console.log(`   配信告知率(LIVE): ${fmtPct(s.analysis.liveRate)}`);
  const cats = Object.entries(s.analysis.categories).sort((a, b) => b[1] - a[1]);
  for (const [k, n] of cats) console.log(`   category ${k}: ${n}`);
  const sens = Object.entries(s.analysis.sentiment).sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sens) console.log(`   sentiment ${k}: ${n} (${fmtPct((n / (s.analysis.assigned || 1)) * 100)})`);
  console.log("\n▶ 文字数分布");
  for (const [k, n] of Object.entries(s.chars.buckets)) console.log(`   ${k}: ${n}`);

  if (writeJson) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(s, null, 2));
    console.log(`\nJSON written: ${OUT_PATH}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
