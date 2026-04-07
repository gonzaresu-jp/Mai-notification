// gemma-analyzer.js - Ollama Gemma4 を使用したツイート分析モジュール

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'gemma.log');

// logsディレクトリがなければ作成
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function writeLog(level, ...args) {
  const timestamp = new Date().toISOString();
  // エラーオブジェクトなどもJSON化しつつ、文字列はそのまま出力するよう少し工夫
  const msg = args.map(arg => {
    if (arg instanceof Error) {
      return arg.stack || arg.message;
    } else if (typeof arg === 'object') {
      return JSON.stringify(arg);
    }
    return arg;
  }).join(' ');
  
  const logLine = `[${timestamp}] [${level}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    // ログ記録エラー時はフォールバック
  }
}

const gemmaLogger = {
  log: (...args) => {
    console.log(...args);
    writeLog('INFO', ...args);
  },
  warn: (...args) => {
    console.warn(...args);
    writeLog('WARN', ...args);
  },
  error: (...args) => {
    console.error(...args);
    writeLog('ERROR', ...args);
  }
};

// const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
// const MODEL = process.env.OLLAMA_MODEL || 'yinw1590/gemma4-e2b-text'; // Gemma4 E2B model
// const REQUEST_TIMEOUT = 60000; // 60秒（思考時間のため延長）
// const RETRY_TIMES = 2;
// const RETRY_DELAY_MS = 500;

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
const MODEL = process.env.OLLAMA_MODEL || 'yinw1590/gemma4-e2b-text'; // Gemma4 E2B model
const REQUEST_TIMEOUT = 120000; // 120秒（Gemma初期化・思考時間対応）
const INITIAL_RETRY_TIMES = 5; // 初回は最多5回リトライ
const RETRY_TIMES = 3;
const RETRY_DELAY_MS = 1000; // 1秒ごと

/**
 * Ollamaへのリクエストを実行（タイムアウト＆リトライ付き）
 * @param {string} prompt - プロンプト
 * @param {number} retries - リトライ回数（デフォルト: RETRY_TIMES）
 * @returns {Promise<string>} - モデルの応答テキスト
 */
async function callOllama(prompt, retries = RETRY_TIMES) {
  let lastError;
  const maxRetries = retries;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(OLLAMA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt: prompt,
          stream: false,
          temperature: 0.1, // 低温：一貫性重視
          top_p: 0.9
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama responded with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.response) {
        throw new Error('No response field from Ollama');
      }

      return data.response.trim();
    } catch (err) {
      lastError = err;
      const isTimeout = err.name === 'AbortError' || err.message.includes('abort');
      const isConnectionError = err.message.includes('ECONNREFUSED') ||
        err.message.includes('EHOSTUNREACH') ||
        err.message.includes('ENOTFOUND') ||
        err.message.includes('network timeout') ||
        err.message.includes('connection');

      if (isTimeout || isConnectionError) {
        const isFirstAttempt = attempt === 0;
        gemmaLogger.warn(`[Ollama] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${err.message}${isFirstAttempt ? ' (初回は遅延する場合があります)' : ''}`);
        if (attempt < maxRetries) {
          const delay = RETRY_DELAY_MS * Math.pow(1.5, attempt); // 指数バックオフ
          gemmaLogger.warn(`[Ollama] ${Math.round(delay)}ms 待機してリトライ...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      throw err;
    }
  }

  throw lastError;
}

/**
 * ツイートテキストを Gemma4 で分析
 * @param {string} tweetText - ツイートテキスト
 * @returns {Promise<Object>} - 分析結果JSON
 */
