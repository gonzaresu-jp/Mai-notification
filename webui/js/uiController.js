// uiController.js - UI制御とイベント処理
import { getPlatformSettings, savePlatformSettings, applySettingsToUI, loadPlatformSettingsUI, fetchPlatformSettingsFromServer } from './settingsService.js';

export function updateToggleImage() {
  const $toggleNotify = document.getElementById('toggle-notify');
  if ($toggleNotify) {
    document.body.classList.toggle('notifications-enabled', $toggleNotify.checked);
    document.body.classList.toggle('settings-on', $toggleNotify.checked);
  }
}

export function updatePlatformSettingsVisibility(isChecked) {
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

export function initPlatformSettingsUI($toggleNotify) {
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

export async function loadPlatformSettingsUIFromServer($toggleNotify) {
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

// グローバルスコープへの公開
window.updateToggleImage = updateToggleImage;
window.getPlatformSettings = getPlatformSettings;