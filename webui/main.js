// main.js (client side) - フィルター機能付き完全版
const API_HISTORY = '/api/history';
const API_VAPID = '/api/vapidPublicKey';
const API_SUBSCRIBE = '/api/save-platform-settings';
const API_SEND_TEST = '/api/send-test';
const API_SAVE_SETTINGS = '/api/save-platform-settings';

let autoTimer = null;

// --- UI制御ユーティリティ ---
const $body = document.getElementById('app-body');

// --- グローバルスコープに updateToggleImage を定義 ---
function updateToggleImage() {
    const $toggleNotify = document.getElementById('toggle-notify');
    if ($toggleNotify) {
        document.body.classList.toggle('notifications-enabled', $toggleNotify.checked);
        document.body.classList.toggle('settings-on', $toggleNotify.checked);
    }
}

// --- プラットフォーム設定の表示/非表示制御 ---
function updatePlatformSettingsVisibility(isChecked) {
    const $platformSettings = document.getElementById('platform-settings');
    if (!$platformSettings) return;

    if (isChecked) {
        $platformSettings.style.display = 'block';
        $platformSettings.classList.remove('fade-out');
        $platformSettings.classList.add('fade-in');
    } else {
        $platformSettings.classList.remove('fade-in');
        $platformSettings.classList.add('fade-out');
        setTimeout(() => {
            $platformSettings.style.display = 'none';
        }, 200);
    }
}

// --- utility ---
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

function getClientId() {
  let cid = localStorage.getItem('clientId');
  if (!cid && window.crypto && crypto.randomUUID) {
    cid = crypto.randomUUID();
    localStorage.setItem('clientId', cid);
  }
  return cid;
}

// --- Push Notification ---
async function initPush() {
  console.log('--- Push Initialization START ---');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push Notificationに対応していません。');
  }

  const sw = await navigator.serviceWorker.ready;

  if (Notification.permission === 'default') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') {
      throw new Error('ユーザーが通知を許可しませんでした');
    }
  } else if (Notification.permission === 'denied') {
    throw new Error('通知が拒否されています(ブラウザ設定をご確認ください)');
  }

  const vapidResp = await fetch(API_VAPID);
  if (!vapidResp.ok) throw new Error('VAPID鍵取得失敗');
  const vapidPublicKey = (await vapidResp.text()).trim();

  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  let existing = await sw.pushManager.getSubscription();
  if (existing) {
    console.log('既存購読を使用');
    return existing;
  }

  const sub = await sw.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  });

  await sendSubscriptionToServer(sub.toJSON ? sub.toJSON() : JSON.parse(JSON.stringify(sub)));

  try { localStorage.setItem('pushSubscription', JSON.stringify(sub.toJSON ? sub.toJSON() : JSON.parse(JSON.stringify(sub)))); } catch(e){}

  return sub;
}

async function sendSubscriptionToServer(sub) {
  const clientId = getClientId();
  if (!clientId) throw new Error('Client ID missing');

  const subscriptionPayload = sub?.toJSON ? sub.toJSON() : sub;

  const platformSettings = (typeof getPlatformSettings === 'function') ? getPlatformSettings() : null;

  const response = await fetch(API_SUBSCRIBE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      subscription: subscriptionPayload,
      settings: platformSettings
    }),
    credentials: 'same-origin'
  });

  if (!response.ok) {
    const text = await response.text().catch(()=>'<no-body>');
    throw new Error(`subscribe API failed: ${response.status} ${text}`);
  }
}

async function saveNameToServer(clientId, name) {
    if (!clientId) {
        console.error('[saveNameToServer] clientId がありません');
        return false;
    }
    if (!name || typeof name !== 'string') {
        console.error('[saveNameToServer] name が不正です');
        return false;
    }

    let sub = null;
    try {
        if ('serviceWorker' in navigator) {
            const sw = await navigator.serviceWorker.ready;
            const swSub = await sw.pushManager.getSubscription();
            if (swSub) sub = swSub;
        }
    } catch (e) {
        console.warn('[saveNameToServer] ServiceWorker から subscription 取得に失敗', e);
    }
    if (!sub) {
        const subRaw = localStorage.getItem('pushSubscription');
        if (subRaw) {
            try { sub = JSON.parse(subRaw); } catch (e) { sub = null; }
        }
    }

    const platformSettings = (typeof getPlatformSettings === 'function') ? getPlatformSettings() : null;

    try {
        const res = await fetch('/api/save-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, name })
        });
        console.log('[saveNameToServer] /api/save-name HTTP', res.status);
        if (res.ok) {
            const text = await res.text();
            try { console.log('[saveNameToServer] /api/save-name response:', JSON.parse(text || '{}')); }
            catch (e) { console.log('[saveNameToServer] /api/save-name response (text):', text); }
            return true;
        } else if (res.status === 404) {
            console.log('[saveNameToServer] /api/save-name が存在しないためフォールバックします');
        } else {
            const text = await res.text();
            console.warn('[saveNameToServer] /api/save-name 失敗:', res.status, text);
        }
    } catch (e) {
        console.warn('[saveNameToServer] /api/save-name へのネットワークエラー:', e);
    }

    try {
        const body = {
            clientId: clientId,
            name: name,
            subscription: sub,
            settings: platformSettings
        };
        console.log('[saveNameToServer] フォールバックで /api/save-platform-settings POST', body);
        const res2 = await fetch(API_SAVE_SETTINGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        console.log('[saveNameToServer] /api/save-platform-settings HTTP', res2.status);
        const text2 = await res2.text();
        if (!res2.ok) {
            console.error('[saveNameToServer] 名前保存失敗 response:', res2.status, text2);
            return false;
        }
        try {
            const json = JSON.parse(text2 || '{}');
            console.log('[saveNameToServer] saved (fallback)', json);
        } catch (e) {
            console.log('[saveNameToServer] saved (fallback, non-json response):', text2);
        }
        return true;
    } catch (e) {
        console.error('[saveNameToServer] 名前保存(fallback)失敗:', e);
        return false;
    }
}

