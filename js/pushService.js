// pushService.js - プッシュ通知関連の機能
import { API, urlBase64ToUint8Array, getClientId } from './config.js';

export async function initPush() {
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

  const vapidResp = await fetch(API.VAPID);
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

export async function sendSubscriptionToServer(sub) {
  const clientId = getClientId();
  if (!clientId) throw new Error('Client ID missing');

  const subscriptionPayload = sub?.toJSON ? sub.toJSON() : sub;

  const platformSettings = (typeof window.getPlatformSettings === 'function') ? window.getPlatformSettings() : null;

  const response = await fetch(API.SUBSCRIBE, {
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

export async function unsubscribePush() {
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
      const response = await fetch(API.SUBSCRIBE, {
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

export async function sendTestToMe() {
  const clientId = getClientId();
  if (!clientId) {
    console.error('Client IDが取得できません。テスト通知を送信できません。');
    return;
  }

  try {
    const response = await fetch(API.SEND_TEST, {
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