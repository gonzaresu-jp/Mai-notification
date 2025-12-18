// filterService.js - ログフィルター管理
import { getPlatformSettings } from './settingsService.js';

export function initLogFilterSettings($toggleNotify) {
  const syncButton = document.getElementById('filter-sync-notification');
  const filterButtons = {
    twitcasting: document.getElementById('filter-twitcasting'),
    youtube: document.getElementById('filter-youtube'),
    youtubeCommunity: document.getElementById('filter-youtube-community'),
    fanbox: document.getElementById('filter-fanbox'),
    twitterMain: document.getElementById('filter-twitter-main'),
    twitterSub: document.getElementById('filter-twitter-sub'),
    milestone: document.getElementById('filter-milestone'),
    gipt: document.getElementById('filter-gipt')
  };

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
      milestone: true,
      gipt: true
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

  function getCurrentFilterSettings() {
    return {
      syncWithNotification: syncButton?.classList.contains('is-on') || false,
      twitcasting: filterButtons.twitcasting?.classList.contains('is-on') || false,
      youtube: filterButtons.youtube?.classList.contains('is-on') || false,
      youtubeCommunity: filterButtons.youtubeCommunity?.classList.contains('is-on') || false,
      fanbox: filterButtons.fanbox?.classList.contains('is-on') || false,
      twitterMain: filterButtons.twitterMain?.classList.contains('is-on') || false,
      twitterSub: filterButtons.twitterSub?.classList.contains('is-on') || false,
      milestone: filterButtons.milestone?.classList.contains('is-on') || false,
      gipt: filterButtons.gipt?.classList.contains('is-on') || false
    };
  }

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
      milestone: platformSettings.milestone || false,
      gipt: platformSettings.gipt || false
    };
  }

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
        case 'gipt':
          shouldShow = settings.gipt;
          break;
        default:
          shouldShow = true;
      }

      card.classList.toggle('filtered-out', !shouldShow);
    });
  }

  if (syncButton) {
    syncButton.addEventListener('click', () => {
      const isCurrentlyOn = syncButton.classList.contains('is-on');
      const newState = !isCurrentlyOn;

      console.log('[syncButton] クリック: ', isCurrentlyOn, '->', newState);

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

  const initialSettings = loadFilterSettings();
  
  if (initialSettings.syncWithNotification && $toggleNotify) {
    const synced = syncFilterWithNotificationSettings();
    applyFilterSettingsToUI(synced);
    saveFilterSettings(synced);
  } else {
    applyFilterSettingsToUI(initialSettings);
  }

  window.applyLogFiltering = applyLogFiltering;
  window.syncFilterWithNotificationSettings = syncFilterWithNotificationSettings;
  window.applyFilterSettingsToUI = applyFilterSettingsToUI;
  window.saveFilterSettings = saveFilterSettings;
  window.getCurrentFilterSettings = getCurrentFilterSettings;

  console.log('[initLogFilterSettings] 初期化完了');
}