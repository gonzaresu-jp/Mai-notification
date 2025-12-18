// config.js - API定数とユーティリティ関数
export const API = {
  HISTORY: '/api/history',
  VAPID: '/api/vapidPublicKey',
  SUBSCRIBE: '/api/save-platform-settings',
  SEND_TEST: '/api/send-test',
  SAVE_SETTINGS: '/api/save-platform-settings'
};

export const PAGING = {
  offset: 0,
  limit: 5,
  loading: false,
  hasMore: true,
  displayedCount: 0
};

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

export function getClientId() {
  let cid = localStorage.getItem('clientId');
  if (!cid && window.crypto && crypto.randomUUID) {
    cid = crypto.randomUUID();
    localStorage.setItem('clientId', cid);
  }
  return cid;
}

export function normalizePlatformName(platform) {
  const normalized = platform.toLowerCase().trim();
  
  if (normalized.includes('twitcasting')) return 'twitcasting';
  if (normalized.includes('youtube') && normalized.includes('community')) return 'youtube-community';
  if (normalized.includes('youtube')) return 'youtube';
  if (normalized.includes('fanbox') || normalized.includes('pixiv')) return 'fanbox';
  if (normalized.includes('twitter') || normalized.includes('x.com')) {
    if (normalized.includes('koinoyamai17') || normalized.includes('sub')) return 'twitter-sub';
    return 'twitter-main';
  }
  if (normalized.includes('milestone') || normalized.includes('記念日')) return 'milestone';
  if (normalized.includes('gipt')) return 'gipt';
  
  return 'unknown';
}

export async function fetchWithTimeout(url, opts = {}, timeoutMs = 5000) {
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

export function mergeSettings(existing = {}, incoming = {}) {
  return { ...existing, ...incoming };
}