async function fetchNameFromServer(clientId) {
    try {
        const res = await fetch(`/api/get-name?clientId=${clientId}`);
        console.log('[fetchNameFromServer] HTTP', res.status);
        if (res.status === 404) return null;
        if (!res.ok) {
            console.warn('[fetchNameFromServer] 非OKレスポンス', await res.text());
            return null;
        }
        const data = await res.json();
        console.log('[fetchNameFromServer] body', data);
        return typeof data.name !== 'undefined' ? data.name : null;
    } catch (e) {
        console.error('name取得失敗:', e);
        return null;
    }
}

async function promptForName() {
    let name = null;
    while (!name) {
        name = prompt('購読者名を入力してください(日本語可):');
        if (name === null) break;
        name = name.trim();
    }
    return name;
}

async function unsubscribePush() {
    console.log('--- Push Unsubscribe START ---');
    try {
        const sw = await navigator.serviceWorker.ready;
        const sub = await sw.pushManager.getSubscription();

        if (sub) {
            console.log('1. プッシュ通知を解除中...');
            await sub.unsubscribe();
            console.log('1. プッシュ通知の解除が完了しました。');
        }
        
        console.log('2. サーバーから購読情報を削除中...');
        const clientId = getClientId();
        if (clientId) {
             const response = await fetch(API_SUBSCRIBE, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: clientId })
            });

            if (!response.ok) {
                console.warn('サーバー側の購読情報削除に失敗しました。', response.status, await response.text());
            } else {
                console.log('2. サーバーから購読情報の削除が完了しました。');
            }
        }
        
        localStorage.removeItem('pushSubscription');
        console.log('--- Push Unsubscribe SUCCESS ---');

    } catch (e) {
        console.error('プッシュ通知の購読解除に失敗しました。', e);
    }
}

async function sendTestToMe() {
    const clientId = getClientId();
    if (!clientId) {
        console.error('Client IDが取得できません。テスト通知を送信できません。');
        return;
    }

    try {
        const response = await fetch(API_SEND_TEST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: clientId })
        });

        if (response.ok) {
            console.log('テスト通知の送信リクエストが成功しました。');
        } else {
            const errorText = await response.text();
            console.error('テスト通知の送信に失敗しました。', response.status, errorText);
        }
    } catch (error) {
        console.error('テスト通知送信時のネットワークエラー:', error);
    }
}

const _paging = {
  offset: 0,
  limit: 5,
  loading: false,
  hasMore: true,
};

