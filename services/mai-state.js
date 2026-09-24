// まいちゃんの「活動の傾向」推定（管理画面 まいAI タブ用）
//
// 入力:
//   - notifications: ツイート（twitterMain/Sub）と配信開始通知（twitcasting / twitch / youtube【ライブ】）
//   - 配信アーカイブ API（nassy :8766 /api/videos）: YouTube のライブアーカイブ（2021〜、開始時刻と長さ）
//   - events: これからの配信予定
//   - ツイートの分析ラベル（sentiment / category）: twitter-stats.js と同じ照合で付与
//
// 出力は「推定・参考値」。本人の公開投稿の量やタイミングから、ふだんとの違いを数字にしたもの。
"use strict";

const twStats = require("./twitter-stats");

const ARCHIVE_API_BASE = (process.env.ARCHIVE_API_BASE || "http://192.168.1.70:8766").replace(/\/+$/, "");
const DAY = 86400_000;
const WEEK = 7 * DAY;
const PLATFORMS = ["youtube", "twitcasting", "twitch"];
const PLATFORM_LABEL = { youtube: "YouTube", twitcasting: "ツイキャス", twitch: "Twitch" };
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];
// 体調に関係しそうな言葉（本人ツイート内）。「おやすみ」と区別するため「お休み」は告知の言い回しに限定
const HEALTH_RE = /体調|風邪|発熱|熱が|喉|のど(が|の調子)|咳|病院|頭痛|腹痛|しんどい|休養|寝込|声が出な|声枯|お休み(します|させて|いただ|になります)|延期|中止/;

const CACHE_MS = 30 * 60 * 1000;
let cache = null;

// ---------------------------------------------------------------- 時刻ユーティリティ（JST）
function utcToMs(s) {
  const d = new Date(String(s).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s)) ? "" : "Z"));
  return d.getTime();
}
function jstToMs(s) { // "YYYY-MM-DD HH:mm:ss"（JST）
  return new Date(String(s).replace(" ", "T") + "+09:00").getTime();
}
function jst(ms) {
  const j = new Date(ms + 9 * 3600_000);
  return { weekday: j.getUTCDay(), hour: j.getUTCHours(), dateKey: j.toISOString().slice(0, 10) };
}
// 配信の「日」は朝5時区切り（深夜0〜4時の配信は前日の枠として数える）
function streamDay(ms) { const d = jst(ms - 5 * 3600_000); return { weekday: d.weekday, dateKey: d.dateKey, hour: jst(ms).hour }; }
function jstDayStart(ms) { // その日の JST 0:00
  const j = new Date(ms + 9 * 3600_000);
  return Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - 9 * 3600_000;
}
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- データ取得
function dbAll(db, sql, params = []) {
  return new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err ? [] : rows || [])));
}

async function fetchYoutubeArchive() {
  const out = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(`${ARCHIVE_API_BASE}/api/videos?limit=100&offset=${offset}&sort=stream_at_desc`, { signal: ac.signal });
      if (!r.ok) break;
      const d = await r.json();
      for (const v of d.videos || []) {
        if (v.kind === "live_archive" && v.stream_at_jst) {
          out.push({ platform: "youtube", ms: jstToMs(v.stream_at_jst), durationSec: v.duration_sec || null, id: v.video_id });
        }
      }
      if (!d.videos || d.videos.length < 100) break;
    } catch {
      break;
    } finally {
      clearTimeout(t);
    }
  }
  return out;
}

