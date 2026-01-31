// historyService.js - 履歴表示管理(JSON優先版)
import { API, PAGING, getClientId, normalizePlatformName } from './config.js';

// =========================
// JSONキャッシュ
// =========================
const jsonCache = {
  data: null,
  timestamp: 0,
  ttl: 5000, // 5秒
  limit: 20  // JSONの最大件数
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
    ? `<img src="${log.icon}" alt="icon" class="icon" loading="lazy" />`
    : '';

  const titleHtml = log.url
    ? `<a href="${log.url}" target="_blank" rel="noopener noreferrer">${log.title || '通知'}</a>`
    : (log.title || '通知');

  const statusClass = log.status === 'fail' ? ' status-fail' : '';
  const platformData = normalizePlatformName(log.platform || '不明');

  return `
    <div class="card${statusClass}" data-platform="${platformData}">
      ${iconHtml}
      <div class="card-content">
        <div class="title">${titleHtml}</div>
        <p class="body">${log.body || 'メッセージなし'}</p>
        <div class="meta">
          <span class="platform">${log.platform || '不明'}</span>
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
    gipt: document.getElementById('filter-gipt')?.classList.contains('is-on') || false,
    twitch: document.getElementById('filter-twitch')?.classList.contains('is-on') || false
  };
}

function shouldIncludeLog(log, settings) {
  if (!log) return false;
  if (!settings) return true;

  // すべて false → フィルタ未適用
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
  if (platform.includes('gipt')) return !!settings.gipt;
  if (platform.includes('twitch')) return !!settings.twitch;

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
  
  // キャッシュチェック
  if (jsonCache.data && (now - jsonCache.timestamp < jsonCache.ttl)) {
    console.log('[fetchHistoryFromJson] JSONキャッシュヒット');
    return jsonCache.data;
  }

  console.log('[fetchHistoryFromJson] JSONファイル取得開始');
  
  try {
    const res = await fetchJsonWithTimeout('/history.json', {
      timeoutMs: 5000,
      noStore: true
    });

    if (!res.ok) {
      throw new Error(`JSON fetch failed: ${res.status}`);
    }

    const data = await res.json();
    
    if (!Array.isArray(data.logs)) {
      throw new Error('Invalid JSON format');
    }

    // キャッシュに保存
    jsonCache.data = data;
    jsonCache.timestamp = now;

    console.log(`[fetchHistoryFromJson] JSON取得成功 (${data.logs.length}件)`);
    return data;

  } catch (e) {
    console.warn('[fetchHistoryFromJson] JSON取得失敗:', e.message);
    return null;
  }
}

// =========================
// 履歴取得のメイン関数（修正版）
// =========================
export async function fetchHistory($logsEl, $statusEl, { append = false, useCache = true } = {}) {
  if (PAGING.loading) {
    console.log('[fetchHistory] 既にロード中');
    return;
  }

  const startTime = performance.now();

  // =========================
  // 初回：HTML / history.json 先行表示
  // =========================
  const existingCards = $logsEl.querySelectorAll('.card:not(.skeleton-card)').length;
  if (!append && useCache && $logsEl?.dataset.source === 'html') {
    console.log('[fetchHistory] HTML/JSON先行表示を採用');

    PAGING.initialized = true;
    PAGING.loading = false;

    const visibleCards = $logsEl.querySelectorAll('.card:not(.filtered-out)').length;

    PAGING.displayedCount = visibleCards;
    PAGING.offset = visibleCards;
    PAGING.hasMore = visibleCards >= (PAGING.limit || 5);

    const $btnMore = document.getElementById('more-logs-button');
    if ($btnMore) $btnMore.style.display = PAGING.hasMore ? 'block' : 'none';

    if ($statusEl) {
      $statusEl.textContent = `表示中: ${PAGING.displayedCount}`;
      $statusEl.className = 'status-message success-message';
    }

    return;
  }

  // =========================
  // 通常ロード開始
  // =========================
  PAGING.loading = true;
  PAGING.initialized = true;

  const pageLimit = PAGING.limit || 5;
  const clientId = getClientId();

  const settings =
    (typeof window.getCurrentFilterSettings === 'function')
      ? window.getCurrentFilterSettings()
      : getCurrentFilterSettingsFallback();

  const collectedLogs = [];
  let totalCount = 0;
  let hasMore = false;

  try {
    // =========================
    // JSON キャッシュ範囲
    // =========================
    if (!append || PAGING.offset < jsonCache.limit) {
      const jsonData = await fetchHistoryFromJson(settings, pageLimit);

      if (jsonData && Array.isArray(jsonData.logs)) {
        const startIdx = append ? PAGING.offset : 0;

        for (let i = startIdx; i < jsonData.logs.length; i++) {
          const log = jsonData.logs[i];
          if (shouldIncludeLog(log, settings)) {
            collectedLogs.push(log);
            if (collectedLogs.length >= pageLimit) break;
          }
        }

        totalCount = jsonData.total ?? jsonData.logs.length;

        const nextOffset = startIdx + collectedLogs.length;
        hasMore = nextOffset < totalCount;

        console.log(`[fetchHistory] JSON使用: ${collectedLogs.length}件取得`);
      }
    }

    // =========================
    // DB API フォールバック
    // =========================
    if (append && PAGING.offset >= jsonCache.limit && collectedLogs.length < pageLimit) {
      console.log('[fetchHistory] JSON範囲超過 → DB APIへ切り替え');

      const dbOffset = PAGING.offset - jsonCache.limit;
      const url =
        `${API.HISTORY}?clientId=${encodeURIComponent(clientId || '')}` +
        `&limit=${encodeURIComponent(pageLimit)}` +
        `&offset=${encodeURIComponent(dbOffset)}`;

      const res = await fetchJsonWithTimeout(url, {
        timeoutMs: 8000,
        noStore: true
      });

      if (!res.ok) {
        throw new Error(`DB fetch failed: ${res.status}`);
      }

      const data = await res.json();

      if (Array.isArray(data.logs)) {
        for (const log of data.logs) {
          if (shouldIncludeLog(log, settings)) {
            collectedLogs.push(log);
            if (collectedLogs.length >= pageLimit) break;
          }
        }
      }

      totalCount = data.total ?? totalCount;
      hasMore = true;

      console.log(`[fetchHistory] DB使用: ${collectedLogs.length}件取得`);
    }

    // =========================
    // 描画
    // =========================
    if ($logsEl && collectedLogs.length > 0) {
      const html = collectedLogs.map(createLogItem).join('');

      if (!append) {
        $logsEl.querySelectorAll('.skeleton-card').forEach(s => s.remove());
        $logsEl.innerHTML = html;
        $logsEl.classList.add('loaded');
      } else {
        $logsEl.insertAdjacentHTML('beforeend', html);
      }

      requestAnimationFrame(() => applySequentialFadeIn());
    }

    // =========================
    // 状態更新
    // =========================
    PAGING.offset += collectedLogs.length;

    const visibleCards = $logsEl
      ? $logsEl.querySelectorAll('.card:not(.filtered-out)').length
      : 0;

    PAGING.displayedCount = visibleCards;
    PAGING.hasMore = hasMore;

    const $btnMore = document.getElementById('more-logs-button');
    if ($btnMore) $btnMore.style.display = PAGING.hasMore ? 'block' : 'none';

    if ($statusEl) {
      const loadTimeSec = (performance.now() - startTime) / 1000;
      $statusEl.textContent =
        `表示中: ${PAGING.displayedCount} / サーバ総数: ${totalCount} (${loadTimeSec.toFixed(2)}秒)`;
      $statusEl.className = 'status-message success-message';
    }

    if (typeof window.applyLogFiltering === 'function') {
      window.applyLogFiltering();
    }

  } catch (e) {
    console.error('[fetchHistory] failed:', e);

    if ($statusEl) {
      let msg = '履歴の取得に失敗しました';

      if (e?.message?.includes('502')) {
        msg = 'サーバーが一時的に応答していません。';
      } else if (e?.name === 'AbortError' || e?.message?.toLowerCase().includes('timeout')) {
        msg = '通信がタイムアウトしました。';
      }

      $statusEl.textContent = msg;
      $statusEl.className = 'status-message error-message';
    }

  } finally {
    PAGING.loading = false;
  }
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
  console.log('[clearJsonCache] JSONキャッシュをクリア');
}

// 後方互換
export const clearHistoryCache = clearJsonCache;