function createLogItem(log) {
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
    
    const iconHtml = log.icon ? `<img src="${log.icon}" alt="icon" class="icon" />` : '';
    
    const titleHtml = log.url 
        ? `<a href="${log.url}" target="_blank" rel="noopener noreferrer">${log.title || '通知'}</a>`
        : (log.title || '通知');
    
    const statusClass = log.status === 'fail' ? ' status-fail' : '';
    
    // プラットフォーム名を正規化してdata属性に追加
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

// プラットフォーム名を正規化する関数
function normalizePlatformName(platform) {
    const normalized = platform.toLowerCase().trim();
    
    // プラットフォーム名のマッピング
    if (normalized.includes('twitcasting')) return 'twitcasting';
    if (normalized.includes('youtube') && normalized.includes('community')) return 'youtube-community';
    if (normalized.includes('youtube')) return 'youtube';
    if (normalized.includes('fanbox') || normalized.includes('pixiv')) return 'fanbox';
    if (normalized.includes('twitter') || normalized.includes('x.com')) {
        if (normalized.includes('koinoyamai17') || normalized.includes('sub')) return 'twitter-sub';
        return 'twitter-main';
    }
    if (normalized.includes('milestone') || normalized.includes('記念日')) return 'milestone';
    
    return 'unknown';
}

function applySequentialFadeIn() {
    const cards = document.querySelectorAll('#logs .card:not([data-fade-applied])'); 
    
    const delayIncrement = 0.15;

    cards.forEach((card, index) => {
        const delay = index * delayIncrement;
        card.style.animationDelay = `${delay}s`; 
        card.setAttribute('data-fade-applied', 'true');
                // ✅ アニメーション完了後に animation プロパティを削除
        card.addEventListener('animationend', function handler() {
            card.style.animation = 'none';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
            card.removeEventListener('animationend', handler);
        }, { once: true });
    });
}

async function fetchHistory($logsEl, $statusEl, { append = false } = {}) {
    if (_paging.loading) {
        console.log('既にロード中です。');
        return;
    }
    _paging.loading = true;

    if ($statusEl) {
        $statusEl.textContent = append ? '履歴を読み込み中...' : '最新の履歴を取得中...';
        $statusEl.className = 'status-message info-message';
    }

    const pageLimit = _paging.limit || 5;
    // サーバへ投げる offset はサーバサイドのオフセット（未フィルタの行）
    let serverOffset = append ? _paging.offset : 0;

    const clientId = getClientId();
    if (!clientId) {
        console.warn('clientId missing for history fetch');
    }

    // 現在のフィルター設定を反映する判定関数（log オブジェクトを受け取る）
    function shouldIncludeLog(log, settings) {
        if (!log) return false;
        const platform = normalizePlatformName((log.platform || '').toString());
        // settings が未定義なら表示（保守的）
        if (!settings) return true;

        // 柔軟マッチ（normalizePlatformName がだいたい 'youtube','twitter-main' などを返す想定）
        if (platform.includes('twitcasting')) return !!settings.twitcasting;
        if (platform.includes('youtube') && platform.includes('community')) return !!settings.youtubeCommunity;
        if (platform.includes('youtube')) return !!settings.youtube;
        if (platform.includes('fanbox') || platform.includes('pixiv')) return !!settings.fanbox;
        if (platform.includes('twitter') && platform.includes('sub')) return !!settings.twitterSub;
        if (platform.includes('twitter')) return !!settings.twitterMain;
        if (platform.includes('milestone')) return !!settings.milestone;
        // unknown は表示する（要件に応じて false に変えてください）
        return true;
    }

    const settings = (typeof window.getCurrentFilterSettings === 'function') ? window.getCurrentFilterSettings() : (function(){
        // fallback: read DOM
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

    // 集めるバッファ（フィルタ後の表示対象）
    const collectedLogs = [];

    // ループでサーバページを追いかけ、集める。無限ループ防止に maxFetchPages を設定しても良い（例: 10）
    let lastServerResponse = null;
    const maxPagesToFetch = 20; // 必要なら調整。過度に大きいと負荷になる。
    let pagesFetched = 0;
    try {
        while (collectedLogs.length < pageLimit) {
            if (pagesFetched >= maxPagesToFetch) {
                console.warn('fetchHistory: max pages fetched, breaking to avoid infinite loop');
                break;
            }
            const url = `${API_HISTORY}?clientId=${encodeURIComponent(clientId||'')}&limit=${pageLimit}&offset=${serverOffset}`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Failed to fetch history: ${res.status}`);
            }
            const data = await res.json();
            lastServerResponse = data;
            pagesFetched++;

            if (!Array.isArray(data.logs) || data.logs.length === 0) {
                // サーバ側にこれ以上データがない
                serverOffset += data.logs ? data.logs.length : 0;
                break;
            }

            // 受け取ったサーバページをフィルタしてバッファへ追加
            for (const log of data.logs) {
                if (shouldIncludeLog(log, settings)) {
                    collectedLogs.push(log);
                    if (collectedLogs.length >= pageLimit) break;
                }
            }

            // サーバ側の offset は常に「既読にした」未フィルタの行数を進める
            serverOffset += data.logs.length;

            // サーバがもう先が無い場合は終了
            if (!data.hasMore) {
                break;
            }

            // ループ継続するときは次のサーバページを取る（offset を更新して上で続行）
        }

        // 描画用 HTML を生成
        const html = collectedLogs.map(createLogItem).join('');

        if ($logsEl) {
            if (!append) {
                $logsEl.innerHTML = html;
            } else {
                $logsEl.insertAdjacentHTML('beforeend', html);
            }
            applySequentialFadeIn();
        }

        // 表示カウントを累積更新（DOM の実際の可視カード数を正確な単位とする）
        const visibleCards = $logsEl ? $logsEl.querySelectorAll('.card:not(.filtered-out)').length : 0;
        // visibleCards は既に append 後の合計を返すはずだが、念のため累積管理も行う
        _paging.displayedCount = visibleCards;

        // paging 情報を更新
        _paging.offset = serverOffset;
        _paging.hasMore = lastServerResponse ? !!lastServerResponse.hasMore : false;

        const $btnMore = document.getElementById('more-logs-button');
        if ($btnMore) $btnMore.style.display = _paging.hasMore ? 'block' : 'none';

        // ステータス表示は accumulated count を使う（ここで「増分ではなく累積」を表示）
        const totalReported = lastServerResponse && typeof lastServerResponse.total !== 'undefined' ? lastServerResponse.total : '?';
        if ($statusEl) {
            $statusEl.textContent = `表示中: ${_paging.displayedCount} / サーバ総数: ${totalReported}`;
            $statusEl.className = 'status-message success-message';
        }

        // フィルタリングは既に反映済みだが、念のため window.applyLogFiltering を呼ぶ（CSS側で filtered-out を使っている場合）
        if (typeof window.applyLogFiltering === 'function') window.applyLogFiltering();

    } catch (e) {
        console.error('Failed to fetch history:', e);
        if ($statusEl) {
            $statusEl.textContent = `履歴の取得に失敗しました: ${e.message}`;
            $statusEl.className = 'status-message error-message';
        }
    } finally {
        _paging.loading = false;
    }
}

function fetchHistoryMore($logsEl, $statusEl) {
    if (_paging.hasMore) {
        fetchHistory($logsEl, $statusEl, { append: true });
    }
}

function initPlatformSettingsUI($toggleNotify) {
    const platformButtons = document.querySelectorAll('#platform-settings button');
    
    platformButtons.forEach(button => {
        button.addEventListener('click', async () => {
            button.classList.toggle('is-on');
            button.textContent = `${button.textContent.split(':')[0]}: ${button.classList.contains('is-on') ? 'ON' : 'OFF'}`;
            const platformSettings = getPlatformSettings();
            console.log('保存データ:', platformSettings);

            if ($toggleNotify.checked) {
                await savePlatformSettings();
            } else {
                console.log('通知OFFのためサーバー保存はスキップ');
            }

            // 通知設定連動がONの場合、フィルターも更新
            if (typeof window.syncFilterWithNotificationSettings === 'function' &&
                typeof window.applyFilterSettingsToUI === 'function' &&
                typeof window.saveFilterSettings === 'function' &&
                typeof window.applyLogFiltering === 'function') {
                
                const syncButton = document.getElementById('filter-sync-notification');
                if (syncButton?.classList.contains('is-on')) {
                    const synced = window.syncFilterWithNotificationSettings();
                    window.applyFilterSettingsToUI(synced);
                    window.saveFilterSettings(synced);
                    window.applyLogFiltering();
                }
            }
        });
    });
}

async function getOrCreateSubscription() {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (sub) {
        console.log('既存のsubscriptionを使用:', sub.endpoint);
        return sub;
    }

    const raw = localStorage.getItem('pushSubscription');
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.endpoint || parsed.keys)) {
                console.log('localStorageからsubscription復元', parsed.endpoint);
                return parsed;
            }
        } catch {}
    }

    console.log('新規subscriptionを作成...');
    const vapidResponse = await fetch(API_VAPID);
    const vapidKey = await vapidResponse.text();
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);

    sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
    });

    console.log('新規subscription作成完了:', sub.endpoint);
    return sub;
}

function getPlatformSettings() {
    return {
        twitcasting: document.getElementById('toggle-twitcasting')?.classList.contains('is-on') || false,
        youtube: document.getElementById('toggle-youtube')?.classList.contains('is-on') || false,
        youtubeCommunity: document.getElementById('toggle-youtube-community')?.classList.contains('is-on') || false,
        fanbox: document.getElementById('toggle-fanbox')?.classList.contains('is-on') || false,
        twitterMain: document.getElementById('toggle-twitter-main')?.classList.contains('is-on') || false,
        twitterSub: document.getElementById('toggle-twitter-sub')?.classList.contains('is-on') || false,
        milestone: document.getElementById('toggle-milestone')?.classList.contains('is-on') || false,
    };
}

async function savePlatformSettings() {
    const clientId = getClientId();
    if (!clientId) {
        console.error('Client IDが取得できません。設定保存を中止します。');
        return false;
    }

    const platformSettings = getPlatformSettings();
    console.log('プラットフォーム設定保存:', platformSettings);

    try {
        if (!('serviceWorker' in navigator)) throw new Error('ServiceWorker 未対応');
        const sw = await navigator.serviceWorker.ready;
        const sub = await sw.pushManager.getSubscription();
        if (!sub) throw new Error('購読情報が見つかりません。通知を有効にしてください。');

        const serializedSub = (typeof sub.toJSON === 'function') ? sub.toJSON() : JSON.parse(JSON.stringify(sub));

        const res = await fetch(API_SAVE_SETTINGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                clientId: clientId,
                subscription: serializedSub,
                settings: platformSettings
            })
        });

        if (!res.ok) {
            const text = await res.text().catch(()=>'<no-body>');
            throw new Error(`サーバーエラー: ${res.status} ${text}`);
        }

        try { localStorage.setItem('platformSettings', JSON.stringify(platformSettings)); } catch(e){}

        console.log('プラットフォーム設定保存成功');
        return true;

    } catch (e) {
        console.error('プラットフォーム設定保存失敗:', e);
        return false;
    }
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function mergeSettings(existing = {}, incoming = {}) {
  return { ...existing, ...incoming };
}

async function fetchPlatformSettingsFromServer({ timeoutMs = 5000 } = {}) {
  try {
    const clientId = await Promise.resolve(getClientId());
    if (!clientId) {
      console.log('[fetchPlatformSettings] clientId がないため設定取得をスキップ');
      return { ok: false, reason: 'no-clientId' };
    }

    const url = `/api/get-platform-settings?clientId=${encodeURIComponent(clientId)}`;
    const fetchOpts = {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      credentials: 'same-origin',
      cache: 'no-store'
    };

    const res = await fetchWithTimeout(url, fetchOpts, timeoutMs);

    if (!res.ok) {
      console.warn(`[fetchPlatformSettings] HTTP status=${res.status} ${res.statusText}`);
      return { ok: false, status: res.status, statusText: res.statusText };
    }

    const ct = res.headers.get('Content-Type') || '';
    if (!ct.includes('application/json')) {
      console.warn('[fetchPlatformSettings] 応答が JSON ではありません:', ct);
      return { ok: false, reason: 'invalid-content-type', contentType: ct };
    }

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error('[fetchPlatformSettings] JSON parse error', parseErr);
      return { ok: false, reason: 'json-parse-error', error: String(parseErr) };
    }

    if (!data || typeof data !== 'object') {
      console.warn('[fetchPlatformSettings] data が期待型でない', data);
      return { ok: false, reason: 'invalid-data' };
    }

    const incoming = data.settings || data;
    if (!incoming || typeof incoming !== 'object') {
      console.warn('[fetchPlatformSettings] settings が無効', incoming);
      return { ok: false, reason: 'no-settings' };
    }

    let existing = {};
    try {
      const raw = localStorage.getItem('platformSettings');
      existing = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('[fetchPlatformSettings] localStorage parse error, overwrite', e);
      existing = {};
    }

    const merged = mergeSettings(existing, incoming);
    localStorage.setItem('platformSettings', JSON.stringify(merged));
    console.log('[fetchPlatformSettings] サーバーから設定を取得しました:', merged);

    return { ok: true, settings: merged };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[fetchPlatformSettings] タイムアウト/中断', err);
      return { ok: false, reason: 'timeout' };
    }
    console.error('[fetchPlatformSettings] 取得失敗', err);
    return { ok: false, reason: 'exception', error: String(err) };
  }
}

async function loadPlatformSettingsUI() {
  try {
    const raw = localStorage.getItem('platformSettings');
    if (!raw) return { ok: false, reason: 'no-local' };

    let settings;
    try { settings = JSON.parse(raw); } catch (e) {
      console.warn('[loadPlatformSettingsUI] localStorage JSON parse error', e);
      return { ok: false, reason: 'parse-error' };
    }
    if (!settings || typeof settings !== 'object') return { ok: false, reason: 'invalid-data' };

    return { ok: true, settings };
  } catch (err) {
    console.error('[loadPlatformSettingsUI] error', err);
    return { ok: false, reason: 'exception', error: String(err) };
  }
}

async function loadPlatformSettingsUIFromServer($toggleNotify) {
  try {
    let hasSubscription = false;
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const sw = await navigator.serviceWorker.ready;
        const sub = await sw.pushManager.getSubscription();
        hasSubscription = !!sub;
      }
    } catch (e) {
      console.warn('[loadPlatformSettingsUIFromServer] subscription check error', e);
      hasSubscription = false;
    }

    if (!hasSubscription) {
      console.log('[loadPlatformSettingsUIFromServer] subscription 無のためサーバ反映をスキップ');
      const local = await loadPlatformSettingsUI();
      if (local.ok) {
        applySettingsToUI(local.settings);
        return { applied: true, source: 'local', settings: local.settings };
      } else {
        if ($toggleNotify) { 
          $toggleNotify.checked = false; 
          updatePlatformSettingsVisibility(false); 
        }
        return { applied: false, source: 'none' };
      }
    }

    const res = await fetchPlatformSettingsFromServer();
    if (res && res.ok && res.settings) {
      applySettingsToUI(res.settings);
      if ($toggleNotify) {
        const anyOn = Object.values(res.settings).some(v => !!v);
        $toggleNotify.checked = anyOn;
        updatePlatformSettingsVisibility(anyOn);
        updateToggleImage();
      }
      return { applied: true, source: 'server', settings: res.settings };
    }

    const local = await loadPlatformSettingsUI();
    if (local.ok) {
      applySettingsToUI(local.settings);
      return { applied: true, source: 'local', settings: local.settings };
    }

    if ($toggleNotify) { 
      $toggleNotify.checked = false; 
      updatePlatformSettingsVisibility(false); 
    }
    return { applied: false, source: 'none' };

  } catch (err) {
    console.error('[loadPlatformSettingsUIFromServer] unexpected error', err);
    if ($toggleNotify) { 
      $toggleNotify.checked = false; 
      updatePlatformSettingsVisibility(false); 
    }
    return { applied: false, source: 'error', error: String(err) };
  }
}

function applySettingsToUI(settings) {
  if (!settings || typeof settings !== 'object') return;
  const keyMap = {
    twitcasting: 'toggle-twitcasting',
    youtube: 'toggle-youtube',
    youtubeCommunity: 'toggle-youtube-community',
    fanbox: 'toggle-fanbox',
    twitterMain: 'toggle-twitter-main',
    twitterSub: 'toggle-twitter-sub',
    milestone: 'toggle-milestone'
  };
  for (const [key, value] of Object.entries(settings)) {
    const btnId = keyMap[key];
    if (!btnId) continue;
    const btn = document.getElementById(btnId);
    if (!btn) continue;
    btn.classList.toggle('is-on', !!value);
    const label = (btn.textContent || btnId).split(':')[0];
    btn.textContent = `${label}: ${value ? 'ON' : 'OFF'}`;
  }
}

async function initSubscriberNameUI() {
    const input = document.getElementById('subscriber-name-input');
    const btn = document.getElementById('subscriber-name-submit');
    const status = document.getElementById('subscriber-name-status');
    let linkedEl = document.getElementById('subscriber-linked-icon');

    if (!input || !btn || !status) {
        console.warn('[initSubscriberNameUI] UI要素が見つかりません');
        return;
    }

    const clientId = getClientId();

    function showLinked(visible) {
        if (!linkedEl) return;
        linkedEl.style.display = visible ? 'inline-block' : 'none';
    }

    let wrapper = input.closest('.subscriber-input-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'subscriber-input-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
    }

    const ICON_URL = 'https://img.icons8.com/?size=100&id=sz8cPVwzLrMP&format=png&color=000000';
    if (!linkedEl) {
        linkedEl = document.createElement('img');
        linkedEl.id = 'subscriber-linked-icon';
        linkedEl.className = 'subscriber-linked';
        linkedEl.src = ICON_URL;
        linkedEl.alt = '保存済み';
        linkedEl.style.display = 'none';
        input.insertAdjacentElement('afterend', linkedEl);
    } else if (linkedEl.tagName.toLowerCase() !== 'img') {
        const newImg = document.createElement('img');
        newImg.id = linkedEl.id;
        newImg.className = linkedEl.className || 'subscriber-linked';
        newImg.src = ICON_URL;
        newImg.alt = '保存済み';
        newImg.style.display = linkedEl.style.display || 'none';
        linkedEl.parentNode.replaceChild(newImg, linkedEl);
        linkedEl = newImg;
    } else {
        linkedEl.src = ICON_URL;
    }

    let currentNameValue = '';
    if (clientId) {
        try {
            const currentName = await fetchNameFromServer(clientId);
            if (currentName) {
                input.value = currentName;
                showLinked(true);
                currentNameValue = currentName;
            } else {
                input.value = '';
                showLinked(false);
            }
        } catch (e) {
            console.warn('[initSubscriberNameUI] name 取得エラー', e);
            showLinked(false);
        }
    }

    input.addEventListener('input', () => showLinked(false));

    btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const name = input.value ? input.value.trim() : '';
        if (!name) { 
            status.style.display = 'block';
            status.textContent = '名前を入力してください';
            status.className = 'status-message error-message';
            return; 
        }

        btn.disabled = true;
        status.style.display = 'block';
        status.textContent = '保存中...';
        status.className = 'status-message info-message';

        try {
            const ok = await saveNameToServer(clientId, name);
            if (ok) {
                status.textContent = '名前を保存しました';
                status.className = 'status-message success-message';
                showLinked(true);
            } else {
                status.textContent = '名前の保存に失敗しました';
                status.className = 'status-message error-message';
                showLinked(false);
            }
        } catch (e) {
            console.error('[SubscriberName] save error', e);
            status.textContent = '保存中にエラーが発生しました';
            status.className = 'status-message error-message';
            showLinked(false);
        } finally {
            btn.disabled = false;
            setTimeout(() => { status.style.display = 'none'; }, 4000);
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btn.click();
        }
    });

    return { 
        currentName: input.value || '', 
        showLinked
    };
}

// --- ログフィルター設定の初期化 ---
function initLogFilterSettings($toggleNotify) {
    const syncButton = document.getElementById('filter-sync-notification');
    const filterButtons = {
        twitcasting: document.getElementById('filter-twitcasting'),
        youtube: document.getElementById('filter-youtube'),
        youtubeCommunity: document.getElementById('filter-youtube-community'),
        fanbox: document.getElementById('filter-fanbox'),
        twitterMain: document.getElementById('filter-twitter-main'),
        twitterSub: document.getElementById('filter-twitter-sub'),
        milestone: document.getElementById('filter-milestone')
    };

    // LocalStorageからフィルター設定を読み込む
    function loadFilterSettings() {
        try {
            const saved = localStorage.getItem('logFilterSettings');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('フィルター設定の読み込みに失敗', e);
        }
        return {
            syncWithNotification: true,
            twitcasting: true,
            youtube: true,
            youtubeCommunity: true,
            fanbox: true,
            twitterMain: true,
            twitterSub: true,
            milestone: true
        };
    }

    // フィルター設定を保存
    function saveFilterSettings(settings) {
        try {
            localStorage.setItem('logFilterSettings', JSON.stringify(settings));
            console.log('[saveFilterSettings] 保存:', settings);
        } catch (e) {
            console.error('フィルター設定の保存に失敗', e);
        }
    }

    // 現在のフィルター設定を取得
    function getCurrentFilterSettings() {
        return {
            syncWithNotification: syncButton?.classList.contains('is-on') || false,
            twitcasting: filterButtons.twitcasting?.classList.contains('is-on') || false,
            youtube: filterButtons.youtube?.classList.contains('is-on') || false,
            youtubeCommunity: filterButtons.youtubeCommunity?.classList.contains('is-on') || false,
            fanbox: filterButtons.fanbox?.classList.contains('is-on') || false,
            twitterMain: filterButtons.twitterMain?.classList.contains('is-on') || false,
            twitterSub: filterButtons.twitterSub?.classList.contains('is-on') || false,
            milestone: filterButtons.milestone?.classList.contains('is-on') || false
        };
    }

    // UIにフィルター設定を適用
    function applyFilterSettingsToUI(settings) {
        console.log('[applyFilterSettingsToUI] 適用:', settings);
        
        if (syncButton) {
            syncButton.classList.toggle('is-on', settings.syncWithNotification);
            syncButton.textContent = `通知設定連動: ${settings.syncWithNotification ? 'ON' : 'OFF'}`;
        }

        Object.keys(filterButtons).forEach(key => {
            const btn = filterButtons[key];
            if (btn) {
                btn.classList.toggle('is-on', settings[key]);
                const label = btn.textContent.split(':')[0];
                btn.textContent = `${label}: ${settings[key] ? 'ON' : 'OFF'}`;
                btn.disabled = settings.syncWithNotification;
            }
        });
    }

    // 通知設定からフィルター設定を同期
    function syncFilterWithNotificationSettings() {
        const platformSettings = getPlatformSettings();
        console.log('[syncFilterWithNotificationSettings] 通知設定:', platformSettings);
        return {
            syncWithNotification: true,
            twitcasting: platformSettings.twitcasting || false,
            youtube: platformSettings.youtube || false,
            youtubeCommunity: platformSettings.youtubeCommunity || false,
            fanbox: platformSettings.fanbox || false,
            twitterMain: platformSettings.twitterMain || false,
            twitterSub: platformSettings.twitterSub || false,
            milestone: platformSettings.milestone || false
        };
    }

    // ログをフィルタリング
    function applyLogFiltering() {
        const settings = getCurrentFilterSettings();
        const cards = document.querySelectorAll('#logs .card[data-platform]');

        console.log('[applyLogFiltering] フィルター適用:', settings, 'カード数:', cards.length);

        cards.forEach(card => {
            const platform = card.getAttribute('data-platform');
            let shouldShow = true;

            switch(platform) {
                case 'twitcasting':
                    shouldShow = settings.twitcasting;
                    break;
                case 'youtube':
                    shouldShow = settings.youtube;
                    break;
                case 'youtube-community':
                    shouldShow = settings.youtubeCommunity;
                    break;
                case 'fanbox':
                    shouldShow = settings.fanbox;
                    break;
                case 'twitter-main':
                    shouldShow = settings.twitterMain;
                    break;
                case 'twitter-sub':
                    shouldShow = settings.twitterSub;
                    break;
                case 'milestone':
                    shouldShow = settings.milestone;
                    break;
                default:
                    shouldShow = true;
            }

            card.classList.toggle('filtered-out', !shouldShow);
        });
    }

    // 通知設定連動ボタンのイベント
    if (syncButton) {
        syncButton.addEventListener('click', () => {
            const isCurrentlyOn = syncButton.classList.contains('is-on');
            const newState = !isCurrentlyOn;

            console.log('[syncButton] クリック: ', isCurrentlyOn, '->', newState);

            if (newState) {
                // 連動ONにする場合、通知設定から同期
                const synced = syncFilterWithNotificationSettings();
                applyFilterSettingsToUI(synced);
                saveFilterSettings(synced);
            } else {
                // 連動OFFにする場合
                const current = getCurrentFilterSettings();
                current.syncWithNotification = false;
                applyFilterSettingsToUI(current);
                saveFilterSettings(current);
            }

            applyLogFiltering();
        });
    }

    // 各プラットフォームのフィルターボタンのイベント
    Object.keys(filterButtons).forEach(key => {
        const btn = filterButtons[key];
        if (btn) {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;

                console.log('[filterButton] クリック:', key);

                btn.classList.toggle('is-on');
                const label = btn.textContent.split(':')[0];
                btn.textContent = `${label}: ${btn.classList.contains('is-on') ? 'ON' : 'OFF'}`;

                const settings = getCurrentFilterSettings();
                saveFilterSettings(settings);
                applyLogFiltering();
            });
        }
    });

    // 初期設定を読み込んで適用
    const initialSettings = loadFilterSettings();
    
    // 通知設定連動がONの場合は通知設定から同期
    if (initialSettings.syncWithNotification && $toggleNotify) {
        const synced = syncFilterWithNotificationSettings();
        applyFilterSettingsToUI(synced);
        saveFilterSettings(synced);
    } else {
        applyFilterSettingsToUI(initialSettings);
    }

    // グローバルに公開(他の部分から呼び出せるように)
    window.applyLogFiltering = applyLogFiltering;
    window.syncFilterWithNotificationSettings = syncFilterWithNotificationSettings;
    window.applyFilterSettingsToUI = applyFilterSettingsToUI;
    window.saveFilterSettings = saveFilterSettings;

    console.log('[initLogFilterSettings] 初期化完了');
}

// --- Main Execution ---
document.addEventListener('DOMContentLoaded', async () => {
    const $toggleNotify = document.getElementById('toggle-notify');
    const $logs = document.getElementById('logs');
    const $status = document.getElementById('status');
    const $btnSendTest = document.getElementById('btn-send-test');
    const $autoRefreshCheckbox = document.getElementById('auto-refresh');

    console.log('[Main] 初期化開始');

    function areAllPlatformsDisabled(settings) {
        return Object.values(settings).every(v => !v);
    }

    if (!$logs || !$status) {
        console.error('履歴UI要素が不足しています');
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data?.type === 'NAVIGATE' && event.data.url) {
                window.location.href = event.data.url;
            }
        });
    }

    // プラットフォーム設定UIの初期化
    initPlatformSettingsUI($toggleNotify);
    await loadPlatformSettingsUI();
    const serverResult = await loadPlatformSettingsUIFromServer($toggleNotify);
    if (serverResult && serverResult.applied && serverResult.settings) {
        const settings = serverResult.settings;
        const anyOn = Object.values(settings).some(v => !!v);
        $toggleNotify.checked = anyOn;
        updatePlatformSettingsVisibility(anyOn);
        updateToggleImage();
    }

    // ログフィルター設定の初期化（プラットフォーム設定の後に呼び出す）
    initLogFilterSettings($toggleNotify);

    const subscriberUI = await initSubscriberNameUI();
    const showLinked = (subscriberUI && typeof subscriberUI.showLinked === 'function') ? subscriberUI.showLinked : (()=>{});

    if ($toggleNotify) {
        let enabled = false;
        try {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                const sw = await navigator.serviceWorker.ready;
                let sub = await sw.pushManager.getSubscription();

                if (!sub) {
                    const localSubRaw = localStorage.getItem('pushSubscription');
                    if (localSubRaw) {
                        try { sub = JSON.parse(localSubRaw); } catch (e) { sub = null; }
                    }
                }

                if (sub) {
                    enabled = true;
                    try {
                        const serialized = (typeof sub.toJSON === 'function') ? sub.toJSON() : sub;
                        const clientId = getClientId();
                        if (clientId) {
                            await sendSubscriptionToServer(serialized);
                            try { localStorage.setItem('pushSubscription', JSON.stringify(serialized)); } catch {}
                        }
                    } catch (e) {
                        console.warn('既存購読のサーバ送信失敗', e);
                    }
                }
            }
        } catch (e) {
            console.warn('購読チェック失敗', e);
        }

        const settings = getPlatformSettings();
        if (areAllPlatformsDisabled(settings)) {
            enabled = false;
            showLinked(false);
        }

        $toggleNotify.checked = enabled;
        updatePlatformSettingsVisibility(enabled);
        updateToggleImage();

        let pushProcessing = false;
        $toggleNotify.addEventListener('change', async () => {
            if (pushProcessing) return;
            pushProcessing = true;

            try {
                if ($toggleNotify.checked) {
                    let sub = null;
                    try {
                        sub = await initPush();
                    } catch (e) {
                        console.error('Push初期化失敗:', e);
                        $toggleNotify.checked = false;
                        updatePlatformSettingsVisibility(false);
                        updateToggleImage();
                        return;
                    }

                    const saveOk = await savePlatformSettings();
                    if (!saveOk) {
                        console.warn('プラットフォーム設定の保存に失敗したため購読を維持しません');
                        $toggleNotify.checked = false;
                        updatePlatformSettingsVisibility(false);
                        updateToggleImage();
                        return;
                    }

                    try {
                        const input = document.getElementById('subscriber-name-input');
                        const name = input ? (input.value || '').trim() : '';
                        if (name) {
                            const ok = await saveNameToServer(getClientId(), name);
                            if (!ok) console.warn('通知ON時の名前保存に失敗しました');
                            else showLinked(true);
                        }
                    } catch (e) {
                        console.warn('通知ON時の名前保存でエラー', e);
                    }

                } else {
                    try {
                        await unsubscribePush();
                        showLinked(false);
                    } catch (e) {
                        console.error('unsubscribe 失敗', e);
                        $toggleNotify.checked = true;
                        updatePlatformSettingsVisibility(true);
                        updateToggleImage();
                    }
                }
            } catch (e) {
                console.warn('Push操作で予期せぬエラー', e);
                $toggleNotify.checked = false;
                updatePlatformSettingsVisibility(false);
                document.body.classList.remove('notifications-enabled', 'settings-on');
            } finally {
                pushProcessing = false;
                updatePlatformSettingsVisibility($toggleNotify.checked);
                updateToggleImage();
            }
        });
    }

    if ($btnSendTest) {
        $btnSendTest.addEventListener('click', async () => {
            $btnSendTest.disabled = true;
            await sendTestToMe();
            $btnSendTest.disabled = false;
        });
    }

    const $btnMoreLogs = document.getElementById('more-logs-button');
    if ($btnMoreLogs && $logs && $status) {
        $btnMoreLogs.addEventListener('click', () => fetchHistoryMore($logs, $status));
    }

    const $btnRefresh = document.getElementById('btn-refresh');
    if ($btnRefresh && $logs && $status) {
        $btnRefresh.addEventListener('click', () => {
            _paging.offset = 0;
            _paging.hasMore = true;
            fetchHistory($logs, $status, { append: false });
        });
    }

    if ($autoRefreshCheckbox && $logs && $status) {
        $autoRefreshCheckbox.addEventListener('change', e => {
            if (e.target.checked) {
                _paging.offset = 0;
                fetchHistory($logs, $status, { append: false });
                autoTimer = setInterval(() => {
                    _paging.offset = 0;
                    fetchHistory($logs, $status, { append: false });
                }, 30000);
            } else {
                clearInterval(autoTimer);
            }
        });
        if ($autoRefreshCheckbox.checked) $autoRefreshCheckbox.dispatchEvent(new Event('change'));
    }

    if ($logs && $status) fetchHistory($logs, $status, { append: false });
});