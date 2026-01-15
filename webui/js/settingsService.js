// settingsService.js - プラットフォーム設定管理（統合API対応版）
import { API, getClientId, fetchWithTimeout, mergeSettings } from './config.js';

export function getPlatformSettings() {
  return {
    twitcasting: document.getElementById('toggle-twitcasting')?.classList.contains('is-on') || false,
    youtube: document.getElementById('toggle-youtube')?.classList.contains('is-on') || false,
    youtubeCommunity: document.getElementById('toggle-youtube-community')?.classList.contains('is-on') || false,
    fanbox: document.getElementById('toggle-fanbox')?.classList.contains('is-on') || false,
    twitterMain: document.getElementById('toggle-twitter-main')?.classList.contains('is-on') || false,
    twitterSub: document.getElementById('toggle-twitter-sub')?.classList.contains('is-on') || false,
    milestone: document.getElementById('toggle-milestone')?.classList.contains('is-on') || false,
    gipt: document.getElementById('toggle-gipt')?.classList.contains('is-on') || false
  };
}

export async function savePlatformSettings() {
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

    const res = await fetch(API.SAVE_SETTINGS, {
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

// 🚀 統合API版：settings + name を1回で取得（オプション）
export async function fetchUserDataFromServer({ timeoutMs = 5000 } = {}) {
  try {
    const clientId = await Promise.resolve(getClientId());
    if (!clientId) {
      console.log('[fetchUserData] clientIdがないため取得をスキップ');
      return { ok: false, reason: 'no-clientId' };
    }

    const url = `/api/get-user-data?clientId=${encodeURIComponent(clientId)}`;
    const fetchOpts = {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store'
    };

    const res = await fetchWithTimeout(url, fetchOpts, timeoutMs);

    if (!res.ok) {
      console.warn(`[fetchUserData] HTTP status=${res.status} ${res.statusText}`);
      return { ok: false, status: res.status, statusText: res.statusText };
    }

    const data = await res.json();
    console.log('[fetchUserData] 統合データ取得成功:', data);

    return { 
      ok: true, 
      settings: data.settings || {},
      name: data.name || null,
      exists: data.exists || false
    };

  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[fetchUserData] タイムアウト/中断', err);
      return { ok: false, reason: 'timeout' };
    }
    console.error('[fetchUserData] 取得失敗', err);
    return { ok: false, reason: 'exception', error: String(err) };
  }
}

// 既存の fetchPlatformSettingsFromServer（後方互換用）
export async function fetchPlatformSettingsFromServer({ timeoutMs = 5000 } = {}) {
  try {
    const clientId = await Promise.resolve(getClientId());
    if (!clientId) {
      console.log('[fetchPlatformSettings] clientIdがないため設定取得をスキップ');
      return { ok: false, reason: 'no-clientId' };
    }

    const url = `/api/get-platform-settings?clientId=${encodeURIComponent(clientId)}`;
    const fetchOpts = {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
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

export async function loadPlatformSettingsUI() {
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

export function applySettingsToUI(settings) {
  if (!settings || typeof settings !== 'object') return;
  const keyMap = {
    twitcasting: 'toggle-twitcasting',
    youtube: 'toggle-youtube',
    youtubeCommunity: 'toggle-youtube-community',
    fanbox: 'toggle-fanbox',
    twitterMain: 'toggle-twitter-main',
    twitterSub: 'toggle-twitter-sub',
    milestone: 'toggle-milestone',
    gipt: 'toggle-gipt'
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