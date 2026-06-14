const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'gemma.log');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function writeLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const msg = args.map(arg => (arg instanceof Error ? (arg.stack || arg.message) : (typeof arg === 'object' ? JSON.stringify(arg) : arg))).join(' ');
  const logLine = `[${timestamp}] [${level}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, logLine); } catch (e) { }
}

const gemmaLogger = {
  log: (...args) => { console.log(...args); writeLog('INFO', ...args); },
  warn: (...args) => { console.warn(...args); writeLog('WARN', ...args); },
  error: (...args) => { console.error(...args); writeLog('ERROR', ...args); }
};

// --- elzaサーバー (Linux / CPU) 向け設定 ---
const SERVER_ENDPOINT = process.env.LLAMA_SERVER_ENDPOINT || 'http://localhost:8081/v1/chat/completions';
const MODEL = 'gemma-4-E4B-it-Q3_K_M';
const REQUEST_TIMEOUT = 180000; // CPU駆動のため、余裕を持って3分
const RETRY_TIMES = 3;
const RETRY_DELAY_MS = 1500;

/**
 * llama-server へのリクエストを実行
 */
async function callLlamaServer(prompt, retries = RETRY_TIMES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(SERVER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: "あなたはツイート解析AIです。JSON形式でのみ回答してください。" },
            { role: "user", content: prompt }
          ],
          temperature: 0.1,
          extra_body: { "think": false } // 思考出力を抑制
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(1.5, attempt);
        gemmaLogger.warn(`[Llama] リトライ ${attempt + 1}/${retries}: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }
  throw lastError;
}

/**
 * ツイート分析メインロジック
 */
async function analyzeTweet(tweetText) {
  if (!tweetText) return getFallbackResult();

  const prompt = `以下のツイートから情報を抽出してください。

【カテゴリ】(必須: いずれか1つ)
- LIVE: 配信開始・配信予告・配信予定に関するツイート
- NEWS: お知らせ・更新・発表
- PROMOTION: 宣伝・告知
- REPOST: RT・引用リツイート
- MORNING: おはようツイート
- DAILY: 日常・雑談
- OTHER: 上記以外

【配信状態 status】(必須: いずれか1つ)
- LIVE_NOW: 「今から配信します」「配信スタート」など、今すぐ始まることを示す
- LIVE_SOON: 「〇〇時から配信します」「今夜〇時〜」など、近い将来の配信予告
- TIME_CHANGE: 「〇〇時だったが〇〇時に変更」など、時刻変更の告知
- NONE: 配信に関係ない、または時刻が全く分からない

【start_time】
- ツイートに具体的な時刻があれば HH:MM 形式で抽出（例: "21:00"）
- 時刻が不明または配信と無関係なら null

【time_period】(具体的な時刻が無い配信予告のときの時間帯)
- 「今夜」「夜」など → "NIGHT"
- 「深夜」「真夜中」など → "LATE_NIGHT"
- 「夕方」など → "EVENING"
- 「お昼」「昼」「ごご」「午後」など → "NOON"
- 「朝」「午前」など → "MORNING"
- 時間帯が分からない、または配信と無関係なら null

【previous_time】
- 時刻変更の場合、変更前の時刻を HH:MM 形式で抽出
- なければ null

【title】
- ツイートに明示されている配信タイトル・企画名があれば抽出（例: "雑談配信"、"歌枠"）
- タイトルが分からない場合は null

【sentiment】
- POSITIVE: 喜び・興奮・感謝
- NEUTRAL: 普通の報告・お知らせ
- NEGATIVE: 謝罪・延期・中止

【confidence】
- 分析の確信度 0.0〜1.0

出力は以下のJSON形式のみで回答してください。説明文は不要です:
{
  "category": "",
  "status": "",
  "start_time": null,
  "time_period": null,
  "previous_time": null,
  "title": null,
  "sentiment": "",
  "confidence": 0.0
}

ツイート:
${tweetText}`;

  try {
    // ツイート本文は最大100文字で省略プレビューにし、[1234Z] [INFO] [Gemma] Analyzing tweet: で出力
    const previewText = tweetText.length > 100 ? tweetText.substring(0, 100) + '...' : tweetText;
    gemmaLogger.log(`[Gemma] Analyzing tweet: ${previewText}`);
    
    const response = await callLlamaServer(prompt);

    // コードブロック記法 (```json ... ```) を除去してからJSONを抽出
    const cleaned = response
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '');

    // 最初の { から対応する } までを正確に取り出す（ネスト対応）
    let jsonStr = null;
    const start = cleaned.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        else if (cleaned[i] === '}') {
          depth--;
          if (depth === 0) {
            jsonStr = cleaned.slice(start, i + 1);
            break;
          }
        }
      }
    }

    if (!jsonStr) {
      gemmaLogger.error('[Gemma] JSON not found in response. raw:', response.slice(0, 300));
      return getFallbackResult();
    }

    const result = JSON.parse(jsonStr);
    
    // 分析結果をそのままJSON形式で出力
    gemmaLogger.log(`[Gemma] Analysis result: ${JSON.stringify(result)}`);

    return {
      category: validateEnum(result.category, ['LIVE', 'NEWS', 'PROMOTION', 'REPOST', 'MORNING', 'DAILY', 'OTHER'], 'OTHER'),
      status: validateEnum(result.status, ['LIVE_NOW', 'LIVE_SOON', 'TIME_CHANGE', 'NONE'], 'NONE'),
      start_time: result.start_time || null,
      time_period: validateEnum(result.time_period, ['MORNING', 'NOON', 'EVENING', 'NIGHT', 'LATE_NIGHT'], null),
      previous_time: result.previous_time || null,
      title: result.title || null,
      sentiment: validateEnum(result.sentiment, ['POSITIVE', 'NEUTRAL', 'NEGATIVE'], 'NEUTRAL'),
      confidence: Math.min(1, Math.max(0, parseFloat(result.confidence) || 0))
    };
  } catch (err) {
    gemmaLogger.error('[Gemma] Analysis failed:', err.message);
    return getFallbackResult();
  }
}

