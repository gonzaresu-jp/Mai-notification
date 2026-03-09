// filterService.js - ログフィルター管理（トグルスイッチ版）
import { getPlatformSettings } from './settingsService.js';

export function initLogFilterSettings($toggleNotify) {
  const syncInput = document.getElementById('filter-sync-notification');
  const filterInputs = {
    twitcasting:      document.getElementById('filter-twitcasting'),
    youtube:          document.getElementById('filter-youtube'),
    youtubeCommunity: document.getElementById('filter-youtube-community'),
    fanbox:           document.getElementById('filter-fanbox'),
    twitterMain:      document.getElementById('filter-twitter-main'),
    twitterSub:       document.getElementById('filter-twitter-sub'),
    milestone:        document.getElementById('filter-milestone'),
    schedule:         document.getElementById('filter-schedule'),
    gipt:             document.getElementById('filter-gipt'),
    twitch:           document.getElementById('filter-twitch'),
    bilibili:         document.getElementById('filter-bilibili'),
  };

  // =========================================================
  // 保存 / 読み込み
  // =========================================================
  function loadFilterSettings() {
    try {
      const saved = localStorage.getItem('logFilterSettings');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('フィルター設定の読み込みに失敗', e);
    }
    return {
      syncWithNotification: true,
      twitcasting: true, youtube: true, youtubeCommunity: true,
      fanbox: true, twitterMain: true, twitterSub: true,
      milestone: true, schedule: true, gipt: true,
      twitch: true, bilibili: true,
    };
  }

  function saveFilterSettings(settings) {
    try {
      localStorage.setItem('logFilterSettings', JSON.stringify(settings));
      console.log('[saveFilterSettings] 保存:', settings);
    } catch (e) {
      console.error('フィルター設定の保存に失敗', e);
    }
  }

  // =========================================================
  // UI から現在の設定を読み取る
  // =========================================================
  function getCurrentFilterSettings() {
    return {
      syncWithNotification: syncInput?.checked ?? false,
      twitcasting:      filterInputs.twitcasting?.checked      ?? false,
      youtube:          filterInputs.youtube?.checked           ?? false,
      youtubeCommunity: filterInputs.youtubeCommunity?.checked  ?? false,
      fanbox:           filterInputs.fanbox?.checked            ?? false,
      twitterMain:      filterInputs.twitterMain?.checked       ?? false,
      twitterSub:       filterInputs.twitterSub?.checked        ?? false,
      milestone:        filterInputs.milestone?.checked         ?? false,
      schedule:         filterInputs.schedule?.checked          ?? false,
      gipt:             filterInputs.gipt?.checked              ?? false,
      twitch:           filterInputs.twitch?.checked            ?? false,
      bilibili:         filterInputs.bilibili?.checked          ?? false,
    };
  }

  // =========================================================
  // 設定を UI に反映（checkbox の checked + disabled 制御）
  // =========================================================
  function applyFilterSettingsToUI(settings) {
    console.log('[applyFilterSettingsToUI] 適用:', settings);

    if (syncInput) {
      syncInput.checked = settings.syncWithNotification;
      syncInput.setAttribute('aria-checked', settings.syncWithNotification);
    }

    const isSynced = settings.syncWithNotification;

    Object.keys(filterInputs).forEach(key => {
      const input = filterInputs[key];
      if (!input) return;

      input.checked  = !!settings[key];
      input.disabled = isSynced;
      input.setAttribute('aria-checked', !!settings[key]);

      // 親 label に is-synced を付与（CSS で opacity 制御用）
      const row = input.closest('.filter-toggle-row');
      if (row) row.classList.toggle('is-synced', isSynced);
    });
  }

  // =========================================================
  // 通知設定と同期
  // =========================================================
  function syncFilterWithNotificationSettings() {
    const platformSettings = getPlatformSettings();
    console.log('[syncFilterWithNotificationSettings] 通知設定:', platformSettings);
    return {
      syncWithNotification: true,
      twitcasting:      platformSettings.twitcasting      || false,
      youtube:          platformSettings.youtube           || false,
      youtubeCommunity: platformSettings.youtubeCommunity  || false,
      fanbox:           platformSettings.fanbox            || false,
      twitterMain:      platformSettings.twitterMain       || false,
      twitterSub:       platformSettings.twitterSub        || false,
      milestone:        platformSettings.milestone         || false,
      schedule:         platformSettings.schedule          || false,
      gipt:             platformSettings.gipt              || false,
      twitch:           platformSettings.twitch            || false,
      bilibili:         platformSettings.bilibili          || false,
    };
  }

  // =========================================================
  // ログカードへのフィルター適用
  // =========================================================
  function applyLogFiltering() {
    const settings = getCurrentFilterSettings();
    const cards    = document.querySelectorAll('#logs .card[data-platform]');

    console.log('[applyLogFiltering] フィルター適用:', settings, 'カード数:', cards.length);

    cards.forEach(card => {
      const platform = card.getAttribute('data-platform');
      let shouldShow = true;

      switch (platform) {
        case 'twitcasting':       shouldShow = settings.twitcasting;      break;
        case 'youtube':           shouldShow = settings.youtube;           break;
        case 'youtube-community': shouldShow = settings.youtubeCommunity;  break;
        case 'fanbox':            shouldShow = settings.fanbox;            break;
        case 'twitter-main':      shouldShow = settings.twitterMain;       break;
        case 'twitter-sub':       shouldShow = settings.twitterSub;        break;
        case 'milestone':         shouldShow = settings.milestone;         break;
        case 'schedule':          shouldShow = settings.schedule;          break;
        case 'gipt':              shouldShow = settings.gipt;              break;
        case 'twitch':            shouldShow = settings.twitch;            break;
        case 'bilibili':          shouldShow = settings.bilibili;          break;
        default:                  shouldShow = true;
      }

      card.classList.toggle('filtered-out', !shouldShow);
    });
  }

  // =========================================================
  // イベント：通知設定連動トグル
  // =========================================================
  if (syncInput) {
    syncInput.addEventListener('change', () => {
      const newState = syncInput.checked;
      console.log('[syncInput] change ->', newState);

      if (newState) {
        const synced = syncFilterWithNotificationSettings();
        applyFilterSettingsToUI(synced);
        saveFilterSettings(synced);
      } else {
        const current = getCurrentFilterSettings();
        current.syncWithNotification = false;
        applyFilterSettingsToUI(current);
        saveFilterSettings(current);
      }

      applyLogFiltering();
    });
  }

  // =========================================================
  // イベント：個別フィルタートグル
  // =========================================================
  Object.keys(filterInputs).forEach(key => {
    const input = filterInputs[key];
    if (!input) return;

    input.addEventListener('change', () => {
      if (input.disabled) return;
      console.log('[filterInput] change:', key, '->', input.checked);

      const settings = getCurrentFilterSettings();
      saveFilterSettings(settings);
      applyLogFiltering();
    });
  });

  // =========================================================
  // 初期化
  // =========================================================
  const initialSettings = loadFilterSettings();

  if (initialSettings.syncWithNotification && $toggleNotify) {
    const synced = syncFilterWithNotificationSettings();
    applyFilterSettingsToUI(synced);
    saveFilterSettings(synced);
  } else {
    applyFilterSettingsToUI(initialSettings);
  }

  // グローバル公開（auth-settings-bridge.js / historyService.js から参照）
  window.applyLogFiltering                   = applyLogFiltering;
  window.syncFilterWithNotificationSettings  = syncFilterWithNotificationSettings;
  window.applyFilterSettingsToUI             = applyFilterSettingsToUI;
  window.saveFilterSettings                  = saveFilterSettings;
  window.getCurrentFilterSettings            = getCurrentFilterSettings;

  console.log('[initLogFilterSettings] 初期化完了');
}