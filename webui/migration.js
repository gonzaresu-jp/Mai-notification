// 旧ドメイン(mai.honna-yuzuki.com)からの訪問者へ、新ドメインへの移行を促すカードを表示する。
// koinoyamai.love / ローカル / その他のホストでは何もしない（self-gating）。
// - 「新ドメインへ移動」: localStorage に移行済みを記録し、同一パスへリダイレクト
// - 「7日後にまた」: 7日間表示しない（snooze）
// head.php はホスト判定してこのタグ自体を出力しないが、静的HTML用にJS側でも二重判定する。
(function () {
  'use strict';

  var OLD_HOST = 'mai.honna-yuzuki.com';
  var NEW_ORIGIN = 'https://koinoyamai.love';
  var DONE_KEY = 'mai-domain-migrated';
  var SNOOZE_KEY = 'mai-domain-migration-snooze-until';
  var SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

  if (location.hostname !== OLD_HOST) return;

  function lsGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* private mode 等は無視 */ }
  }

  if (lsGet(DONE_KEY)) return;
  var snoozeUntil = parseInt(lsGet(SNOOZE_KEY) || '0', 10);
  if (snoozeUntil && Date.now() < snoozeUntil) return;

  function migrate() {
    lsSet(DONE_KEY, '1');
    location.href = NEW_ORIGIN + location.pathname + location.search + location.hash;
  }

  function snooze() {
    lsSet(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    remove();
  }

  var card = null;

  function remove() {
    if (card && card.parentNode) card.parentNode.removeChild(card);
    card = null;
  }

  function mount() {
    if (document.getElementById('domain-migration-card')) return;

    card = document.createElement('div');
    card.id = 'domain-migration-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-label', 'ドメイン移行のお知らせ');
    card.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'left:auto',
      'z-index:2147483000',
      'box-sizing:border-box',
      'width:calc(100vw - 32px)',
      'max-width:340px',
      'padding:14px 16px',
      'background:#20222b',
      'color:#f7f7fa',
      'border:1px solid #3a3d4d',
      'border-radius:14px',
      'box-shadow:0 8px 30px rgba(0,0,0,.35)',
      'font:14px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif'
    ].join(';');

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:6px;';
    var mark = document.createElement('span');
    mark.style.color = '#e8579f';
    mark.textContent = '\u25C6 ';
    title.appendChild(mark);
    title.appendChild(document.createTextNode('サービスが新ドメインに移行しました'));
    card.appendChild(title);

    var body = document.createElement('div');
    body.style.cssText = 'font-size:13px;color:#c9cbd6;margin-bottom:12px;';
    body.appendChild(document.createTextNode('まいちゃん通知は '));
    var b = document.createElement('b');
    b.style.color = '#fff';
    b.textContent = 'koinoyamai.love';
    body.appendChild(b);
    body.appendChild(document.createTextNode(' に移りました。旧アドレス mai.honna-yuzuki.com は今後終了予定です。ブックマークの更新をお願いします。'));
    card.appendChild(body);

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap;';

    var later = document.createElement('button');
    later.type = 'button';
    later.textContent = '7日後にまた';
    later.style.cssText = 'padding:7px 12px;border-radius:8px;border:1px solid #4a4d5c;background:transparent;color:#c9cbd6;font:inherit;font-size:13px;cursor:pointer;';
    later.addEventListener('click', snooze);

    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = '新ドメインへ移動';
    go.style.cssText = 'padding:7px 14px;border-radius:8px;border:none;background:#B11E7C;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;';
    go.addEventListener('click', migrate);

    row.appendChild(later);
    row.appendChild(go);
    card.appendChild(row);

    document.body.appendChild(card);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
