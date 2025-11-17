// main.js (client side) - iOS対応版
const API_HISTORY = '/api/history';
const API_VAPID = '/api/vapidPublicKey';
const API_SUBSCRIBE = '/api/save-platform-settings';
const API_SEND_TEST = '/api/send-test';
const API_SAVE_SETTINGS = '/api/save-platform-settings';

let autoTimer = null;

// --- UI制御ユーティリティ ---
const $body = document.getElementById('app-body');

// iOS Helper チェック
if (typeof iosHelper === 'undefined') {
    console.warn('iOS Helper not loaded - iOS features disabled');
}

function updatePlatformSettingsVisibility(isChecked) {
    if (!$body) return; 

    if (isChecked) {
        $body.classList.add('settings-on');
    } else {
        $body.classList.remove('settings-on');
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

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Worker 未対応ブラウザです');
        return null;
    }

    try {
        // 登録
        const registration = await navigator.serviceWorker.register('/pushweb/service-worker.js');
        console.log('Service Worker 登録成功:', registration);

        // 登録後 ready を待つ
        const sw = await navigator.serviceWorker.ready;
        console.log('Service Worker ready:', sw);
        return sw;
    } catch (e) {
        console.error('Service Worker 登録失敗:', e);
        return null;
    }
}


// プラットフォーム別設定の保存
async function savePlatformSettings() {
    const clientId = getClientId();
    if (!clientId) return;

    const platformSettings = getPlatformSettings();
    console.log('プラットフォーム設定保存:', platformSettings);

    try {
        const subRaw = localStorage.getItem('pushSubscription');
        if (!subRaw) throw new Error('購読情報が見つかりません。通知を有効にしてください。');
        const sub = JSON.parse(subRaw);

        const res = await fetch(API_SAVE_SETTINGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId,
                subscription: sub,
                settings: platformSettings
            })
        });

        if (!res.ok) throw new Error(await res.text());
        console.log('プラットフォーム設定保存成功');

    } catch (e) {
        console.error('プラットフォーム設定保存失敗:', e);
        const $toggleNotify = document.getElementById('toggle-notify');
        if ($toggleNotify) $toggleNotify.checked = false;
    }
}

// --- Push Notification ---（iOS対応版）
async function initPush() {
    console.log('--- Push Initialization START ---');
    
    // iOS対応: PWA必須チェック
    if (typeof iosHelper !== 'undefined' && !iosHelper.isPushAvailable()) {
        if (iosHelper.isIOS && !iosHelper.isPWA) {
            console.warn('iOS: PWAモードが必要です');
            // ガイドを表示
            if (iosHelper.shouldShowInstallGuide()) {
                iosHelper.showInstallGuide();
            }
            throw new Error('iOS_PWA_REQUIRED: ホーム画面に追加してください');
        }
        throw new Error('Push Notificationに対応していません');
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.error('Push Notificationに対応していません。');
        throw new Error('Push Notificationに対応していません。');
    }

    let sw;
    try {
        console.log('1. Service Workerを取得中...');
        sw = await navigator.serviceWorker.ready;
        console.log('1. Service Workerの取得が完了しました。', sw);
    } catch (e) {
        console.error('1. Service Workerの取得に失敗しました。', e);
        throw new Error(`Service Worker取得失敗: ${e.message}`);
    }

    try {
        console.log('2. VAPID公開鍵を取得中...');
        const response = await fetch(API_VAPID);
        if (!response.ok) {
             throw new Error(`VAPID公開鍵の取得に失敗: ${response.statusText}`);
        }
        const vapidPublicKey = await response.text();
        console.log('2. VAPID公開鍵の取得が完了しました。');

        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
        
        console.log('3. プッシュ通知を購読中...');
        const sub = await sw.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
        console.log('3. プッシュ通知の購読が完了しました。');

        console.log('4. 購読情報をサーバーに送信中...');
        await sendSubscriptionToServer(sub);
        console.log('4. 購読情報のサーバー送信が完了しました。');

        localStorage.setItem('pushSubscription', JSON.stringify(sub));
        console.log('--- Push Initialization SUCCESS ---');
        return sub;

    } catch (e) {
        console.error('プッシュ通知の購読またはサーバー送信に失敗しました。', e);
        localStorage.removeItem('pushSubscription');
        throw new Error(`Push購読失敗: ${e.message}`);
    }
}

// main.js の sendSubscriptionToServer 関数を詳細ログ付きに修正