// --- 補助関数群（元のロジックを完全維持） ---

function getFallbackResult() {
  return { category: 'OTHER', status: 'NONE', start_time: null, time_period: null, previous_time: null, title: null, sentiment: 'NEUTRAL', confidence: 0 };
}

function validateEnum(value, validValues, defaultValue) {
  return (value && validValues.includes(value)) ? value : defaultValue;
}

function extractUrlsFromTweet(text) {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s]+/g;
  return Array.from(new Set(text.match(urlRegex) || []));
}

// 時刻未定の配信予告で使う、時間帯ごとの既定時刻（必要に応じて編集可）。
// 環境変数 PERIOD_TIMES（例: "NIGHT=22:00,NOON=12:00"）で上書き可能。
const PERIOD_DEFAULT_TIMES = {
  MORNING:    '09:00', // 朝・午前
  NOON:       '12:00', // 昼・ごご・午後
  EVENING:    '18:00', // 夕方
  NIGHT:      '22:00', // 夜・今夜
  LATE_NIGHT: '23:00', // 深夜
};
(function applyPeriodTimeOverrides() {
  const raw = process.env.PERIOD_TIMES;
  if (!raw) return;
  for (const pair of raw.split(',')) {
    const [k, v] = pair.split('=').map(s => (s || '').trim());
    if (k && /^\d{1,2}:\d{2}$/.test(v) && k in PERIOD_DEFAULT_TIMES) {
      PERIOD_DEFAULT_TIMES[k] = v;
    }
  }
})();

/**
 * ツイート本文から時間帯を推定する（Gemma の time_period が空のときのフォールバック）。
 * 配信予告という前提で呼ばれるため、汎用的な「夜」等もマッチさせる。
 */
function detectPeriodFromText(text) {
  if (!text) return null;
  if (/深夜|真夜中/.test(text)) return 'LATE_NIGHT';
  if (/今夜|今晩|夜の部|夜から|夜に|ナイト|tonight/i.test(text)) return 'NIGHT';
  if (/夕方|夕刻|イブニング/.test(text)) return 'EVENING';
  if (/お昼|ごご|ごごまい|正午|午後|ランチ|昼/.test(text)) return 'NOON';
  if (/午前|モーニング|朝/.test(text)) return 'MORNING';
  return null;
}

// Date → "YYYY-MM-DDTHH:MM:SS"（ローカル=JST、UTC変換なし）。管理画面の保存形式と揃える。
function formatNaiveLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function extractScheduleFromAnalysis(analysis, tweetDate, urls = [], tweetText = '') {
  if (analysis.category !== 'LIVE' || analysis.status === 'NONE') return null;

  // 具体的な時刻があればそれを使う。無ければ時間帯を解決し、
  // 曜日配置・並び順のための代表時刻（PERIOD_DEFAULT_TIMES）を内部的に当てる。
  // 画面表示は time_period（"夜"等）で行うため、この代表時刻は表示されない。
  let timeStr = analysis.start_time;
  let resolvedPeriod = null;
  if (!timeStr) {
    const period = analysis.time_period || detectPeriodFromText(tweetText);
    if (period && PERIOD_DEFAULT_TIMES[period]) {
      timeStr = PERIOD_DEFAULT_TIMES[period];
      resolvedPeriod = period;
    }
  }
  if (!timeStr) return null; // 具体時刻も時間帯も取れない → 登録しない（従来通り）
  const timeEstimated = !!resolvedPeriod;

  const [hh, mm] = timeStr.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;

  const scheduleDate = new Date(tweetDate);
  scheduleDate.setHours(hh, mm, 0, 0);
  if (scheduleDate < tweetDate) scheduleDate.setDate(scheduleDate.getDate() + 1);

  const isYouTube = urls.some(u => u.includes('youtube.com') || u.includes('youtu.be')) || 
                    (analysis.title && (analysis.title.toLowerCase().includes('youtube') || analysis.title.includes('待機所')));
  if (isYouTube) return null;

  let primaryUrl = urls.find(u => u.includes('twitch.tv')) || urls.find(u => u.includes('twitcasting.tv')) || urls[0] || null;
  let platform = primaryUrl ? (primaryUrl.includes('twitch') ? 'twitch' : (primaryUrl.includes('twitcasting') ? 'twitcasting' : 'twitter')) : 'twitter';

  return {
    title: analysis.title || (analysis.status === 'LIVE_NOW' ? 'ライブ配信中' : '配信予定'),
    // ナイーブJST文字列で保存（管理画面と同形式）。toISOString()のUTC保存は
    // 曜日配置・時刻表示が9時間ずれる原因になるため使わない。TZ=Asia/Tokyo前提。
    scheduled_at: formatNaiveLocal(scheduleDate),
    url: primaryUrl,
    platform: platform,
    sentiment: analysis.sentiment,
    status: analysis.status,
    time_estimated: timeEstimated,
    time_period: resolvedPeriod // "NIGHT"等。具体時刻ありなら null（時刻表示）
  };
}

// 時間帯（NIGHT等）→ 代表時刻（HH:MM）。未知なら null。
function periodToTime(period) {
  if (typeof period !== 'string') return null;
  return PERIOD_DEFAULT_TIMES[period.toUpperCase()] || null;
}

module.exports = { analyzeTweet, extractScheduleFromAnalysis, extractUrlsFromTweet, periodToTime, PERIOD_DEFAULT_TIMES };