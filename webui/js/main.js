// main.js - メイン初期化処理（header.html fetch 挿入対応版）

import { PAGING, getClientId } from './config.js';
import { initPush, unsubscribePush, sendTestToMe, sendSubscriptionToServer } from './pushService.js';
import { savePlatformSettings, getPlatformSettings } from './settingsService.js';
import { saveNameToServer, initSubscriberNameUI } from './subscriberService.js';
import { fetchHistory, fetchHistoryMore, clearJsonCache } from './historyService.js';
import { initLogFilterSettings } from './filterService.js';
import {
  updateToggleImage,
  updatePlatformSettingsVisibility,
  initPlatformSettingsUI,
  initHeaderDependentUI,
  loadPlatformSettingsUIFromServer
} from './uiController.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(reg => {
      console.log('[SW] registered:', reg.scope);
    })
    .catch(err => {
      console.error('[SW] register failed:', err);
    });
}

/* =========================
 * グローバル状態
 * ========================= */
let autoTimer = null;
let hasInitialHistoryLoaded = false;
let lastHistoryRefreshAt = 0;

let $logs = null;
let $status = null;

/* =========================
 * ユーティリティ
 * ========================= */
function areAllPlatformsDisabled(settings) {
  return Object.values(settings).every(v => !v);
}

function areAllPlatformsDisabledSafe() {
  try {
    return areAllPlatformsDisabled(getPlatformSettings());
  } catch {
    return true;
  }
}

/* =========================
 * 履歴更新（全体共有）
 * ========================= */
async function refreshHistory({ reason = 'manual', force = false } = {}) {
  if (!$logs || !$status) return;
  if (!hasInitialHistoryLoaded && !force) return;

  const now = Date.now();
  if (!force && (now - lastHistoryRefreshAt) < 1500) return;
  lastHistoryRefreshAt = now;

  if (force) clearJsonCache();

  fetchHistory($logs, $status, {
    append: false,
    useCache: !force
  });
}

/* =========================
 * ServiceWorker メッセージ
 * ========================= */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'NAVIGATE' && data.url) {
      window.location.href = data.url;
      return;
    }

    if (data.type === 'HISTORY_INVALIDATE') {
      if (document.visibilityState === 'visible') {
        refreshHistory({ reason: 'sw_invalidate', force: true });
      }
      return;
    }

    if (data.type === 'CLEAR_HISTORY_CACHE') {
      clearJsonCache();
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          refreshHistory({ reason: 'sw_clear_cache', force: true });
        }, 800);
      }
      return;
    }

    if (data.type === 'CLEAR_AND_RELOAD_HISTORY') {
      refreshHistory({ reason: 'sw_clear_and_reload', force: true });
    }
  });
}

/* =========================
 * DOM 初期化
 * ========================= */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Main] 初期化開始');

  $logs = document.getElementById('logs');
  $status = document.getElementById('status');

  if (!$logs || !$status) {
    console.error('履歴UI要素が不足しています');
    return;
  }

  /* === 初回履歴取得（最優先） === */
  if (!hasInitialHistoryLoaded) {
    hasInitialHistoryLoaded = true;
    fetchHistory($logs, $status, { append: false, useCache: true });
  }

  /* =========================
   * ヘッダー依存UI初期化
   * ========================= */
  try {
    await initHeaderDependentUI();
  } catch (e) {
    console.warn('[Main] initHeaderDependentUI error', e);
  }

  const $toggleNotify = document.getElementById('toggle-notify');
  const $btnSendTest = document.getElementById('btn-send-test');
  const $autoRefreshCheckbox = document.getElementById('auto-refresh');

  /* =========================
   * プラットフォーム設定UI
   * ========================= */
  initPlatformSettingsUI($toggleNotify);

  const serverResult = await loadPlatformSettingsUIFromServer($toggleNotify);
  if (serverResult?.applied && serverResult.settings && $toggleNotify) {
    const anyOn = Object.values(serverResult.settings).some(Boolean);
    $toggleNotify.checked = anyOn;
    updatePlatformSettingsVisibility(anyOn);
    updateToggleImage();
  }

  initLogFilterSettings($toggleNotify);

  /* =========================
   * 購読者名UI
   * ========================= */
  let showLinked = () => {};
  try {
    const ui = await initSubscriberNameUI();
    if (ui?.showLinked) showLinked = ui.showLinked;
  } catch (e) {
    console.warn('[Main] 購読者名UI初期化エラー', e);
  }

  /* =========================
   * 通知トグル（Push）
   * ========================= */
  if ($toggleNotify) {
    let enabled = false;

    try {
      const sw = await navigator.serviceWorker.ready;
      let sub = await sw.pushManager.getSubscription();

      if (!sub) {
        const raw = localStorage.getItem('pushSubscription');
        if (raw) {
          try { sub = JSON.parse(raw); } catch {}
        }
      }

      if (sub) {
        enabled = true;
        const serialized = sub.toJSON ? sub.toJSON() : sub;
        await sendSubscriptionToServer(serialized);
        localStorage.setItem('pushSubscription', JSON.stringify(serialized));
      }
    } catch {}

    if (areAllPlatformsDisabledSafe()) {
      enabled = false;
      showLinked(false);
    }

    $toggleNotify.checked = enabled;
    updatePlatformSettingsVisibility(enabled);
    updateToggleImage();

    let processing = false;
    $toggleNotify.addEventListener('change', async () => {
      if (processing) return;
      processing = true;

      try {
        if ($toggleNotify.checked) {
          await initPush();
          if (!(await savePlatformSettings())) throw new Error();

          const input = document.getElementById('subscriber-name-input');
          const name = input?.value?.trim();
          if (name) await saveNameToServer(getClientId(), name);

          showLinked(true);
        } else {
          await unsubscribePush();
          showLinked(false);
        }
      } catch {
        $toggleNotify.checked = false;
      } finally {
        updatePlatformSettingsVisibility($toggleNotify.checked);
        updateToggleImage();
        processing = false;
      }
    });
  }

  /* =========================
   * ボタン類
   * ========================= */
  document.getElementById('more-logs-button')
    ?.addEventListener('click', () => fetchHistoryMore($logs, $status));

  document.getElementById('btn-refresh')
    ?.addEventListener('click', () => refreshHistory({ force: true }));

  if ($btnSendTest) {
    $btnSendTest.addEventListener('click', async () => {
      $btnSendTest.disabled = true;
      await sendTestToMe();
      $btnSendTest.disabled = false;
    });
  }

  if ($autoRefreshCheckbox) {
    $autoRefreshCheckbox.addEventListener('change', e => {
      if (e.target.checked) {
        refreshHistory({ force: true });
        autoTimer = setInterval(() => refreshHistory({ force: true }), 30000);
      } else {
        clearInterval(autoTimer);
      }
    });
  }

  /* =========================
   * visibility 復帰
   * ========================= */
  let backgroundSince = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      backgroundSince = Date.now();
    } else if (backgroundSince && Date.now() - backgroundSince > 1000) {
      refreshHistory({ force: true });
      backgroundSince = null;
    }
  });
});