async function sendSubscriptionToServer(sub) {
    const clientId = getClientId();
    
    console.log('========== 購読情報送信デバッグ START ==========');
    console.log('1. Client ID:', clientId);
    console.log('2. Subscription:', sub);
    console.log('3. Endpoint:', sub?.endpoint);
    
    if (!clientId) {
        console.error('❌ Client IDが取得できません。購読情報を送信できません。');
        return;
    }
    
    const requestBody = {
        clientId: clientId,
        subscription: sub
    };
    
    console.log('4. Request Body:', JSON.stringify(requestBody, null, 2));
    
    try {
        console.log('5. Sending POST to:', API_SUBSCRIBE);
        
        const response = await fetch(API_SUBSCRIBE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        console.log('6. Response Status:', response.status);
        console.log('7. Response OK:', response.ok);

        const responseText = await response.text();
        console.log('8. Response Text:', responseText);

        if (!response.ok) {
            console.error('❌ 購読情報のサーバー送信に失敗しました。');
            console.error('Status:', response.status);
            console.error('Response:', responseText);
            throw new Error(`サーバーエラー: 購読情報の保存に失敗 (${response.status})`);
        }

        let responseData;
        try {
            responseData = JSON.parse(responseText);
            console.log('9. Response Data:', responseData);
        } catch (e) {
            console.warn('⚠️ JSON parse failed, response was:', responseText);
        }

        console.log('✅ 購読情報のサーバー送信が完了しました。');
        console.log('========== 購読情報送信デバッグ END ==========');
        
    } catch (e) {
        console.error('========== エラー発生 ==========');
        console.error('Error Type:', e.name);
        console.error('Error Message:', e.message);
        console.error('Error Stack:', e.stack);
        console.error('========== エラー終了 ==========');
        throw e;
    }
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

// --- Test Notification ---
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

// --- History Fetching ---
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
    
    return `
        <div class="card${statusClass}">
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

    const limit = 5;
    const offset = append ? _paging.offset : 0;
    const clientId = getClientId();

    const url = `${API_HISTORY}?clientId=${clientId}&limit=${limit}&offset=${offset}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch history: ${res.status}`);
        }

        const data = await res.json();
        
        const newLogItems = data.logs.map(createLogItem).join('');
        
        if ($logsEl) {
             if (!append) {
                $logsEl.innerHTML = newLogItems;
                _paging.offset = 0;
            } else {
                $logsEl.insertAdjacentHTML('beforeend', newLogItems);
            }
        }

        _paging.offset += data.logs.length;
        _paging.hasMore = data.hasMore;

        const $btnMore = document.getElementById('more-logs-button');
        if ($btnMore) {
            $btnMore.style.display = _paging.hasMore ? 'block' : 'none';
        }

        if ($statusEl) { 
            $statusEl.textContent = `表示中: ${_paging.offset} / 全 ${data.total} 件`;
            $statusEl.className = 'status-message success-message';
        }

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

async function fetchPlatformSettingsFromServer() {
    const clientId = getClientId();
    if (!clientId) {
        console.log('clientId がないため設定取得をスキップ');
        return null;
    }
    
    try {
        const res = await fetch(`/api/get-platform-settings?clientId=${clientId}`);
        if (!res.ok) {
            console.log('サーバー設定取得不可 (status:', res.status, ') - ローカル設定を使用します');
            return null;
        }
        const data = await res.json();
        if (data && data.settings) {
            console.log('サーバーから設定を取得しました:', data.settings);
            localStorage.setItem('platformSettings', JSON.stringify(data.settings));
            return data.settings;
        }
        return null;
    } catch (e) {
        console.log('サーバーからプラットフォーム設定取得失敗 - ローカル設定を使用:', e.message);
        return null;
    }
}

async function loadPlatformSettingsUIFromServer() {
    const settings = await fetchPlatformSettingsFromServer();
    if (!settings) {
        console.log('サーバー設定なし - ローカル設定のみ使用します');
        return;
    }
    
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
        btn.textContent = `${btn.textContent.split(':')[0]}: ${value ? 'ON' : 'OFF'}`;
    }
}

// --- Main Execution ---
document.addEventListener('DOMContentLoaded', async () => {
    const $toggleNotify = document.getElementById('toggle-notify');
    const $logs = document.getElementById('logs');
    const $status = document.getElementById('status');
    const $btnSendTest = document.getElementById('btn-send-test');
    const $autoRefreshCheckbox = document.getElementById('auto-refresh');

    if (!$logs || !$status) {
        console.error('履歴UI要素が不足しています');
    }

    // Service Worker からのメッセージを受信
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            console.log('[Client] Received message from SW:', event.data);
            
            if (event.data && event.data.type === 'NAVIGATE') {
                const targetUrl = event.data.url;
                console.log('[Client] Navigating to:', targetUrl);
                
                if (targetUrl) {
                    window.location.href = targetUrl;
                }
            }
        });
        
        console.log('[Client] Service Worker message listener registered');
    }

    // iOS対応: 初期化処理（最初に実行）
    if (typeof iosHelper !== 'undefined') {
        console.log('[iOS] デバッグ情報:', iosHelper.getDebugInfo());
        
        // インストールガイド表示（遅延実行）
        if (iosHelper.shouldShowInstallGuide()) {
            setTimeout(() => {
                iosHelper.showInstallGuide();
            }, 2000);
        }

        // 通知ブロック警告
        setTimeout(() => {
            iosHelper.showNotificationBlockedWarning();
        }, 1000);
    }

    // プラットフォーム設定UI初期化
    async function loadPlatformSettingsUI() {
        const subRaw = localStorage.getItem('platformSettings');
        if (!subRaw) return;
        const settings = JSON.parse(subRaw);
        
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
            if (btn) {
                if (value) btn.classList.add('is-on');
                else btn.classList.remove('is-on');
                btn.textContent = `${btn.textContent.split(':')[0]}: ${value ? 'ON' : 'OFF'}`;
            }
        }
    }

    initPlatformSettingsUI($toggleNotify);
    loadPlatformSettingsUI();
    await loadPlatformSettingsUIFromServer();

    // 全体通知トグル初期化
    (async () => {
        if (!$toggleNotify) return;

        let enabled = false;
        try {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                const sw = await navigator.serviceWorker.ready;
                const sub = await sw.pushManager.getSubscription();
                if (sub) {
                    enabled = true;
                    localStorage.setItem('pushSubscription', JSON.stringify(sub));
                    await sendSubscriptionToServer(sub);
                } else {
                    const localSubRaw = localStorage.getItem('pushSubscription');
                    if (localSubRaw) enabled = true;
                }
            }
        } catch (e) {
            console.warn('購読チェック失敗', e);
        }

        $toggleNotify.checked = enabled;
        updatePlatformSettingsVisibility(enabled);

        // 画像切り替えの初期化関数
        function updateToggleImage() {
            const body = document.body;
            if ($toggleNotify.checked) {
                body.classList.add('notifications-enabled');
            } else {
                body.classList.remove('notifications-enabled');
            }
        }

        // 初期状態を反映
        updateToggleImage();

        $toggleNotify.addEventListener('change', async () => {
            if ($toggleNotify.checked) {
                try {
                    const sub = await initPush();
                    if (sub) await savePlatformSettings();
                    updatePlatformSettingsVisibility(true);
                } catch (e) {
                    console.error('Push初期化失敗:', e);
                    $toggleNotify.checked = false;
                    updatePlatformSettingsVisibility(false);
                }
            } else {
                await unsubscribePush();
                updatePlatformSettingsVisibility(false);
            }
            
            // トグル変更時にも画像を更新
            updateToggleImage();
        });
    })();

    // テスト通知
    if ($btnSendTest) {
        $btnSendTest.addEventListener('click', async () => {
            $btnSendTest.disabled = true;
            await sendTestToMe();
            $btnSendTest.disabled = false;
        });
    }

    // 履歴取得・"もっと見る"
    const $btnMoreLogs = document.getElementById('more-logs-button');
    if ($btnMoreLogs && $logs && $status) {
        $btnMoreLogs.addEventListener('click', () => fetchHistoryMore($logs, $status));
    }

    // 手動更新ボタン
    const $btnRefresh = document.getElementById('btn-refresh');
    if ($btnRefresh && $logs && $status) {
        $btnRefresh.addEventListener('click', () => {
            _paging.offset = 0;
            _paging.hasMore = true;
            fetchHistory($logs, $status, { append: false });
        });
    }

    // 自動更新
    if ($autoRefreshCheckbox && $logs && $status) {
        $autoRefreshCheckbox.addEventListener('change', (e) => {
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

    // 初回履歴取得
    if ($logs && $status) fetchHistory($logs, $status, { append: false });
});