/** 配信開始の一覧 [{platform, ms, durationSec}]。同じプラットフォームで 90 分以内の再開始は 1 回とみなす */
async function loadStreams(db) {
  const rows = await dbAll(db,
    `SELECT platform, title, url, created_at FROM notifications
      WHERE (platform='twitcasting' AND title LIKE '%ライブ%')
         OR (platform='twitch' AND title LIKE '%配信を開始%')
         OR (platform='youtube' AND title='【ライブ】')
      ORDER BY created_at ASC`);
  const archive = await fetchYoutubeArchive();
  const archiveIds = new Set(archive.map((a) => a.id));
  const list = [...archive];
  for (const r of rows) {
    const m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(r.url || "");
    if (r.platform === "youtube" && m && archiveIds.has(m[1])) continue; // アーカイブ側にある
    list.push({ platform: r.platform, ms: utcToMs(r.created_at), durationSec: null, id: m ? m[1] : null });
  }
  list.sort((a, b) => a.ms - b.ms);
  const merged = [];
  const lastBy = {};
  for (const s of list) {
    const prev = lastBy[s.platform];
    if (prev && s.ms - prev.ms < 90 * 60 * 1000) continue;
    merged.push(s);
    lastBy[s.platform] = s;
  }
  return { streams: merged, archiveOk: archive.length > 0 };
}

async function loadTweets(db) {
  const rows = await dbAll(db,
    `SELECT body, created_at, platform, tweet_id, image, title, url, data FROM notifications
      WHERE platform IN ("twitterMain","twitterSub") ORDER BY created_at ASC`);
  const labeled = twStats.labelRows(rows, twStats.parseGemmaLog());
  return labeled.map((r) => ({ ...r, ms: utcToMs(r.created_at) })).filter((r) => Number.isFinite(r.ms));
}

// ---------------------------------------------------------------- 集計
function weekdayPlatform(streams, fromMs, toMs) {
  const counts = WEEKDAYS_JA.map(() => Object.fromEntries(PLATFORMS.map((p) => [p, 0])));
  const hours = Object.fromEntries(PLATFORMS.map((p) => [p, new Array(24).fill(0)]));
  const weeks = Math.max(1, (toMs - fromMs) / WEEK);
  const daysWithStream = WEEKDAYS_JA.map(() => new Set());
  for (const s of streams) {
    if (s.ms < fromMs || s.ms > toMs || !PLATFORMS.includes(s.platform)) continue;
    const { weekday, hour, dateKey } = streamDay(s.ms);
    counts[weekday][s.platform]++;
    hours[s.platform][hour]++;
    daysWithStream[weekday].add(dateKey);
  }
  const rows = WEEKDAYS_JA.map((label, i) => {
    const total = PLATFORMS.reduce((a, p) => a + counts[i][p], 0);
    const top = PLATFORMS.reduce((best, p) => (counts[i][p] > (counts[i][best] || 0) ? p : best), PLATFORMS[0]);
    return {
      weekday: i, label, total, byPlatform: counts[i],
      streamRate: round(Math.min(1, daysWithStream[i].size / weeks), 2), // その曜日に配信があった週の割合
      topPlatform: total ? top : null,
    };
  });
  return { rows, hours, weeks: round(weeks, 1), from: jst(fromMs).dateKey, to: jst(toMs).dateKey };
}

function weeklySeries(streams, tweets, nowMs, nWeeks) {
  const end = jstDayStart(nowMs) + DAY;
  const out = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const to = end - i * WEEK, from = to - WEEK;
    const ss = streams.filter((s) => s.ms >= from && s.ms < to);
    const tw = tweets.filter((t) => t.ms >= from && t.ms < to && t.platform === "twitterMain");
    const senti = tw.filter((t) => t.sentiment);
    const pos = senti.filter((t) => t.sentiment === "POSITIVE").length;
    const neg = senti.filter((t) => t.sentiment === "NEGATIVE").length;
    const late = tw.filter((t) => { const h = jst(t.ms).hour; return h >= 1 && h < 6; }).length;
    const health = tw.filter((t) => HEALTH_RE.test(t.body || "")).length;
    out.push({
      weekStart: new Date(from + 9 * 3600_000).toISOString().slice(0, 10),
      streams: ss.length,
      streamHours: round(ss.reduce((a, s) => a + (s.durationSec || 0), 0) / 3600, 1),
      byPlatform: Object.fromEntries(PLATFORMS.map((p) => [p, ss.filter((s) => s.platform === p).length])),
      tweets: tw.length,
      sentiment: senti.length ? round((pos - neg) / senti.length, 2) : null,
      sentimentN: senti.length,
      lateNightRate: tw.length ? round(late / tw.length, 2) : null,
      health,
    });
  }
  return out;
}

