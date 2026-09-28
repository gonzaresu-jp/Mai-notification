'use strict';
// AI 呼び出しのクォータ／使用量を記録する。
//
// 背景: Gemini / Groq はレート制限ヘッダを返すのに、これまで一度も読んでいなかった
// （headers.get の利用は AI 呼び出し側にゼロ）。Cloudflare は body の usage.neurons
// のみ取得している＝唯一の成功例。そこで呼び出し毎に
//   - レート制限系ヘッダ（x-ratelimit-* / x-goog-quota-* / retry-after など）
//   - body の usage（トークン数）
//   - ステータス別カウント
// を tmp/ai_quota_state.json に蓄積する。
//
// 保存先を DB にしない理由: 既存の minutes_neurons_state.json と同じ JSON 状態方式で
// スキーマ移行が不要、書込みもデバウンス済みで呼び出し毎の IO を抑えるため。

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', 'tmp', 'ai_quota_state.json');
// レート制限に関係しうるヘッダだけ拾う（認証系ヘッダは絶対に書かない）
const QUOTA_HEADER_RE = /^(x-ratelimit|x-goog-quota|x-quota|ratelimit|retry-after|x-ai-quota)/i;
const WRITE_DEBOUNCE_MS = 2000;

let cache = null;
let cacheAt = 0;
let writeTimer = null;

function load() {
  const now = Date.now();
  // 60秒以内なら同じ内容を返す（プロセス内で複数呼び出しが連発してもIOしない）
  if (cache && now - cacheAt < 60000) return cache;
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' ? parsed : { providers: {} };
  } catch (e) {
    cache = { providers: {} };
  }
  if (!cache.providers || typeof cache.providers !== 'object') cache.providers = {};
  cacheAt = now;
  return cache;
}

function save() {
  if (writeTimer) return; // まとめて書く
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
      cache.updatedAt = new Date().toISOString();
      fs.writeFileSync(STATE_PATH, JSON.stringify(cache, null, 2), 'utf8');
      cacheAt = Date.now();
    } catch (e) {
      console.error('[ai-quota] save failed:', e.message);
    }
  }, WRITE_DEBOUNCE_MS);
  if (writeTimer.unref) writeTimer.unref();
}

function pickQuotaHeaders(res) {
  const out = {};
  try {
    const h = res && res.headers;
    if (!h) return out;
    if (typeof h.forEach === 'function') {
      h.forEach((value, key) => {
        const k = String(key || '').toLowerCase();
        if (QUOTA_HEADER_RE.test(k) && value) out[k] = String(value);
      });
    } else if (typeof h.entries === 'function') {
      for (const [key, value] of h.entries()) {
        const k = String(key || '').toLowerCase();
        if (QUOTA_HEADER_RE.test(k) && value) out[k] = String(value);
      }
    }
  } catch (e) { /* ヘッダ取得失敗は記録を諦めるだけで処理は止めない */ }
  return out;
}

/**
 * AI 呼び出し1回ぶんを記録する。
 * @param {string} provider  'gemini' | 'groq' | 'cloudflare' | 'ollama'
 * @param {object|null} res  fetch の Response（ヘッダ取得用）
 * @param {object|null} body パース済みのレスポンス body（usage 拾い用）
 * @param {object} [meta]    { usage, kind, model }
 */
function record(provider, res, body, meta = {}) {
  try {
    const state = load();
    const p = state.providers[provider] = state.providers[provider] || {
      calls: 0, statuses: {},
    };
    p.calls += 1;
    p.at = new Date().toISOString();

    const status = res && res.status ? String(res.status) : 'unknown';
    p.statuses[status] = (p.statuses[status] || 0) + 1;

    const headers = pickQuotaHeaders(res);
    if (Object.keys(headers).length) p.headers = headers;

    // OpenAI互換の usage（トークン数）
    const usage = meta.usage || (body && typeof body === 'object' ? body.usage : null);
    if (usage && typeof usage === 'object') p.usage = usage;

    if (meta.kind) p.kind = meta.kind;
    if (meta.model) p.model = meta.model;
    if (meta.error) p.lastError = String(meta.error).slice(0, 300);

    save();
    return true;
  } catch (e) {
    // 計測の失敗が本処理を止めてはいけない
    console.error('[ai-quota] record failed:', e.message);
    return false;
  }
}

function read() {
  return load();
}

module.exports = { record, read, STATE_PATH };
