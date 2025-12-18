// historyService.js - 履歴表示管理（DB準拠・キャッシュは初回だけの補助）
import { API, PAGING, getClientId, normalizePlatformName } from './config.js';

// =========================
// キャッシュ機構（初回表示の体感改善用）
// - main.js 側で force 更新時は useCache:false を渡す想定
// =========================
const historyCache = {
  data: null,
  timestamp: 0,
  ttl: 5000,   // 5秒
  used: false  // 1回使ったら以降は使わない（初回表示専用）
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
        // 差分APIが無い前提 -> 全再フェッチ（DB準拠）
        clearHistoryCache();
        PAGING.offset = 0;
        PAGING.hasMore = true;
        fetchHistory($logsEl, $statusEl, { append: false, useCache: false });
      }
    } catch (err) {
      console.warn('[History SSE] Invalid payload', err);
    }
  });

  es.addEventListener('error', () => {
    // iOS/Safari は裏で切れやすい。リトライはブラウザ任せ。
    console.warn('[History SSE] disconnected or error');
  });

  return es; // 呼び元で es.close() できるように返す
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
    gipt: document.getElementById('filter-gipt')?.classList.contains('is-on') || false
  };
}

function shouldIncludeLog(log, settings) {
  if (!log) return false;

  const platform = normalizePlatformName((log.platform || '').toString());
  if (!settings) return true;

  if (platform.includes('twitcasting')) return !!settings.twitcasting;
  if (platform.includes('youtube') && platform.includes('community')) return !!settings.youtubeCommunity;
  if (platform.includes('youtube')) return !!settings.youtube;
  if (platform.includes('fanbox') || platform.includes('pixiv')) return !!settings.fanbox;
  if (platform.includes('twitter') && platform.includes('sub')) return !!settings.twitterSub;
  if (platform.includes('twitter')) return !!settings.twitterMain;
  if (platform.includes('milestone')) return !!settings.milestone;
  if (platform.includes('gipt')) return !!settings.gipt;

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
// 履歴取得（append=false は先頭から取り直し）
// useCache=true は「初回表示」だけの体感改善用。
// 強制DB同期したい場合は main.js から useCache:false を渡す。
// =========================
export async function fetchHistory($logsEl, $statusEl, { append = false, useCache = true } = {}) {
  if (PAGING.loading) {
    console.log('[fetchHistory] 既にロード中');
    return;
  }
  PAGING.loading = true;

  const startTime = performance.now();

  if ($statusEl) {
    $statusEl.textContent = append ? '履歴を読み込み中...' : '最新の履歴を取得中...';
    $statusEl.className = 'status-message info-message';
  }

  const pageLimit = PAGING.limit || 5;
  let serverOffset = append ? (PAGING.offset || 0) : 0;

  const clientId = getClientId();
  if (!clientId) {
    console.warn('[fetchHistory] clientId missing');
  }

  const settings =
    (typeof window.getCurrentFilterSettings === 'function')
      ? window.getCurrentFilterSettings()
      : getCurrentFilterSettingsFallback();

  const collectedLogs = [];
  let lastServerResponse = null;

  const maxPagesToFetch = 5;
  let pagesFetched = 0;

  try {
    // ----- 初回限定のキャッシュ（append=false のときだけ） -----
    const cacheValid =
      !append &&
      useCache &&
      !historyCache.used &&
      historyCache.data &&
      (Date.now() - historyCache.timestamp < historyCache.ttl);

    if (cacheValid) {
      console.log('[fetchHistory] cache hit (first paint)');
      historyCache.used = true;

      lastServerResponse = historyCache.data;

      if (Array.isArray(lastServerResponse.logs)) {
        for (const log of lastServerResponse.logs) {
          if (shouldIncludeLog(log, settings)) collectedLogs.push(log);
          if (collectedLogs.length >= pageLimit) break;
        }
      }

      // キャッシュを使った場合でも paging を整合させる
      const cachedCount = Array.isArray(lastServerResponse.logs) ? lastServerResponse.logs.length : 0;
      serverOffset = append ? serverOffset : cachedCount;
      PAGING.hasMore = !!lastServerResponse.hasMore;
    } else {
      // ----- 通常のフェッチ（useCache=false のときは no-store） -----
      while (collectedLogs.length < pageLimit) {
        if (pagesFetched >= maxPagesToFetch) {
          console.warn('[fetchHistory] max pages fetched (break)');
          break;
        }

        const url =
          `${API.HISTORY}?clientId=${encodeURIComponent(clientId || '')}` +
          `&limit=${encodeURIComponent(pageLimit)}` +
          `&offset=${encodeURIComponent(serverOffset)}`;

        let res = null;
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount <= maxRetries) {
          try {
            res = await fetchJsonWithTimeout(url, {
              timeoutMs: 8000,
              noStore: !useCache
            });

            if (res.ok) break;

            if (res.status === 502 && retryCount < maxRetries) {
              retryCount++;
              console.warn(`[fetchHistory] 502 retry ${retryCount}/${maxRetries}`);
              await new Promise(r => setTimeout(r, 1000 * retryCount));
              continue;
            }

            throw new Error(`Failed to fetch history: ${res.status}`);
          } catch (e) {
            if (e.name === 'AbortError' && retryCount < maxRetries) {
              retryCount++;
              console.warn(`[fetchHistory] timeout retry ${retryCount}/${maxRetries}`);
              await new Promise(r => setTimeout(r, 1000 * retryCount));
              continue;
            }
            throw e;
          }
        }

        if (!res || !res.ok) {
          throw new Error(`[fetchHistory] failed after retries`);
        }

        const data = await res.json();
        lastServerResponse = data;
        pagesFetched++;

        // 初回ページだけキャッシュに保存（append=false のときのみ）
        if (!append && pagesFetched === 1 && useCache) {
          historyCache.data = data;
          historyCache.timestamp = Date.now();
          // used は「キャッシュヒットした時だけ」立てる（保存だけでは立てない）
        }

        if (!Array.isArray(data.logs) || data.logs.length === 0) {
          break;
        }

        for (const log of data.logs) {
          if (shouldIncludeLog(log, settings)) {
            collectedLogs.push(log);
            if (collectedLogs.length >= pageLimit) break;
          }
        }

        serverOffset += data.logs.length;

        if (!data.hasMore) break;
      }
    }

    // ----- 描画 -----
    const html = collectedLogs.map(createLogItem).join('');

    if ($logsEl) {
      if (!append) {
        // スケルトン除去
        const skeletons = $logsEl.querySelectorAll('.skeleton-card');
        skeletons.forEach(s => s.remove());

        $logsEl.innerHTML = html;
        $logsEl.classList.add('loaded');
      } else {
        $logsEl.insertAdjacentHTML('beforeend', html);
      }

      requestAnimationFrame(() => {
        applySequentialFadeIn();
      });
    }

    const visibleCards = $logsEl
      ? $logsEl.querySelectorAll('.card:not(.filtered-out)').length
      : 0;

    PAGING.displayedCount = visibleCards;
    PAGING.offset = serverOffset;
    PAGING.hasMore = lastServerResponse ? !!lastServerResponse.hasMore : false;

    const $btnMore = document.getElementById('more-logs-button');
    if ($btnMore) $btnMore.style.display = PAGING.hasMore ? 'block' : 'none';

    const totalReported =
      (lastServerResponse && typeof lastServerResponse.total !== 'undefined')
        ? lastServerResponse.total
        : '?';

    if ($statusEl) {
      const loadTimeSec = (performance.now() - startTime) / 1000;
      $statusEl.textContent = `表示中: ${PAGING.displayedCount} / サーバ総数: ${totalReported} (${loadTimeSec.toFixed(2)}秒)`;
      $statusEl.className = 'status-message success-message';

      if (loadTimeSec > 5) {
        console.warn(`[fetchHistory] slow: ${loadTimeSec.toFixed(2)}s`);
      }
    }

    if (typeof window.applyLogFiltering === 'function') {
      window.applyLogFiltering();
    }

  } catch (e) {
    console.error('[fetchHistory] failed:', e);

    if ($statusEl) {
      let errorMessage = '履歴の取得に失敗しました';

      const msg = (e && e.message) ? e.message : '';
      if (msg.includes('502')) {
        errorMessage = 'サーバーが一時的に応答していません。しばらくしてから再度お試しください。';
      } else if (e.name === 'AbortError' || msg.toLowerCase().includes('timeout')) {
        errorMessage = '通信がタイムアウトしました。インターネット接続を確認してください。';
      }

      $statusEl.textContent = errorMessage;
      $statusEl.className = 'status-message error-message';
    }

  } finally {
    PAGING.loading = false;
  }
}

export function fetchHistoryMore($logsEl, $statusEl) {
  if (PAGING.hasMore) {
    fetchHistory($logsEl, $statusEl, { append: true, useCache: false });
  }
}

// キャッシュをクリアする関数（手動更新・強制同期時に使用）
export function clearHistoryCache() {
  historyCache.data = null;
  historyCache.timestamp = 0;
  historyCache.used = false;
  console.log('[clearHistoryCache] キャッシュをクリアしました');
}