/** 直近2週と、その前の12週（ふだん）を比べて指標にする */
function currentState(series, tweets, nowMs) {
  const recent = series.slice(-2), base = series.slice(-14, -2);
  const avg = (arr, k) => { const v = arr.map((w) => w[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const ratio = (k) => {
    const b = median(base.map((w) => w[k]).filter((x) => x != null));
    const r = avg(recent, k);
    return b > 0 && r != null ? round(r / b, 2) : null;
  };
  const streamRatio = ratio("streams");
  const tweetRatio = ratio("tweets");
  const sentiRecent = avg(recent, "sentiment");
  const sentiBase = avg(base, "sentiment");
  const sentiDelta = sentiRecent != null && sentiBase != null ? round(sentiRecent - sentiBase, 2) : null;
  const lateRecent = avg(recent, "lateNightRate");
  const lateBase = avg(base, "lateNightRate");

  // 配信意欲（0〜100）: 配信頻度 50% / ツイート量 20% / 感情 30%。ふだん並みで 60 前後
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sStream = streamRatio == null ? 0.5 : clamp(streamRatio / 1.5, 0, 1);
  const sTweet = tweetRatio == null ? 0.5 : clamp(tweetRatio / 1.5, 0, 1);
  const sSenti = sentiDelta == null ? 0.5 : clamp(0.5 + sentiDelta, 0, 1);
  const motivation = Math.round((sStream * 0.5 + sTweet * 0.2 + sSenti * 0.3) * 100);

  // 体調サイン: 体調関連ワード・深夜投稿の増加・ネガティブ化の3つを数える
  const since = nowMs - 14 * DAY;
  const healthTweets = tweets.filter((t) => t.platform === "twitterMain" && t.ms >= since && HEALTH_RE.test(t.body || ""));
  const healthBase = median(base.map((w) => w.health)) * 2;
  const signals = [];
  if (healthTweets.length >= Math.max(2, healthBase + 2)) signals.push(`体調に関する言葉が増えています（直近2週 ${healthTweets.length}件 / ふだん ${round(healthBase, 1)}件）`);
  if (lateRecent != null && lateBase != null && lateRecent - lateBase >= 0.1) signals.push(`深夜(1〜5時)の投稿が増えています（${Math.round(lateRecent * 100)}% / ふだん ${Math.round(lateBase * 100)}%）`);
  if (sentiDelta != null && sentiDelta <= -0.25) signals.push(`ツイートの感情がふだんよりネガティブ寄りです（${sentiDelta >= 0 ? "+" : ""}${sentiDelta}）`);
  if (streamRatio != null && streamRatio <= 0.5) signals.push(`配信の頻度がふだんの半分以下です（×${streamRatio}）`);
  const condition = signals.length >= 2 ? "注意" : signals.length === 1 ? "ややサインあり" : "いつも通り";

  return {
    motivation, condition, signals,
    streamRatio, tweetRatio, sentimentRecent: sentiRecent != null ? round(sentiRecent, 2) : null,
    sentimentBase: sentiBase != null ? round(sentiBase, 2) : null, sentimentDelta: sentiDelta,
    lateNightRecent: lateRecent != null ? round(lateRecent, 2) : null, lateNightBase: lateBase != null ? round(lateBase, 2) : null,
    healthTweets: healthTweets.slice(-5).reverse().map((t) => ({ date: jst(t.ms).dateKey, text: String(t.body || "").slice(0, 80) })),
  };
}

/** 今日から7日間の配信見込み（曜日ごとの実績 × いまの活動量。予定があればそれを優先） */
function forecast(streams, events, state, nowMs) {
  const from = nowMs - 12 * WEEK;
  const recent = streams.filter((s) => s.ms >= from);
  const weeks = 12;
  const activity = state.streamRatio == null ? 1 : Math.max(0.5, Math.min(1.3, state.streamRatio));
  const byWd = WEEKDAYS_JA.map(() => ({ days: new Set(), plat: {}, hours: [] }));
  for (const s of recent) {
    const { weekday, hour, dateKey } = streamDay(s.ms);
    byWd[weekday].days.add(dateKey);
    byWd[weekday].plat[s.platform] = (byWd[weekday].plat[s.platform] || 0) + 1;
    byWd[weekday].hours.push(hour < 5 ? hour + 24 : hour); // 深夜は前日の続きとして扱う
  }
  const today = jstDayStart(nowMs);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayMs = today + i * DAY;
    const { weekday, dateKey } = jst(dayMs + 3600_000);
    const w = byWd[weekday];
    const base = Math.min(1, w.days.size / weeks);
    const planned = events.filter((e) => streamDay(e.ms).dateKey === dateKey);
    const topPlat = Object.entries(w.plat).sort((a, b) => b[1] - a[1])[0];
    const h = w.hours.length ? Math.round(median(w.hours)) % 24 : null;
    days.push({
      date: dateKey, weekday, label: WEEKDAYS_JA[weekday],
      probability: planned.length ? 0.95 : round(Math.min(0.95, base * activity), 2),
      platform: planned.length ? planned[0].platform : (topPlat ? topPlat[0] : null),
      hour: planned.length ? jst(planned[0].ms).hour : h,
      planned: planned.map((e) => ({ title: e.title, platform: e.platform, hour: jst(e.ms).hour })),
    });
  }
  return days;
}

async function compute(db) {
  const now = Date.now();
  const [{ streams, archiveOk }, tweets, evRows] = await Promise.all([
    loadStreams(db), loadTweets(db),
    dbAll(db, `SELECT title, start_time, platform FROM events WHERE status IN ('scheduled','live') AND datetime(start_time) >= datetime('now','-1 day') ORDER BY start_time`),
  ]);
  const events = evRows.map((e) => ({ ...e, ms: new Date(String(e.start_time).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(e.start_time) ? "" : "+09:00")).getTime() }))
    .filter((e) => Number.isFinite(e.ms) && e.ms >= jstDayStart(now));
  const series = weeklySeries(streams, tweets, now, 26);
  const state = currentState(series, tweets, now);
  // 曜日×プラットフォーム: ツイキャス/Twitch の通知ログがそろっている期間（最初の通知以降）で集計
  const logStart = Math.min(...streams.filter((s) => s.platform !== "youtube").map((s) => s.ms), now);
  return {
    generated_at: new Date(now).toISOString(),
    note: "公開されている配信・ツイートの量とタイミングから、ふだんとの違いを数字にした推定値です（診断ではありません）",
    sources: { streams: streams.length, tweets: tweets.length, youtubeArchive: archiveOk, platformLogSince: jst(logStart).dateKey },
    platforms: PLATFORMS.map((p) => ({ id: p, label: PLATFORM_LABEL[p] })),
    state,
    forecast: forecast(streams, events, state, now),
    weekly: series,
    weekdayPlatform: {
      recent: weekdayPlatform(streams, now - 13 * WEEK, now),      // 直近3か月
      sinceLog: weekdayPlatform(streams, logStart, now),           // 全プラットフォームのログがある期間
      youtubeAll: weekdayPlatform(streams.filter((s) => s.platform === "youtube"), streams[0] ? streams[0].ms : now, now), // YouTube 全期間
    },
  };
}

async function getMaiState(db, { force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await compute(db);
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { getMaiState, HEALTH_RE };
