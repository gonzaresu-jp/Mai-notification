// historyService.js - 履歴表示管理(JSON優先版)
import { API, PAGING, getClientId, normalizePlatformName } from './config.js';

// =========================
// JSONキャッシュ
// =========================
const jsonCache = {
  data: null,
  timestamp: 0,
  ttl: 5000, // 5秒
  limit: 50  // JSONの最大件数 (server.jsのHISTORY_JSON_LIMITと合わせる)
};

// =========================
// SSE（任意）: サーバが対応しているなら UI を自動更新
// =========================
export function setupHistorySse($logsEl, $statusEl) {
  const es = new EventSource('/api/history/stream');

  es.addEventListener('message', (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      if (payload && payload.type === 'history-updated') {
        clearJsonCache();
        PAGING.offset = 0;
        PAGING.hasMore = true;
        fetchHistory($logsEl, $statusEl, { append: false, useCache: false });
      }
    } catch (err) {
      console.warn('[History SSE] Invalid payload', err);
    }
  });

  es.addEventListener('error', () => {
    console.warn('[History SSE] disconnected or error');
  });

  return es;
}

// =========================
// HTMLエスケープユーティリティ
// =========================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * URLをユーザー指定のテンプレートに基づいて変換する
 * @param {string} url 元のURL
 * @param {string} platform プラットフォーム名
 * @returns {string} 変換後のURL
 */
function transformUrl(url, platform) {
  if (!url) return url;
  
  let settings;
  try {
    const raw = localStorage.getItem('platformSettings');
    settings = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return url;
  }
  
  if (!settings || !settings.customLinks) return url;

  // normalizePlatformName は config.js からインポート済み
  const p = normalizePlatformName(platform || '').toLowerCase();
  
  const mapping = {
    'twitcasting': 'twitcasting',
    'youtube': 'youtube',
    'twitch': 'twitch',
    'twitter': 'twitter',
    'fanbox': 'other',
    'pixiv': 'other',
    'gipt': 'other',
    'bilibili': 'other',
    'milestone': 'other',
    'schedule': 'other'
  };

  const linkKey = mapping[p] || 'other';
  const template = settings.customLinks[linkKey];

  if (!template || !template.trim() || !template.includes('{url}')) {
    return url;
  }

  return template.replace(/\{url\}/g, url);
}

