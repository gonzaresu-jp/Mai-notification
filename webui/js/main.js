// main.js - メイン初期化処理
import { PAGING, getClientId } from './config.js';
import { initPush, unsubscribePush, sendTestToMe, sendSubscriptionToServer } from './pushService.js';
import { savePlatformSettings, getPlatformSettings } from './settingsService.js';
import { saveNameToServer, initSubscriberNameUI } from './subscriberService.js';
import { fetchHistory, fetchHistoryMore, clearHistoryCache } from './historyService.js';
import { initLogFilterSettings } from './filterService.js';
import { 
  updateToggleImage, 
  updatePlatformSettingsVisibility, 
  initPlatformSettingsUI,
  loadPlatformSettingsUIFromServer 
} from './uiController.js';

let autoTimer = null;

function areAllPlatformsDisabled(settings) {
  return Object.values(settings).every(v => !v);
}

document.addEventListener('DOMContentLoaded', async () => {
  const $toggleNotify = document.getElementById('toggle-notify');
  const $logs = document.getElementById('logs');
  const $status = document.getElementById('status');
  const $btnSendTest = document.getElementById('btn-send-test');
  const $autoRefreshCheckbox = document.getElementById('auto-refresh');

  console.log('[Main] 初期化開始');

  if (!$logs || !$status) {
    console.error('履歴UI要素が不足しています');
  }

  // ServiceWorker メッセージリスナー
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        window.location.href = event.data.url;
      }
    });
  }

  // プラットフォーム設定UIの初期化
  initPlatformSettingsUI($toggleNotify);
  const serverResult = await loadPlatformSettingsUIFromServer($toggleNotify);
  if (serverResult && serverResult.applied && serverResult.settings) {
    const settings = serverResult.settings;
    const anyOn = Object.values(settings).some(v => !!v);
    $toggleNotify.checked = anyOn;
    updatePlatformSettingsVisibility(anyOn);
    updateToggleImage();
  }

  // ログフィルター設定の初期化
  initLogFilterSettings($toggleNotify);

  // 購読者名UIの初期化（非同期で実行、完了を待たない）
  let showLinked = () => {};
  initSubscriberNameUI().then(subscriberUI => {
    showLinked = (subscriberUI && typeof subscriberUI.showLinked === 'function') ? subscriberUI.showLinked : (()=>{});
  }).catch(e => {
    console.warn('[Main] 購読者名UI初期化エラー', e);
  });

  // 通知トグルの初期化
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

  // テスト送信ボタン
  if ($btnSendTest) {
    $btnSendTest.addEventListener('click', async () => {
      $btnSendTest.disabled = true;
      await sendTestToMe();
      $btnSendTest.disabled = false;
    });
  }

  // もっと読み込むボタン
  const $btnMoreLogs = document.getElementById('more-logs-button');
  if ($btnMoreLogs && $logs && $status) {
    $btnMoreLogs.addEventListener('click', () => fetchHistoryMore($logs, $status));
  }

  // 更新ボタン
  const $btnRefresh = document.getElementById('btn-refresh');
  if ($btnRefresh && $logs && $status) {
    $btnRefresh.addEventListener('click', () => {
      clearHistoryCache(); // キャッシュをクリア
      PAGING.offset = 0;
      PAGING.hasMore = true;
      fetchHistory($logs, $status, { append: false, useCache: false });
    });
  }

  // 自動更新
  if ($autoRefreshCheckbox && $logs && $status) {
    $autoRefreshCheckbox.addEventListener('change', e => {
      if (e.target.checked) {
        clearHistoryCache(); // 自動更新開始時にキャッシュクリア
        PAGING.offset = 0;
        fetchHistory($logs, $status, { append: false, useCache: false });
        autoTimer = setInterval(() => {
          clearHistoryCache(); // 毎回キャッシュクリア
          PAGING.offset = 0;
          fetchHistory($logs, $status, { append: false, useCache: false });
        }, 30000);
      } else {
        clearInterval(autoTimer);
      }
    });
    if ($autoRefreshCheckbox.checked) $autoRefreshCheckbox.dispatchEvent(new Event('change'));
  }

  // 初回履歴読み込み（即座に開始）
  if ($logs && $status) {
    // ページ表示を優先するため、少し遅延させる
    setTimeout(() => {
      fetchHistory($logs, $status, { append: false });
    }, 100);
  }
});