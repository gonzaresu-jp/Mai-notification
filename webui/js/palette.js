// palette.js - コマンドパレット (Ctrl+K / Cmd+K)
//   通常入力: アーカイブ全文検索 (/archive/?q=)
//   /xxx    : ページジャンプ (候補表示あり)
//   /admin  : 管理画面へ遷移するが候補には出さない (隠しコマンド)
// main.js から side-effect import され main.bundle.min.js に同梱される。
(function () {
  if (window.__maiPaletteInit) return;
  window.__maiPaletteInit = true;

  var PAGES = [
    { path: '/', name: 'トップページ', keys: ['top', 'home', 'トップ', 'ほーむ', 'とっぷ'] },
    { path: '/archive/', name: '配信アーカイブ検索', keys: ['archive', 'アーカイブ', '検索', '動画', 'はいしん', 'けんさく', 'どうが'] },
    { path: '/logs/', name: 'アップデート履歴', keys: ['logs', 'log', 'ログ', '履歴', '更新', 'りれき', 'こうしん'] },
    { path: '/status', name: 'ステータス', keys: ['status', 'ステータス', '稼働', 'かどう'] },
    { path: '/twitter-media/', name: 'メディアアーカイブ', keys: ['media', 'メディア', '画像', 'がぞう'] },
    { path: '/download/', name: 'Androidアプリをダウンロード', keys: ['download', 'ダウンロード', 'アプリ', 'apk', 'あぷり'] },
    { path: '/future/', name: '今後の開発予定', keys: ['future', '予定', '開発', '計画', 'こんご', 'かいはつ', 'よてい', 'けいかく'] },
    { path: '/guide.php', name: '使い方・対応一覧', keys: ['guide', 'ガイド', '使い方', '対応', 'つかいかた', 'たいおう'] },
    { path: '/info.php', name: 'このサービスについて', keys: ['info', 'について', 'サービス', 'さーびす'] },
  ];
  // 候補に出さない隠しコマンド: 完全一致のみ遷移
  var HIDDEN_PATH = '/admin.html';

  // カタカナ→ひらがな正規化 (あーかいぶ → アーカイブ に一致させる)
  function kana(s) {
    return String(s || '').replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  var overlay = null;
  var input = null;
  var list = null;
  var rows = []; // {url, exec?} 選択可能行
  var selIdx = 0;

  function injectCss() {
    if (document.getElementById('mai-palette-style')) return;
    var st = document.createElement('style');
    st.id = 'mai-palette-style';
    st.textContent = [
      '#mai-palette-overlay{position:fixed;inset:0;z-index:999999;background:rgba(10,12,24,.45);',
      'display:flex;justify-content:center;align-items:flex-start;padding:12vh 12px 12px;}',
      '#mai-palette-box{width:min(560px,94vw);background:#fff;border-radius:12px;overflow:hidden;',
      'box-shadow:0 18px 50px rgba(0,0,0,.35);font-size:.9rem;color:#1a1a1a;}',
      '#mai-palette-input{width:100%;box-sizing:border-box;border:none;border-bottom:2px solid #b11e7c;',
      'padding:12px 14px;font-size:1rem;outline:none;background:#fff;color:#1a1a1a;}',
      '#mai-palette-list{max-height:min(46vh,380px);overflow-y:auto;background:#fff;}',
      '.mai-palette-row{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;text-align:left;',
      'border:none;background:#fff;color:#1a1a1a;padding:9px 14px;font-size:.88rem;cursor:pointer;}',
      '.mai-palette-row .tag{flex:none;font-size:.68rem;font-weight:700;border-radius:999px;padding:1px 8px;}',
      '.mai-palette-row .tag.search{background:#e8f0fe;color:#1a6fd6;}',
      '.mai-palette-row .tag.page{background:#fbe9f3;color:#b11e7c;}',
      '.mai-palette-row .path{margin-left:auto;flex:none;color:#999;font-size:.72rem;}',
      '.mai-palette-row.selected{background:#fbe9f3;}',
      '.mai-palette-row.hint{color:#888;cursor:default;}',
    ].join('');
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildDom() {
    injectCss();
    overlay = document.createElement('div');
    overlay.id = 'mai-palette-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = '<div id="mai-palette-box" role="dialog" aria-label="検索とページ移動">'
      + '<input id="mai-palette-input" type="text" placeholder="検索 / ページ移動は / から (例: /archive)" autocomplete="off" />'
      + '<div id="mai-palette-list"></div></div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('#mai-palette-input');
    list = overlay.querySelector('#mai-palette-list');
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) close();
    });
    input.addEventListener('input', function () { selIdx = 0; render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
      else if (e.key === 'Enter') {
        if (e.isComposing) return;
        e.preventDefault();
        activate();
      } else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    list.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.mai-palette-row[data-url]') : null;
      if (btn) go(btn.getAttribute('data-url'));
    });
    list.addEventListener('mousemove', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.mai-palette-row[data-url]') : null;
      if (!btn) return;
      var idx = rows.findIndex(function (r) { return r.url === btn.getAttribute('data-url'); });
      if (idx >= 0 && idx !== selIdx) { selIdx = idx; paintSel(); }
    });
  }

  function matchPages(term) {
    term = kana(term.toLowerCase());
    return PAGES.filter(function (p) {
      if (!term) return true;
      if (kana(p.name.toLowerCase()).indexOf(term) !== -1) return true;
      if (p.path.toLowerCase().indexOf(term) !== -1) return true;
      return p.keys.some(function (k) { return kana(k.toLowerCase()).indexOf(term) !== -1; });
    });
  }

  function currentRows() {
    var q = input.value;
    if (q.charAt(0) === '/') {
      var term = q.slice(1).trim().toLowerCase();
      return matchPages(term).map(function (p) {
        return { kind: 'page', url: p.path, label: p.name, sub: p.path };
      });
    }
    var t = q.trim();
    if (!t) return [];
    return [{ kind: 'search', url: '/archive/?q=' + encodeURIComponent(t), label: '「' + t + '」をアーカイブ検索', sub: '' }];
  }

  function render() {
    rows = currentRows();
    if (selIdx >= rows.length) selIdx = Math.max(0, rows.length - 1);
    if (!rows.length) {
      var q = input.value;
      list.innerHTML = q.charAt(0) === '/'
        ? '<div class="mai-palette-row hint">一致するページがありません</div>'
        : '<div class="mai-palette-row hint">キーワードを入力して Enter でアーカイブ検索</div>';
      return;
    }
    list.innerHTML = rows.map(function (r, i) {
      var tag = r.kind === 'search'
        ? '<span class="tag search">検索</span>'
        : '<span class="tag page">ページ</span>';
      var sub = r.sub ? '<span class="path">' + esc(r.sub) + '</span>' : '';
      return '<button type="button" class="mai-palette-row' + (i === selIdx ? ' selected' : '')
        + '" data-url="' + esc(r.url) + '">' + tag
        + '<span>' + esc(r.label) + '</span>' + sub + '</button>';
    }).join('');
  }

  function paintSel() {
    var btns = list.querySelectorAll('.mai-palette-row[data-url]');
    for (var i = 0; i < btns.length; i++) {
      if (i === selIdx) {
        btns[i].classList.add('selected');
        if (btns[i].scrollIntoView) btns[i].scrollIntoView({ block: 'nearest' });
      } else {
        btns[i].classList.remove('selected');
      }
    }
  }

  function moveSel(d) {
    if (!rows.length) return;
    selIdx = (selIdx + d + rows.length) % rows.length;
    paintSel();
  }

  function go(url) {
    close();
    location.href = url;
  }

  function activate() {
    var q = input.value;
    if (rows.length) {
      go(rows[Math.min(selIdx, rows.length - 1)].url);
      return;
    }
    // 候補なし + /admin 完全一致 → 隠し遷移
    if (q.charAt(0) === '/' && q.slice(1).trim().toLowerCase() === 'admin') {
      go(HIDDEN_PATH);
    }
  }

  function open() {
    if (!overlay) buildDom();
    overlay.style.display = 'flex';
    input.value = '';
    selIdx = 0;
    render();
    setTimeout(function () { input.focus(); }, 0);
  }

  function close() {
    if (overlay) overlay.style.display = 'none';
  }

  function isOpen() {
    return !!overlay && overlay.style.display !== 'none';
  }

  function inEditable(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!(el.isContentEditable);
  }

  document.addEventListener('keydown', function (e) {
    var hotkey = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
      && (e.key === 'k' || e.key === 'K');
    if (hotkey) {
      e.preventDefault();
      if (isOpen()) close();
      else open();
      return;
    }
    if (e.key === 'Escape' && isOpen() && !inEditable(document.activeElement)) close();
  });
})();