// =========================
// UI生成
// =========================
export function createLogItem(log) {
  const date = new Date((log.timestamp || 0) * 1000);
  const dateStr = date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo'
  });

  const iconHtml = log.icon
    ? `<img src="${escapeHtml(log.icon)}" alt="icon" class="icon" loading="lazy" />`
    : '';

  const safeTitle = escapeHtml(log.title || '通知');
  const safeBody = escapeHtml(log.body || 'メッセージなし');
  
  // URLのカスタム変換を適用
  const displayUrl = transformUrl(log.url, log.platform);

  const titleHtml = displayUrl
    ? `<a href="${escapeHtml(displayUrl)}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>`
    : safeTitle;

  const statusClass = log.status === 'fail' ? ' status-fail' : '';
  const platformData = normalizePlatformName(log.platform || '不明');

  return `
    <div class="card${statusClass}" data-platform="${escapeHtml(platformData)}">
      ${iconHtml}
      <div class="card-content">
        <div class="title">${titleHtml}</div>
        <p class="body">${safeBody}</p>
        <div class="meta">
          <span class="platform">${escapeHtml(log.platform || '不明')}</span>
          <span class="time">${dateStr}</span>
          ${log.status === 'fail' ? '<span class="status-badge">送信失敗</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

export function applySequentialFadeIn() {
  const cards = document.querySelectorAll('#logs .card:not([data-fade-applied])');
  const delayIncrement = 0.15;

  cards.forEach((card, index) => {
    const delay = index * delayIncrement;
    card.style.animationDelay = `${delay}s`;
    card.setAttribute('data-fade-applied', 'true');

    card.addEventListener('animationend', function handler() {
      card.style.animation = 'none';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
      card.removeEventListener('animationend', handler);
    }, { once: true });
  });
}

// =========================
// 内部ユーティリティ
// =========================
function getCurrentFilterSettingsFallback() {
  return {
    twitcasting: document.getElementById('filter-twitcasting')?.classList.contains('is-on') || false,
    youtube: document.getElementById('filter-youtube')?.classList.contains('is-on') || false,
    youtubeCommunity: document.getElementById('filter-youtube-community')?.classList.contains('is-on') || false,
    fanbox: document.getElementById('filter-fanbox')?.classList.contains('is-on') || false,
    twitterMain: document.getElementById('filter-twitter-main')?.classList.contains('is-on') || false,
    twitterSub: document.getElementById('filter-twitter-sub')?.classList.contains('is-on') || false,
    milestone: document.getElementById('filter-milestone')?.classList.contains('is-on') || false,
    schedule: document.getElementById('filter-schedule')?.classList.contains('is-on') || false,
    gipt: document.getElementById('filter-gipt')?.classList.contains('is-on') || false,
    twitch: document.getElementById('filter-twitch')?.classList.contains('is-on') || false,
    bilibili: document.getElementById('filter-bilibili')?.classList.contains('is-on') | false,
  };
}

function shouldIncludeLog(log, settings) {
  if (!log) return false;
  if (!settings) return true;

  const anyEnabled = Object.values(settings).some(Boolean);
  if (!anyEnabled) return true;

  const platform = normalizePlatformName((log.platform || '').toString());

  if (platform.includes('twitcasting')) return !!settings.twitcasting;
  if (platform.includes('youtube') && platform.includes('community')) return !!settings.youtubeCommunity;
  if (platform.includes('youtube')) return !!settings.youtube;
  if (platform.includes('fanbox') || platform.includes('pixiv')) return !!settings.fanbox;
  if (platform.includes('twitter') && platform.includes('sub')) return !!settings.twitterSub;
  if (platform.includes('twitter')) return !!settings.twitterMain;
  if (platform.includes('milestone')) return !!settings.milestone;
  if (platform.includes('schedule')) return !!settings.schedule;
  if (platform.includes('gipt')) return !!settings.gipt;
  if (platform.includes('twitch')) return !!settings.twitch;
  if (platform.includes('bilibili')) return !! settings.bilibili;

  return true;
}

async function fetchJsonWithTimeout(url, { timeoutMs = 8000, noStore = false } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: noStore ? 'no-store' : 'default',
      headers: { 'Accept': 'application/json' }
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// =========================
// JSONファイルから履歴取得
// =========================
async function fetchHistoryFromJson(settings, pageLimit) {
  const now = Date.now();
  
  if (jsonCache.data && (now - jsonCache.timestamp < jsonCache.ttl)) {
    return jsonCache.data;
  }

  try {
    const res = await fetchJsonWithTimeout('/history.json', {
      timeoutMs: 5000,
      noStore: true
    });

    if (!res.ok) throw new Error(`JSON fetch failed: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data.logs)) throw new Error('Invalid JSON format');

    jsonCache.data = data;
    jsonCache.timestamp = now;
    return data;
  } catch (e) {
    console.warn('[fetchHistoryFromJson] JSON取得失敗:', e.message);
    return null;
  }
}

