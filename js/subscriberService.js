// subscriberService.js - 購読者名管理（統合API版）
import { API, getClientId } from './config.js';
import { getPlatformSettings } from './settingsService.js';

export async function saveNameToServer(clientId, name) {
  if (!clientId) {
    console.error('[saveNameToServer] clientIdがありません');
    return false;
  }
  if (!name || typeof name !== 'string') {
    console.error('[saveNameToServer] nameが不正です');
    return false;
  }

  let sub = null;
  try {
    if ('serviceWorker' in navigator) {
      const sw = await navigator.serviceWorker.ready;
      const swSub = await sw.pushManager.getSubscription();
      if (swSub) sub = swSub;
    }
  } catch (e) {
    console.warn('[saveNameToServer] ServiceWorkerからsubscription取得に失敗', e);
  }
  if (!sub) {
    const subRaw = localStorage.getItem('pushSubscription');
    if (subRaw) {
      try { sub = JSON.parse(subRaw); } catch (e) { sub = null; }
    }
  }

  const platformSettings = getPlatformSettings();

  try {
    const res = await fetch('/api/save-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, name })
    });
    console.log('[saveNameToServer] /api/save-name HTTP', res.status);
    if (res.ok) {
      const text = await res.text();
      try { console.log('[saveNameToServer] /api/save-name response:', JSON.parse(text || '{}')); }
      catch (e) { console.log('[saveNameToServer] /api/save-name response (text):', text); }
      return true;
    } else if (res.status === 404) {
      console.log('[saveNameToServer] /api/save-nameが存在しないためフォールバックします');
    } else {
      const text = await res.text();
      console.warn('[saveNameToServer] /api/save-name失敗:', res.status, text);
    }
  } catch (e) {
    console.warn('[saveNameToServer] /api/save-nameへのネットワークエラー:', e);
  }

  try {
    const body = {
      clientId: clientId,
      name: name,
      subscription: sub,
      settings: platformSettings
    };
    console.log('[saveNameToServer] フォールバックで/api/save-platform-settings POST', body);
    const res2 = await fetch(API.SAVE_SETTINGS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log('[saveNameToServer] /api/save-platform-settings HTTP', res2.status);
    const text2 = await res2.text();
    if (!res2.ok) {
      console.error('[saveNameToServer] 名前保存失敗 response:', res2.status, text2);
      return false;
    }
    try {
      const json = JSON.parse(text2 || '{}');
      console.log('[saveNameToServer] saved (fallback)', json);
    } catch (e) {
      console.log('[saveNameToServer] saved (fallback, non-json response):', text2);
    }
    return true;
  } catch (e) {
    console.error('[saveNameToServer] 名前保存(fallback)失敗:', e);
    return false;
  }
}

// 🚀 統合API版：1回のリクエストで name + settings を取得
export async function fetchNameFromServer(clientId, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // ✅ 統合API使用（1リクエストで完結）
      const res = await fetch(`/api/get-user-data?clientId=${clientId}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log('[fetchNameFromServer] /api/get-user-data HTTP', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('[fetchNameFromServer] /api/get-user-data body', data);
        
        // name を返す（settings も取得されているが、ここでは name のみ使用）
        if (typeof data.name !== 'undefined' && data.name !== null) {
          return data.name;
        }
        return null;
      }
      
      // 502エラーの場合のみリトライ
      if (res.status === 502 && i < retries) {
        console.warn(`[fetchNameFromServer] 502エラー、リトライ ${i + 1}/${retries}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      
      break;
      
    } catch (e) {
      if (e.name === 'AbortError') {
        console.warn('[fetchNameFromServer] タイムアウト');
      } else {
        console.warn('[fetchNameFromServer] 失敗:', e);
      }
      if (i < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
    }
  }

  console.error('[fetchNameFromServer] 全ての取得方法が失敗');
  return null;
}

export async function initSubscriberNameUI() {
  const input = document.getElementById('subscriber-name-input');
  const btn = document.getElementById('subscriber-name-submit');
  const status = document.getElementById('subscriber-name-status');
  let linkedEl = document.getElementById('subscriber-linked-icon');

  if (!input || !btn || !status) {
    console.warn('[initSubscriberNameUI] UI要素が見つかりません');
    return;
  }

  const clientId = getClientId();

  function showLinked(visible) {
    if (!linkedEl) return;
    linkedEl.style.display = visible ? 'inline-block' : 'none';
  }

  let wrapper = input.closest('.subscriber-input-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'subscriber-input-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
  }

  const ICON_URL = 'https://img.icons8.com/?size=100&id=sz8cPVwzLrMP&format=png&color=000000';
  if (!linkedEl) {
    linkedEl = document.createElement('img');
    linkedEl.id = 'subscriber-linked-icon';
    linkedEl.className = 'subscriber-linked';
    linkedEl.src = ICON_URL;
    linkedEl.alt = '保存済み';
    linkedEl.style.display = 'none';
    input.insertAdjacentElement('afterend', linkedEl);
  } else if (linkedEl.tagName.toLowerCase() !== 'img') {
    const newImg = document.createElement('img');
    newImg.id = linkedEl.id;
    newImg.className = linkedEl.className || 'subscriber-linked';
    newImg.src = ICON_URL;
    newImg.alt = '保存済み';
    newImg.style.display = linkedEl.style.display || 'none';
    linkedEl.parentNode.replaceChild(newImg, linkedEl);
    linkedEl = newImg;
  } else {
    linkedEl.src = ICON_URL;
  }

  // 非同期で名前を取得（UIブロックしない）
  let currentNameValue = '';
  const namePromise = clientId ? fetchNameFromServer(clientId) : Promise.resolve(null);
  
  namePromise.then(currentName => {
    console.log('[initSubscriberNameUI] 取得した名前:', currentName);
    if (currentName) {
      input.value = currentName;
      showLinked(true);
      currentNameValue = currentName;
    } else {
      input.value = '';
      showLinked(false);
    }
  }).catch(e => {
    console.warn('[initSubscriberNameUI] name取得エラー', e);
    input.value = '';
    showLinked(false);
  });

  input.addEventListener('input', () => showLinked(false));

  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const name = input.value ? input.value.trim() : '';
    if (!name) { 
      status.style.display = 'block';
      status.textContent = '名前を入力してください';
      status.className = 'status-message error-message';
      return; 
    }

    btn.disabled = true;
    status.style.display = 'block';
    status.textContent = '保存中...';
    status.className = 'status-message info-message';

    try {
      const ok = await saveNameToServer(clientId, name);
      if (ok) {
        status.textContent = '名前を保存しました';
        status.className = 'status-message success-message';
        currentNameValue = name;
        showLinked(true);
        
        setTimeout(async () => {
          try {
            const savedName = await fetchNameFromServer(clientId);
            console.log('[SubscriberName] 保存確認:', savedName);
            if (savedName && savedName !== input.value) {
              input.value = savedName;
              console.log('[SubscriberName] UIを再取得した名前で更新:', savedName);
            }
          } catch (e) {
            console.warn('[SubscriberName] 保存確認エラー', e);
          }
        }, 500);
      } else {
        status.textContent = '名前の保存に失敗しました';
        status.className = 'status-message error-message';
        showLinked(false);
      }
    } catch (e) {
      console.error('[SubscriberName] save error', e);
      status.textContent = '保存中にエラーが発生しました';
      status.className = 'status-message error-message';
      showLinked(false);
    } finally {
      btn.disabled = false;
      setTimeout(() => { status.style.display = 'none'; }, 4000);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btn.click();
    }
  });

  return { 
    currentName: input.value || '', 
    showLinked
  };
}