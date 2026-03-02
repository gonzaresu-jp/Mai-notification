/**
 * auth-settings-bridge.js
 *
 * Googleログイン済みユーザーの通知設定をサーバーと同期するモジュール。
 * main.js / settingsService.js を変更せず、このファイルを追加するだけで動作する。
 *
 * 【動作フロー】
 *
 * ① ページ読み込み時
 *    ログイン済み → GET /api/user/notification-settings
 *                 → localStorage('platformSettings') に書き込み
 *                 → settingsService.applySettingsToUI() でボタンに反映
 *                 → localStorage('platformSettings') がすでに正なので
 *                   main.js の loadPlatformSettingsUIFromServer も正しく動く
 *
 * ② 設定ボタン変更時（main.js の savePlatformSettings() が呼ばれた後）
 *    ログイン済み → 現在のUIから設定を読み取って
 *                   PUT /api/user/notification-settings に同期
 *
 * 【index.php への追記】
 *   <script type="module" src="/js/main.js?v=..."> の直後に追加：
 *   <script src="/js/auth-settings-bridge.js?v=<?= @filemtime(...) ?>"></script>
 */

(function () {
  'use strict';

  // =========================================================
  // プラットフォームキー → ボタンID マッピング
  // settingsService.js の keyMap と完全一致させること
  // =========================================================
  const KEY_MAP = {
    twitcasting:      'toggle-twitcasting',
    youtube:          'toggle-youtube',
    youtubeCommunity: 'toggle-youtube-community',
    fanbox:           'toggle-fanbox',
    twitterMain:      'toggle-twitter-main',
    twitterSub:       'toggle-twitter-sub',
    milestone:        'toggle-milestone',
    schedule:         'toggle-schedule',
    gipt:             'toggle-gipt',
    twitch:           'toggle-twitch',
    bilibili:         'toggle-bilibili',
  };

  // =========================================================
  // UIから現在の設定を読み取る（settingsService.getPlatformSettings と同等）
  // =========================================================
  function readSettingsFromUI() {
    const result = {};
    for (const [key, btnId] of Object.entries(KEY_MAP)) {
      const btn = document.getElementById(btnId);
      result[key] = btn ? btn.classList.contains('is-on') : false;
    }
    return result;
  }

  // =========================================================
  // 設定をUIボタンに反映（settingsService.applySettingsToUI と同等）
  // =========================================================
  function applySettingsToUI(settings) {
    for (const [key, btnId] of Object.entries(KEY_MAP)) {
      if (!(key in settings)) continue;
      const btn = document.getElementById(btnId);
      if (!btn) continue;
      const isOn = !!settings[key];
      btn.classList.toggle('is-on', isOn);
      const label = (btn.textContent || '').split(':')[0].trim();
      btn.textContent = `${label}: ${isOn ? 'ON' : 'OFF'}`;
    }
  }

  // =========================================================
  // ログイン状態の確認
  // header.html の initHeaderAuth() が window.__authUser をセットするまで待つ
  // =========================================================
  function waitForAuthUser(timeoutMs = 6000) {
    return new Promise(resolve => {
      if (typeof window.__authUser !== 'undefined') {
        return resolve(window.__authUser);
      }
      const deadline = Date.now() + timeoutMs;
      const timer = setInterval(() => {
        if (typeof window.__authUser !== 'undefined') {
          clearInterval(timer);
          resolve(window.__authUser);
        } else if (Date.now() >= deadline) {
          clearInterval(timer);
          resolve(null);
        }
      }, 50);
    });
  }

  // =========================================================
  // ① ページ読み込み時：サーバー設定をUIに反映
  // =========================================================
  async function loadAndApplyUserSettings() {
    try {
      // clientId を渡すことで、user_subscriptions 未作成でも
      // 匿名 subscriptions テーブルから設定を取得できる
      const clientId = localStorage.getItem('clientId') || '';
      const url = clientId
        ? `/api/user/notification-settings?clientId=${encodeURIComponent(clientId)}`
        : '/api/user/notification-settings';
      const res = await fetch(url, {
        credentials: 'include',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;

      const settings = await res.json();

      // localStorage に書き込む（main.js が参照する場所）
      try {
        localStorage.setItem('platformSettings', JSON.stringify(settings));
      } catch {}

      // UIボタンに反映
      applySettingsToUI(settings);

      // フィルター設定も同期（filterService.js が window に公開しているグローバル関数を利用）
      if (typeof window.syncFilterWithNotificationSettings === 'function' &&
          typeof window.applyFilterSettingsToUI === 'function') {
        const synced = window.syncFilterWithNotificationSettings();
        window.applyFilterSettingsToUI(synced);
        if (typeof window.saveFilterSettings === 'function') {
          window.saveFilterSettings(synced);
        }
      }
      if (typeof window.applyLogFiltering === 'function') {
        window.applyLogFiltering();
      }

      window.__userNotificationSettings = settings;
      console.log('[auth-bridge] サーバー設定をUIに反映:', settings);

    } catch (e) {
      console.warn('[auth-bridge] loadAndApplyUserSettings failed:', e);
    }
  }

  // =========================================================
  // ② 設定変更時：UIの状態をサーバーに保存
  // toggle-xxx ボタンのクリックを監視して変更後に同期
  // =========================================================
  function installSettingsSyncHook() {
    const platformSettingsEl = document.getElementById('platform-settings');
    if (!platformSettingsEl) return;

    // platform-settings リスト内のボタンクリックを委譲で監視
    platformSettingsEl.addEventListener('click', () => {
      // クリック後にUIが更新されるのを1tick待ってから同期
      setTimeout(syncCurrentSettingsToServer, 0);
    }, true); // capture で先に受け取る

    console.log('[auth-bridge] 設定変更フックをインストールしました');
  }

  async function syncCurrentSettingsToServer() {
    if (!window.__authUser) return;

    const settings  = readSettingsFromUI();
    const clientId  = localStorage.getItem('clientId') || '';
    // user_subscriptions 未作成の場合のフォールバック用に clientId も送る
    const body      = clientId ? { ...settings, clientId } : settings;
    // ただし PUT の body は settings のみが期待されているので
    // clientId はクエリパラメータで渡す
    const url = clientId
      ? `/api/user/notification-settings?clientId=${encodeURIComponent(clientId)}`
      : '/api/user/notification-settings';

    try {
      const res = await fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        console.log('[auth-bridge] 設定をサーバーに同期しました:', settings);
      }
    } catch (e) {
      console.warn('[auth-bridge] syncCurrentSettingsToServer failed:', e);
    }
  }


  // =========================================================
  // 推し日数 同期
  // =========================================================

  /**
   * サーバーから推し始め日付を取得して input#start に反映
   * count-days.js が input の change イベントを監視していれば自動で再計算される
   */
  async function loadAndApplyOshiDate() {
    try {
      const res = await fetch('/api/user/oshi', {
        credentials: 'include',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;

      const { oshi_since } = await res.json();
      if (!oshi_since) return;

      const input = document.getElementById('start');
      if (!input) return;

      // すでに同じ値なら何もしない
      if (input.value === oshi_since) return;

      input.value = oshi_since;

      // localStorage にも書き込む（count-days.js が参照しているキーに合わせる）
      try { localStorage.setItem('oshiSince', oshi_since); } catch {}

      // count-days.js が change イベントを監視していれば自動再計算される
      // 監視していない場合のため dispatchEvent で強制トリガー
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input',  { bubbles: true }));

      // count-days.js が window.updateOshiDays() を公開していれば直接呼ぶ
      if (typeof window.updateOshiDays === 'function') {
        window.updateOshiDays(oshi_since);
      }

      // #days-to-meet が変わっていなければ自前で計算して更新（フォールバック）
      const daysEl = document.getElementById('days-to-meet');
      if (daysEl) {
        const start = new Date(oshi_since);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.floor((today - start) / 86400000);
        if (days >= 0) daysEl.textContent = days;
      }

      console.log('[auth-bridge] 推し始め日付を反映:', oshi_since);
    } catch (e) {
      console.warn('[auth-bridge] loadAndApplyOshiDate failed:', e);
    }
  }

  /**
   * input#start の変更を監視してサーバーに保存
   * count-days.js の処理が終わった後に動作する（バブリングで受け取る）
   */
  function installOshiDateSyncHook() {
    const input = document.getElementById('start');
    if (!input) return;

    let saveTimer = null;

    input.addEventListener('change', async () => {
      if (!window.__authUser) return;

      const date = input.value; // YYYY-MM-DD
      if (!date) return;

      // 連続変更に備えてデバウンス（500ms）
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          const res = await fetch('/api/user/oshi', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oshi_since: date }),
          });
          if (res.ok) {
            console.log('[auth-bridge] 推し始め日付をサーバーに保存:', date);
          } else {
            console.warn('[auth-bridge] 推し始め保存失敗:', res.status);
          }
        } catch (e) {
          console.warn('[auth-bridge] installOshiDateSyncHook failed:', e);
        }
      }, 500);
    });

    console.log('[auth-bridge] 推し日数フックをインストールしました');
  }

  // =========================================================
  // メイン処理
  // =========================================================
  async function main() {
    // 設定変更フックは早期インストール（ログイン状態に関わらず登録しておく）
    installSettingsSyncHook();
    installOshiDateSyncHook();

    // main.js の DOMContentLoaded 処理（特に loadPlatformSettingsUIFromServer）が
    // 完了した後に実行するため少し待つ
    await new Promise(r => setTimeout(r, 400));

    const user = await waitForAuthUser();

    if (!user) {
      // 未ログイン：何もしない（既存フローそのまま）
      console.log('[auth-bridge] 未ログイン - 既存フローを使用');
      return;
    }

    console.log('[auth-bridge] ログイン確認:', user.display_name || user.email);

    // ログイン済み：サーバー設定でUIを上書き（サーバーを正とする）
    await loadAndApplyUserSettings();

    // 推し始め日付をサーバーから取得して反映
    await loadAndApplyOshiDate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();