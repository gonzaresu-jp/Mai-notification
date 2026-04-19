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
  return { category: 'OTHER', status: 'NONE', start_time: null, previous_time: null, title: null, sentiment: 'NEUTRAL', confidence: 0 };
}

function validateEnum(value, validValues, defaultValue) {
  return (value && validValues.includes(value)) ? value : defaultValue;
}

function extractUrlsFromTweet(text) {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s]+/g;
  return Array.from(new Set(text.match(urlRegex) || []));
}

function extractScheduleFromAnalysis(analysis, tweetDate, urls = []) {
  if (analysis.category !== 'LIVE' || analysis.status === 'NONE' || !analysis.start_time) return null;

  const [hh, mm] = analysis.start_time.split(':').map(Number);
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
    scheduled_at: scheduleDate.toISOString(),
    url: primaryUrl,
    platform: platform,
    sentiment: analysis.sentiment,
    status: analysis.status
  };
}

module.exports = { analyzeTweet, extractScheduleFromAnalysis, extractUrlsFromTweet };