async function analyzeTweet(tweetText) {
  if (!tweetText) {
    return {
      category: 'OTHER',
      status: 'NONE',
      start_time: null,
      previous_time: null,
      title: null,
      sentiment: 'NEUTRAL',
      confidence: 0
    };
  }

  const systemPrompt = `あなたはツイート解析AIです。
以下のツイートから情報を抽出してください。

抽出項目:

1. カテゴリ
   (LIVE / NEWS / PROMOTION / REPOST / MORNING / DAILY / OTHER)

2. 配信状態
   (LIVE_NOW / LIVE_SOON / TIME_CHANGE / NONE)

3. 配信開始時刻
   (24時間表記 HH:MM / 不明なら null)

4. 変更前時刻
   (ある場合のみ / なければ null)

5. 感情
   (POSITIVE / NEUTRAL / NEGATIVE)

6. 配信タイトル（任意）
   (配信のタイトルや内容、ゲーム名などが推測できる場合。不明なら null)

7. 信頼度
   (0〜1)

判断基準:

カテゴリ:
- 配信関連 → LIVE
- お知らせ / 更新 / 発表 → NEWS
- 宣伝 / 告知 / 商品紹介 → PROMOTION
- RT / 引用RT → REPOST
- おはよう / 朝の挨拶 → MORNING
- 日常 / 雑談 → DAILY
- その他 → OTHER

配信状態:
- 配信始まった → LIVE_NOW
- ○時から配信 → LIVE_SOON
- 時間変更 → TIME_CHANGE
- 配信関係なし → NONE

感情:
- 楽しい / 嬉しい / 来てね → POSITIVE
- 普通の情報 → NEUTRAL
- 体調不良 / 不安 / ごめん → NEGATIVE

出力形式（JSONのみ）:

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
    gemmaLogger.log('[Gemma] Analyzing tweet:', tweetText.substring(0, 80) + '...');

    // 初回呼び出しは より多くのリトライを行う（Ollama初期化時間を考慮）
    let response;
    try {
      response = await callOllama(systemPrompt, INITIAL_RETRY_TIMES);
    } catch (err) {
      gemmaLogger.warn('[Gemma] 初回分析失敗、リトライ回数を減らして再試行:', err.message);
      response = await callOllama(systemPrompt, RETRY_TIMES);
    }

    // JSON抽出（```json ... ```ブロックまたは直接JSON）
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr);

    // バリデーション
    const validated = {
      category: validateEnum(result.category, ['LIVE', 'NEWS', 'PROMOTION', 'REPOST', 'MORNING', 'DAILY', 'OTHER'], 'OTHER'),
      status: validateEnum(result.status, ['LIVE_NOW', 'LIVE_SOON', 'TIME_CHANGE', 'NONE'], 'NONE'),
      start_time: result.start_time || null,
      previous_time: result.previous_time || null,
      title: result.title || null,
      sentiment: validateEnum(result.sentiment, ['POSITIVE', 'NEUTRAL', 'NEGATIVE'], 'NEUTRAL'),
      confidence: Math.min(1, Math.max(0, parseFloat(result.confidence) || 0))
    };

    gemmaLogger.log('[Gemma] Analysis result:', validated);
    return validated;
  } catch (err) {
    gemmaLogger.error('[Gemma] Analysis failed:', err.message);
    gemmaLogger.error('[Gemma] Response was:', err.response || '(no response)');

    // フォールバック：エラー時は NEUTRAL 結果を返す
    return {
      category: 'OTHER',
      status: 'NONE',
      start_time: null,
      previous_time: null,
      title: null,
      sentiment: 'NEUTRAL',
      confidence: 0
    };
  }
}

/**
 * 列挙値を検証する
 */
function validateEnum(value, validValues, defaultValue) {
  if (value && validValues.includes(value)) return value;
  return defaultValue;
}

/**
 * ツイートテキストからURL を抽出
 * @param {string} text - ツイートテキスト
 * @returns {Array<string>} - 抽出されたURL配列
 */
function extractUrlsFromTweet(text) {
  if (!text) return [];

  // URL正規表現（http/https）
  const urlRegex = /https?:\/\/[^\s]+/g;
  const matches = text.match(urlRegex) || [];

  // 重複を除去
  return Array.from(new Set(matches));
}

/**
 * 分析結果からスケジュール情報を抽出
 * @param {Object} analysis - 分析結果
 * @param {Date} tweetDate - ツイート投稿日時
 * @param {Array<string>} urls - ツイートに含まれるURL
 * @returns {Object|null} - スケジュール作成情報、またはnull（作成不要の場合）
 */
function extractScheduleFromAnalysis(analysis, tweetDate, urls = []) {
  // 配信関連でない、または配信情報がないのなら null
  if (analysis.category !== 'LIVE' || analysis.status === 'NONE') {
    return null;
  }

  // 時刻がない場合は スケジュール作成できない
  if (!analysis.start_time) {
    return null;
  }

  // HH:MM → 本日の DateTime に変換
  const [hh, mm] = analysis.start_time.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) {
    return null;
  }

  const scheduleDate = new Date(tweetDate);
  scheduleDate.setHours(hh, mm, 0, 0);

  // 過去時刻の場合は、翌日に設定
  if (scheduleDate < tweetDate) {
    scheduleDate.setDate(scheduleDate.getDate() + 1);
  }

  // YouTube のURLが含まれる場合は、youtube.js が自動取得するためGemma側では作成しない
  const isYouTube = urls.some(u => u.includes('youtube.com') || u.includes('youtu.be'));
  if (isYouTube) {
    gemmaLogger.log('[Gemma] YouTube URL found in tweet, skipping schedule creation because youtube.js will handle it.');
    return null;
  }

  // TwitchやツイキャスのURLを飛ぶリンク先として設定する
  let primaryUrl = null;
  let platform = 'twitter'; // デフォルト

  const twitchUrl = urls.find(u => u.includes('twitch.tv'));
  const twitcasUrl = urls.find(u => u.includes('twitcasting.tv'));

  if (twitchUrl) {
    primaryUrl = twitchUrl;
    platform = 'twitch';
  } else if (twitcasUrl) {
    primaryUrl = twitcasUrl;
    platform = 'twitcasting';
  } else {
    primaryUrl = urls[0] || null;
  }

  const scheduleTitle = analysis.title ? `${analysis.title}` : '配信予定';

  return {
    title: scheduleTitle,
    scheduled_at: scheduleDate.toISOString(),
    url: primaryUrl,
    platform: platform,
    urls: urls, // 全URL
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    status: analysis.status
  };
}

module.exports = {
  analyzeTweet,
  extractScheduleFromAnalysis,
  extractUrlsFromTweet
};