// =========================
// 履歴取得のメイン関数
// =========================
export async function fetchHistory($logsEl, $statusEl, { append = false, useCache = true } = {}) {
  if (PAGING.loading) return;

  const startTime = performance.now();
  PAGING.loading = true;
  PAGING.initialized = true;

  const pageLimit = PAGING.limit || 5;
  const clientId = getClientId();

  if (!append) {
    PAGING.offset = 0;
    PAGING.displayedCount = 0;
    if ($logsEl) {
      $logsEl.innerHTML = renderHistorySkeleton();
    }
  }

  const settings =
    (typeof window.getCurrentFilterSettings === 'function')
      ? window.getCurrentFilterSettings()
      : getCurrentFilterSettingsFallback();

  let collectedLogs = [];
  let rawProcessedCount = 0;
  let totalCount = 0;
  let hasMore = false;

  try {
    // 1. JSONキャッシュ/ファイルから取得
    if (PAGING.offset < jsonCache.limit) {
      const jsonData = await fetchHistoryFromJson(settings, pageLimit);
      if (jsonData && Array.isArray(jsonData.logs)) {
        const startIdx = PAGING.offset;
        let i = startIdx;
        while (i < jsonData.logs.length && collectedLogs.length < pageLimit) {
          const log = jsonData.logs[i];
          if (shouldIncludeLog(log, settings)) {
            collectedLogs.push(log);
          }
          i++;
        }
        rawProcessedCount = i - startIdx;
        totalCount = jsonData.total ?? jsonData.logs.length;
        hasMore = i < totalCount || totalCount > jsonData.logs.length;
      }
    }

    // 2. もし追加が必要ならDB APIから取得
    // JSONの末尾に達したか、最初からJSONの範囲外の場合
    if (collectedLogs.length < pageLimit && (PAGING.hasMore || !PAGING.initialized)) {
      const needed = pageLimit - collectedLogs.length;
      const dbOffset = PAGING.offset + rawProcessedCount;

      // フィルタによる空振りを防ぐため、少し多めに取得する（最大50）
      const apiLimit = Math.min(needed * 5, 50);

      const url = `${API.HISTORY}?clientId=${encodeURIComponent(clientId || '')}&limit=${apiLimit}&offset=${dbOffset}`;
      
      const res = await fetchJsonWithTimeout(url, { timeoutMs: 8000, noStore: true });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          let j = 0;
          while (j < data.logs.length && collectedLogs.length < pageLimit) {
            const log = data.logs[j];
            if (shouldIncludeLog(log, settings)) {
              collectedLogs.push(log);
            }
            j++;
          }
          // 重要：実際に「使用または検討した」件数分だけオフセットを進める
          rawProcessedCount += j;
        }
        totalCount = data.total ?? totalCount;
        // DB上の全件数と比較して次があるか判定
        hasMore = (dbOffset + (Array.isArray(data.logs) ? data.logs.length : 0)) < totalCount;
      }
    }

    // 3. 描画処理
    if ($logsEl) {
      if (!append) {
        $logsEl.innerHTML = '';
        $logsEl.classList.add('loaded');
        delete $logsEl.dataset.source;
      }

      if (collectedLogs.length > 0) {
        const html = collectedLogs.map(createLogItem).join('');
        $logsEl.insertAdjacentHTML('beforeend', html);
        requestAnimationFrame(() => applySequentialFadeIn());
      } else if (!append) {
        $logsEl.innerHTML = '<p class="status-message info-message">表示できる履歴はありません</p>';
      }
    }

    // 4. 状態更新
    PAGING.offset += rawProcessedCount;
    const visibleCards = $logsEl ? $logsEl.querySelectorAll('.card:not(.filtered-out)').length : 0;
    PAGING.displayedCount = visibleCards;
    PAGING.hasMore = hasMore;

    const $btnMore = document.getElementById('more-logs-button');
    if ($btnMore) {
      $btnMore.style.display = PAGING.hasMore ? 'block' : 'none';
    }

    if ($statusEl) {
      const loadTimeSec = (performance.now() - startTime) / 1000;
      $statusEl.textContent = `表示中: ${PAGING.displayedCount} / 総数: ${totalCount} (${loadTimeSec.toFixed(2)}秒)`;
      $statusEl.className = 'status-message success-message';
    }

    if (typeof window.applyLogFiltering === 'function') {
      window.applyLogFiltering();
    }

  } catch (e) {
    console.error('[fetchHistory] 失敗:', e);
    if ($statusEl) {
      $statusEl.textContent = '履歴の取得に失敗しました';
      $statusEl.className = 'status-message error-message';
    }
  } finally {
    PAGING.loading = false;
  }
}

function renderHistorySkeleton(count = 5) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton-box skeleton-icon"></div>
        <div class="skeleton-content">
          <div class="skeleton-box skeleton-line title"></div>
          <div class="skeleton-box skeleton-line"></div>
          <div class="skeleton-box skeleton-line" style="width: 80%"></div>
          <div class="skeleton-box skeleton-line meta"></div>
        </div>
      </div>
    `;
  }
  return html;
}

// =========================
// more ボタン
// =========================
export function fetchHistoryMore($logsEl, $statusEl) {
  if (PAGING.hasMore && !PAGING.loading) {
    fetchHistory($logsEl, $statusEl, { append: true, useCache: false });
  }
}

// =========================
// JSON キャッシュ制御
// =========================
export function clearJsonCache() {
  jsonCache.data = null;
  jsonCache.timestamp = 0;
}

export const clearHistoryCache = clearJsonCache;
