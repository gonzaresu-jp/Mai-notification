// main.js - メイン初期化処理（header.html fetch 挿入対応版）
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
  initHeaderDependentUI,
  loadPlatformSettingsUIFromServer
} from './uiController.js';

let autoTimer = null;

function areAllPlatformsDisabled(settings) {
  return Object.values(settings).every(v => !v);
}

// header/footer 挿入完了待ち
async function waitLayoutReady() {
  if (window.__layoutReady && typeof window.__layoutReady.then === "function") {
    await window.__layoutReady;
    return;
  }
  // 保険: #nav-menu or #toggle-notify が出るまで短時間待つ
  for (let i = 0; i < 80; i++) {
    if (document.getElementById("nav-menu") || document.getElementById("toggle-notify")) return;
    await new Promise(r => setTimeout(r, 50));
  }
}

function areAllPlatformsDisabledSafe() {
  try {
    const s = getPlatformSettings();
    return areAllPlatformsDisabled(s);
  } catch {
    return true;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const $logs = document.getElementById('logs');
  const $status = document.getElementById('status');

  console.log('[Main] 初期化開始');

  if (!$logs || !$status) {
    console.error('履歴UI要素が不足しています');
  }

  // =========================
  // 履歴更新の統一関数（Pushに依存しない）
  // =========================
  let lastHistoryRefreshAt = 0;

  async function refreshHistory({ reason = 'manual', force = false } = {}) {
    if (!$logs || !$status) return;

    const now = Date.now();
    if (!force && (now - lastHistoryRefreshAt) < 1500) return;
    lastHistoryRefreshAt = now;

    console.log(`[Main] 履歴更新: reason=${reason}, force=${force}`);

    if (force) clearHistoryCache();

    PAGING.offset = 0;
    PAGING.hasMore = true;

    fetchHistory($logs, $status, { append: false, useCache: !force });
  }

  // =========================
  // ServiceWorker メッセージリスナー（ヘッダー有無に依存しないので先に登録OK）
  // =========================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      console.log('[Main] ServiceWorkerからメッセージ:', event.data);

      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        window.location.href = event.data.url;
        return;
      }

      if (event.data?.type === 'HISTORY_INVALIDATE') {
        if (document.visibilityState === 'visible') {
          refreshHistory({ reason: 'sw_invalidate', force: true });
        }
        return;
      }

      if (event.data?.type === 'CLEAR_HISTORY_CACHE') {
        console.log('[Main] 履歴キャッシュをクリアします（通知受信）');
        clearHistoryCache();

        if (document.visibilityState === 'visible') {
          setTimeout(() => {
            refreshHistory({ reason: 'sw_clear_cache', force: true });
          }, 800);
        }
        return;
      }

      if (event.data?.type === 'CLEAR_AND_RELOAD_HISTORY') {
        console.log('[Main] 履歴をクリア＆リロードします（通知クリック）');
        refreshHistory({ reason: 'sw_clear_and_reload', force: true });
        return;
      }
    });
  }

  // =========================
  // ★重要: header/footer 注入完了を待つ
  // =========================
  await waitLayoutReady();

  // uiController 側の「ヘッダー依存UI初期化」を確実に走らせる
  // （ハンバーガー、通知トグルUI、推し日数、プラットフォームボタンのデリゲーション等）
  try {
    await initHeaderDependentUI();
  } catch (e) {
    console.warn('[Main] initHeaderDependentUI error', e);
  }

  // ここから先は、ヘッダー内要素が存在する前提で取得してOK
  const $toggleNotify = document.getElementById('toggle-notify');
  const $btnSendTest = document.getElementById('btn-send-test');
  const $autoRefreshCheckbox = document.getElementById('auto-refresh');

  // =========================
  // プラットフォーム設定UIの初期化
  // =========================
  // initPlatformSettingsUI は（あなたの最新版 uiController なら）デリゲーションで動くが、
  // 旧版でもここで確実に bind できるようにしておく
  initPlatformSettingsUI($toggleNotify);

  const serverResult = await loadPlatformSettingsUIFromServer($toggleNotify);
  if (serverResult && serverResult.applied && serverResult.settings && $toggleNotify) {
    const settings = serverResult.settings;
    const anyOn = Object.values(settings).some(v => !!v);
    $toggleNotify.checked = anyOn;
    updatePlatformSettingsVisibility(anyOn);
    updateToggleImage();
  }

  // ログフィルター設定の初期化（通知トグル参照するので header 後）
  initLogFilterSettings($toggleNotify);

  // 購読者名UIの初期化（input/button が header 内なので header 後）
  let showLinked = () => {};
  initSubscriberNameUI()
    .then(subscriberUI => {
      showLinked =
        (subscriberUI && typeof subscriberUI.showLinked === 'function')
          ? subscriberUI.showLinked
          : (() => {});
    })
    .catch(e => {
      console.warn('[Main] 購読者名UI初期化エラー', e);
    });

  // =========================
  // 通知トグルの初期化（Push処理）
  // =========================
  if ($toggleNotify) {
    let enabled = false;

    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const sw = await navigator.serviceWorker.ready;
        let sub = await sw.pushManager.getSubscription();

        // 互換: localStorage に保持していた購読情報がある場合
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

    // 全プラットフォームOFFなら通知は強制OFF
    if (areAllPlatformsDisabledSafe()) {
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

  // =========================
  // テスト送信ボタン（header 内なので header 後）
  // =========================
  if ($btnSendTest) {
    $btnSendTest.addEventListener('click', async () => {
      $btnSendTest.disabled = true;
      await sendTestToMe();
      $btnSendTest.disabled = false;
    });
  }

  // =========================
  // もっと読み込むボタン（main 側）
  // =========================
  const $btnMoreLogs = document.getElementById('more-logs-button');
  if ($btnMoreLogs && $logs && $status) {
    $btnMoreLogs.addEventListener('click', () => fetchHistoryMore($logs, $status));
  }

  // =========================
  // 更新ボタン（手動リロードは常にDB準拠）
  // =========================
  const $btnRefresh = document.getElementById('btn-refresh');
  if ($btnRefresh && $logs && $status) {
    $btnRefresh.addEventListener('click', () => {
      refreshHistory({ reason: 'manual_refresh', force: true });
    });
  }

  // =========================
  // 自動更新（header/本文どっちにあっても、取得は header 後なので安全）
  // =========================
  if ($autoRefreshCheckbox && $logs && $status) {
    $autoRefreshCheckbox.addEventListener('change', e => {
      if (e.target.checked) {
        refreshHistory({ reason: 'auto_start', force: true });

        autoTimer = setInterval(() => {
          refreshHistory({ reason: 'auto_tick', force: true });
        }, 30000);
      } else {
        clearInterval(autoTimer);
      }
    });

    if ($autoRefreshCheckbox.checked) {
      $autoRefreshCheckbox.dispatchEvent(new Event('change'));
    }
  }

  // =========================
  // 初回履歴読み込み（リロード時は必ずDB準拠）
  // =========================
  if ($logs && $status) {
    setTimeout(() => {
      refreshHistory({ reason: 'initial_load', force: true });
    }, 100);
  }

  // =========================
  // バックグラウンド復帰時の更新（Pushに依存しない）
  // =========================
  let backgroundSince = null;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      backgroundSince = Date.now();
      return;
    }

    if (document.visibilityState === 'visible') {
      const sleptMs = backgroundSince ? (Date.now() - backgroundSince) : 0;

      if (sleptMs > 1000) {
        refreshHistory({ reason: 'resume', force: true });
      }

      backgroundSince = null;
    }
  });
});
