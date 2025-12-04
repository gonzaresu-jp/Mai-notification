// historyService.js - 履歴表示管理（最適化版）
import { API, PAGING, getClientId, normalizePlatformName } from './config.js';

// キャッシュ機構（初回表示のみ使用）
const historyCache = {
  data: null,
  timestamp: 0,
  ttl: 5000, // 5秒間のみキャッシュ（短縮）
  used: false // キャッシュを一度使ったらフラグを立てる
};

export function createLogItem(log) {
  const date = new Date(log.timestamp * 1000);
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
  
  const iconHtml = log.icon ? `<img src="${log.icon}" alt="icon" class="icon" loading="lazy" />` : '';
  
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

export async function fetchHistory($logsEl, $statusEl, { append = false, useCache = true } = {}) {
  if (PAGING.loading) {
    console.log('既にロード中です。');
    return;
  }
  PAGING.loading = true;
  
  const startTime = performance.now(); // パフォーマンス計測開始

  if ($statusEl) {
    $statusEl.textContent = append ? '履歴を読み込み中...' : '最新の履歴を取得中...';
    $statusEl.className = 'status-message info-message';
  }

  const pageLimit = PAGING.limit || 5;
  let serverOffset = append ? PAGING.offset : 0;

  const clientId = getClientId();
  if (!clientId) {
    console.warn('clientId missing for history fetch');
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
    return true;
  }

  const settings = (typeof window.getCurrentFilterSettings === 'function') ? window.getCurrentFilterSettings() : (function(){
    return {
      twitcasting: document.getElementById('filter-twitcasting')?.classList.contains('is-on') || false,
      youtube: document.getElementById('filter-youtube')?.classList.contains('is-on') || false,
      youtubeCommunity: document.getElementById('filter-youtube-community')?.classList.contains('is-on') || false,
      fanbox: document.getElementById('filter-fanbox')?.classList.contains('is-on') || false,
      twitterMain: document.getElementById('filter-twitter-main')?.classList.contains('is-on') || false,
      twitterSub: document.getElementById('filter-twitter-sub')?.classList.contains('is-on') || false,
      milestone: document.getElementById('filter-milestone')?.classList.contains('is-on') || false
    };
  })();

  const collectedLogs = [];
  let lastServerResponse = null;
  const maxPagesToFetch = 5;
  let pagesFetched = 0;

  try {
    // キャッシュチェック（初回読み込み時のみ、かつ一度も使っていない場合のみ）
    if (!append && useCache && !historyCache.used && historyCache.data && (Date.now() - historyCache.timestamp < historyCache.ttl)) {
      console.log('[fetchHistory] キャッシュを使用');
      historyCache.used = true; // 使用済みフラグ
      lastServerResponse = historyCache.data;
      
      if (Array.isArray(lastServerResponse.logs)) {
        for (const log of lastServerResponse.logs.slice(0, pageLimit)) {
          if (shouldIncludeLog(log, settings)) {
            collectedLogs.push(log);
          }
        }
      }
    } else {
      // 通常のフェッチ処理
      while (collectedLogs.length < pageLimit) {
        if (pagesFetched >= maxPagesToFetch) {
          console.warn('fetchHistory: max pages fetched, breaking to avoid infinite loop');
          break;
        }
        
        const url = `${API.HISTORY}?clientId=${encodeURIComponent(clientId||'')}&limit=${pageLimit}&offset=${serverOffset}`;
        
        let res;
        let retryCount = 0;
        const maxRetries = 2;
        
        // リトライ機構
        while (retryCount <= maxRetries) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒タイムアウト
            
            res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (res.ok) {
              break; // 成功したらループを抜ける
            } else if (res.status === 502 && retryCount < maxRetries) {
              console.warn(`[fetchHistory] 502エラー、リトライ ${retryCount + 1}/${maxRetries}`);
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // 指数バックオフ
              continue;
            } else {
              throw new Error(`Failed to fetch history: ${res.status}`);
            }
          } catch (e) {
            if (e.name === 'AbortError') {
              console.warn(`[fetchHistory] タイムアウト、リトライ ${retryCount + 1}/${maxRetries}`);
              retryCount++;
              if (retryCount <= maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                continue;
              }
            }
            throw e;
          }
        }
        
        if (!res || !res.ok) {
          throw new Error(`Failed to fetch history after ${maxRetries} retries`);
        }
        
        const data = await res.json();
        lastServerResponse = data;
        pagesFetched++;

        // 初回読み込み時はキャッシュに保存
        if (!append && pagesFetched === 1) {
          historyCache.data = data;
          historyCache.timestamp = Date.now();
        }

        if (!Array.isArray(data.logs) || data.logs.length === 0) {
          serverOffset += data.logs ? data.logs.length : 0;
          break;
        }

        for (const log of data.logs) {
          if (shouldIncludeLog(log, settings)) {
            collectedLogs.push(log);
            if (collectedLogs.length >= pageLimit) break;
          }
        }

        serverOffset += data.logs.length;

        if (!data.hasMore) {
          break;
        }
      }
    }

    const html = collectedLogs.map(createLogItem).join('');

    if ($logsEl) {
      if (!append) {
        // スケルトンローディングを削除し、loadedクラスを追加
        const skeletons = $logsEl.querySelectorAll('.skeleton-card');
        skeletons.forEach(s => s.remove());
        
        $logsEl.innerHTML = html;
        $logsEl.classList.add('loaded'); // モバイル対応のクラス追加
      } else {
        $logsEl.insertAdjacentHTML('beforeend', html);
      }
      
      // requestAnimationFrameで次のフレームまで遅延
      requestAnimationFrame(() => {
        applySequentialFadeIn();
      });
    }

    const visibleCards = $logsEl ? $logsEl.querySelectorAll('.card:not(.filtered-out)').length : 0;
    PAGING.displayedCount = visibleCards;

    PAGING.offset = serverOffset;
    PAGING.hasMore = lastServerResponse ? !!lastServerResponse.hasMore : false;

    const $btnMore = document.getElementById('more-logs-button');
    if ($btnMore) $btnMore.style.display = PAGING.hasMore ? 'block' : 'none';

    const totalReported = lastServerResponse && typeof lastServerResponse.total !== 'undefined' ? lastServerResponse.total : '?';
    if ($statusEl) {
      const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
      $statusEl.textContent = `表示中: ${PAGING.displayedCount} / サーバ総数: ${totalReported} (${loadTime}秒)`;
      $statusEl.className = 'status-message success-message';
      
      // 5秒以上かかった場合は警告
      if (loadTime > 5) {
        console.warn(`[fetchHistory] 読み込みに${loadTime}秒かかりました（サーバー応答が遅い可能性があります）`);
      }
    }

    if (typeof window.applyLogFiltering === 'function') window.applyLogFiltering();

  } catch (e) {
    console.error('Failed to fetch history:', e);
    if ($statusEl) {
      let errorMessage = '履歴の取得に失敗しました';
      if (e.message && e.message.includes('502')) {
        errorMessage = 'サーバーが一時的に応答していません。しばらくしてから再度お試しください。';
      } else if (e.name === 'AbortError' || e.message.includes('timeout')) {
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

// キャッシュをクリアする関数（手動更新時に使用）
export function clearHistoryCache() {
  historyCache.data = null;
  historyCache.timestamp = 0;
  historyCache.used = false;
  console.log('[clearHistoryCache] キャッシュをクリアしました');
}