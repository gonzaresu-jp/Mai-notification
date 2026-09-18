/**
 * アーカイブ検索ページ (/archive.php)
 *
 * データ元: /api/archive/* （routes/archive.js が 192.168.1.70:8766 の api.py へ中継）
 *  - 一覧   : /api/archive/videos
 *  - 全文検索: /api/archive/search （タイトル / 文字起こし / コメント / ライブチャット）
 *  - 統計   : /api/archive/stats
 *
 * 並び替えは一覧ではサーバ側 (ORDER BY)、検索では取得済みの結果をクライアント側で行う。
 */
(function () {
  'use strict';

  var PAGE_SIZE = 24;
  var SEARCH_LIMIT = 100; // /api/search の上限（api.py で 100 にクランプ）
  var AUTHOR_LIMIT = 20;  // ユーザー名検索は「配信数」単位でページングする
  var PAGER_WINDOW = 2; // 現在ページの前後に出す番号の数
  var DEFAULT_SORT = 'stream_at_desc';
  var SEARCH_ONLY_SORTS = ['hits_desc'];

  var KIND_LABEL = {
    transcript: '文字起こし',
    comment: 'コメント',
    chat: 'チャット',
  };
  // タイトル一致はカード見出し側でハイライトするので該当箇所リストには入れない
  var HIT_KINDS = ['transcript', 'comment', 'chat'];

  var el = {};
  var state = { q: '', kind: 'all', category: '', sort: DEFAULT_SORT, page: 0, author: '' };
  var inFlight = null;
  // 検索はページングではなく逐次追記。groups は動画単位、offset/hasMore で「さらに読み込む」を制御する
  var searchCache = { key: '', groups: [], totalHits: 0, offset: 0, hasMore: false, loadingMore: false };

  // ---------------------------------------------------------------- utils

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** FTS5 の snippet() は該当語を [ ] で囲んで返すので <mark> に変換する */
  function highlight(snippet) {
    return esc(snippet).replace(/\[([^\[\]]*)\]/g, function (_, inner) {
      return '<mark>' + inner + '</mark>';
    });
  }

  function formatDate(video) {
    var raw = (video && (video.stream_at_jst || video.stream_date_jst)) || '';
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(raw);
    if (!m) return raw || '日付不明';
    var text = m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
    if (m[4]) text += ' ' + m[4] + ':' + m[5];
    return text;
  }

  function formatDuration(sec) {
    if (!sec || sec < 0) return '';
    var s = Math.floor(sec);
    var h = Math.floor(s / 3600);
    var mi = Math.floor((s % 3600) / 60);
    var se = s % 60;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return h > 0 ? h + ':' + pad(mi) + ':' + pad(se) : mi + ':' + pad(se);
  }

  function formatCount(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万';
    return n.toLocaleString('ja-JP');
  }

  function videoUrl(id) {
    return 'https://www.youtube.com/watch?v=' + id;
  }

  function timeUrl(id, ms) {
    if (typeof ms !== 'number' || ms <= 0) return videoUrl(id);
    return videoUrl(id) + '&t=' + Math.floor(ms / 1000) + 's';
  }

  function timeLabel(ms) {
    if (typeof ms !== 'number' || ms <= 0) return '0:00';
    return formatDuration(Math.floor(ms / 1000));
  }

  // ---------------------------------------------------------------- render

  function thumbHtml(video) {
    var id = video.video_id;
    var url = video.url || videoUrl(id);
    var dur = formatDuration(video.duration_sec);
    // まず YouTube の CDN（ブラウザ/CFにキャッシュされる）、失敗したらローカルのアーカイブ画像
    return '<a class="ar-thumb" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"'
      + ' aria-label="' + esc(video.title || id) + ' をYouTubeで開く">'
      + '<img loading="lazy" decoding="async" width="480" height="270"'
      + ' src="https://i.ytimg.com/vi/' + esc(id) + '/mqdefault.jpg"'
      + ' data-fallback="/api/archive/thumbnail/' + esc(id) + '"'
      + ' alt="" />'
      + '<span class="ar-veil" aria-hidden="true"></span>'
      + '<span class="ar-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>'
      + (dur ? '<span class="ar-dur">' + esc(dur) + '</span>' : '')
      + '</a>';
  }

  function metaHtml(video) {
    var bits = [];
    var views = formatCount(video.view_count);
    if (views) bits.push('<span><i class="fa-regular fa-eye"></i> ' + esc(views) + '</span>');
    var likes = formatCount(video.like_count);
    if (likes) bits.push('<span><i class="fa-regular fa-heart"></i> ' + esc(likes) + '</span>');
    return '<div class="ar-meta">' + bits.join('') + '</div>';
  }

  function catsHtml(cats) {
    var items = (cats || []).map(function (c) {
      return '<span class="ar-cat">' + esc(c) + '</span>';
    });
    return '<div class="ar-cats">' + items.join('') + '</div>';
  }

  function hitRowHtml(hit) {
    var id = hit.video_id;
    var url;
    var label;
    if (hit.kind === 'transcript') {
      url = hit.url || timeUrl(id, hit.start_ms);
      label = timeLabel(hit.start_ms);
    } else if (hit.kind === 'chat') {
      url = timeUrl(id, hit.offset_ms);
      label = timeLabel(hit.offset_ms);
    } else {
      url = hit.comment_id ? videoUrl(id) + '&lc=' + encodeURIComponent(hit.comment_id) : videoUrl(id);
      label = 'コメント';
    }
    var kindBadge = '<span class="ar-hit-kind ar-kind-' + esc(hit.kind) + '">' + esc(KIND_LABEL[hit.kind] || hit.kind) + '</span>';
    var badge = '';
    var isChat = hit.kind === 'chat';
    if (isChat && hit.msg_type === 'superchat') {
      badge = '<span class="ar-hit-sc" title="スーパーチャット">SC' + (hit.amount_text ? '<b>' + esc(hit.amount_text) + '</b>' : '') + '</span>';
    } else if (isChat && hit.msg_type === 'supersticker') {
      badge = '<span class="ar-hit-sc" title="スーパーステッカー">SS</span>';
    } else if (isChat && hit.msg_type === 'membership') {
      badge = '<span class="ar-hit-member" title="メンバーシップ加入">メンバー</span>';
    } else if (isChat && hit.is_member === 1) {
      badge = '<span class="ar-hit-member" title="メンバー">メンバー</span>';
    }
    var author = (isChat && hit.author) ? '<span class="ar-hit-author">' + esc(hit.author) + '</span>' : '';
    return '<li class="ar-hit">'
      + '<div class="ar-hit-head">'
      + kindBadge
      + (badge ? '<span class="ar-hit-extras">' + badge + author + '</span>' : author)
      + '<span class="ar-hit-at">' + esc(label) + '</span>'
      + '</div>'
      + '<p class="ar-hit-text">' + highlight(hit.snippet || hit.text || '') + '</p>'
      + '<a class="ar-hit-url" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">'
      + '<i class="fa-solid fa-link"></i> ' + esc(url) + '</a>'
      + '</li>';
  }

  /** 該当箇所。2件目以降は details で折りたたむ */
  function hitsHtml(hits) {
    if (!hits.length) return '';
    // author 検索では配信ごとの総発言数(video_hit_total)が付くので「抜粋」であることを示す
    var total = hits[0] && hits[0].video_hit_total;
    var countText = (total && total > hits.length)
      ? hits.length + ' 件を抜粋 <span class="ar-hits-total">/ この配信で ' + total.toLocaleString('ja-JP') + ' 件</span>'
      : hits.length + ' 件';
    var head = '<div class="ar-hits-title"><i class="fa-solid fa-quote-left"></i> 該当箇所 ' + countText + '</div>';
    var first = '<ul class="ar-hit-list">' + hitRowHtml(hits[0]) + '</ul>';
    var rest = '';
    if (hits.length > 1) {
      rest = '<details class="ar-more">'
        + '<summary><span class="ar-more-open">残り ' + (hits.length - 1) + ' 件を表示</span>'
        + '<span class="ar-more-close">折りたたむ</span>'
        + '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>'
        + '<ul class="ar-hit-list">' + hits.slice(1).map(hitRowHtml).join('') + '</ul>'
        + '</details>';
    }
    return '<div class="ar-hits">' + head + first + rest + '</div>';
  }

  /** カード共通部分: サムネイル → 日付 → タイトル → URL（→ 該当箇所） */
  function cardHtml(video, opts) {
    opts = opts || {};
    var url = video.url || videoUrl(video.video_id);
    var titleHtml = opts.titleSnippet
      ? highlight(opts.titleSnippet)
      : esc(video.title || '(タイトル不明)');
    var badge = opts.titleSnippet
      ? '<span class="ar-badge"><i class="fa-solid fa-check"></i> タイトル一致</span>'
      : '';
    var hits = opts.hitsHtml || '';
    return '<article class="ar-card' + (hits ? ' has-hits' : '') + '" data-video="' + esc(video.video_id) + '" data-title="' + esc(video.title || '') + '">'
      + thumbHtml(video)
      + '<div class="ar-body">'
      + '<div class="ar-date"><i class="fa-regular fa-calendar"></i> ' + esc(formatDate(video)) + badge + '</div>'
      + '<h3 class="ar-title">' + titleHtml + '</h3>'
      + catsHtml(video.categories)
      + '<div class="ar-badges"></div>'
      + metaHtml(video)
      + '<a class="ar-url" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">'
      + '<i class="fa-brands fa-youtube"></i><span>' + esc(url) + '</span></a>'
      + hits
      + '</div></article>';
  }

  function renderCards(html) {
    el.results.innerHTML = html;
    el.results.querySelectorAll('img[data-fallback]').forEach(function (img) {
      img.addEventListener('error', function onErr() {
        img.removeEventListener('error', onErr);
        var fb = img.getAttribute('data-fallback');
        img.removeAttribute('data-fallback');
        if (fb) img.src = fb;
      });
    });
    applyBadges();
  }

  // 議事録・字幕などの付加情報バッジ
  // minutes はローカルDB一括、transcript はアーカイブAPIから動画単位で判定する。
  var badgeCache = {}; // video_id -> { has_minutes, has_transcript }
  var badgeRendered = {}; // video_id -> true（バッジ描画済み）

  function badgeMark(videoId, key, value) {
    badgeCache[videoId] = badgeCache[videoId] || {};
    badgeCache[videoId][key] = value;
  }

  /** 議事録・字幕の両方が確定したか（表示すべきバッジが無いときも確定扱いにする） */
  function badgeDecided(id) {
    var info = badgeCache[id];
    if (!info) return false;
    return Object.prototype.hasOwnProperty.call(info, 'has_minutes')
      && Object.prototype.hasOwnProperty.call(info, 'has_transcript')
      && Object.prototype.hasOwnProperty.call(info, 'has_chapters');
  }

  function renderBadgeLine() {
    var cards = el.results.querySelectorAll('.ar-card[data-video]');
    cards.forEach(function (card) {
      var id = card.getAttribute('data-video');
      var info = badgeCache[id];
      if (!info) return;
      var parts = [];
      if (info.has_minutes) parts.push('<span class="ar-badge ar-badge-minutes"><i class="fa-solid fa-file-lines"></i> 議事録</span>');
      if (info.has_chapters) parts.push('<span class="ar-badge ar-badge-chapters" data-chapters="1" role="button" tabindex="0" title="タイムスタンプを表示"><i class="fa-solid fa-list-ul"></i> タイムスタンプ</span>');
      if (info.has_transcript) parts.push('<span class="ar-badge ar-badge-transcript"><i class="fa-solid fa-closed-captioning"></i> 字幕</span>');
      var slot = card.querySelector('.ar-badges');
      var current = slot ? slot.innerHTML : '';
      var next = parts.join('');
      if (current !== next) {
        if (slot) slot.innerHTML = next;
        if (next) badgeRendered[id] = false; // 更新の余地を残す（字幕が後から届く場合）
      }
      // 両方の判定が揃ったら確定し、以後の再判定対象から外す
      if (badgeDecided(id)) badgeRendered[id] = true;
    });
  }

  /** 表示中のカードについて、議事録・字幕の有無を判定してバッジを表示する */
  function applyBadges() {
    var cards = el.results.querySelectorAll('.ar-card[data-video]');
    var ids = [];
    var seen = {};
    cards.forEach(function (card) {
      var id = card.getAttribute('data-video');
      if (!id || seen[id]) return;
      seen[id] = 1;
      // 上流APIへの負荷を避けるため判定対象は1画面分（PAGE_SIZE）に制限する
      if (ids.length >= PAGE_SIZE) return;
      if (!badgeRendered[id] && !badgeDecided(id)) ids.push(id);
    });
    if (!ids.length) return;

    // 議事録（ローカルDB一括判定）
    fetch('/api/archive/minutes?ids=' + encodeURIComponent(ids.join(',')))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var flags = (data && data.flags) || {};
        ids.forEach(function (id) { badgeMark(id, 'has_minutes', !!(flags[id] && flags[id].has_minutes)); });
        renderBadgeLine();
      })
      .catch(function () {
        ids.forEach(function (id) { badgeMark(id, 'has_minutes', false); });
        renderBadgeLine();
      });

    // 字幕（アーカイブAPIから動画単位で判定）。並列数4で順に消化する。
    var queue = ids.slice();
    var active = 0;
    function checkTranscript() {
      while (active < 4 && queue.length) {
        var id = queue.shift();
        active++;
        (function (vid) {
          fetch('/api/archive/transcript/' + encodeURIComponent(vid))
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (data) {
              badgeMark(vid, 'has_transcript', !!(data && data.has_transcript));
            })
            .catch(function () {
              badgeMark(vid, 'has_transcript', false);
            })
            .then(function () {
              active--;
              renderBadgeLine();
              checkTranscript();
            });
        })(id);
      }
    }
    checkTranscript();

    // タイムスタンプ（チャプター txt）の有無を判定。並列数4。実データはポップアップ表示時に取得する。
    var chapQueue = ids.slice();
    var chapActive = 0;
    function checkChapters() {
      while (chapActive < 4 && chapQueue.length) {
        var id = chapQueue.shift();
        chapActive++;
        (function (vid) {
          fetch('/api/archive/chapters/' + encodeURIComponent(vid))
            .then(function (r) { return { status: r.status }; })
            .then(function (r) {
              badgeMark(vid, 'has_chapters', r.status === 200);
            })
            .catch(function () {
              badgeMark(vid, 'has_chapters', false);
            })
            .then(function () {
              chapActive--;
              renderBadgeLine();
              checkChapters();
            });
        })(id);
      }
    }
    checkChapters();
  }

  // ------------------------------------------------ タイムスタンプ ポップアップ
  // カードの「タイムスタンプ」バッジを押すとチャプター一覧をモーダル表示する。
  // チャプターの時刻を押すとYouTube の該当時刻 (t=<秒>) へ遷移する。

  var chapModal = null;
  var chapDataCache = {}; // video_id -> chapters[]

  /** 動画のチャプター一覧を取得（キャッシュあり） */
  function fetchChapters(vid) {
    if (chapDataCache[vid]) return Promise.resolve(chapDataCache[vid]);
    return fetch('/api/archive/chapters/' + encodeURIComponent(vid))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        chapDataCache[vid] = (data && data.chapters) || [];
        return chapDataCache[vid];
      })
      .catch(function (err) { chapDataCache[vid] = null; throw err; });
  }

  /** チャプター一覧をモーダル表示する */
  function showChapterPopup(vid) {
    var card = el.results.querySelector('.ar-card[data-video="' + CSS.escape(vid) + '"]');
    var title = card ? card.getAttribute('data-title') : '';

    closeChapterPopup();

    // 背景オーバーレイ（タップで閉じる）
    var overlay = document.createElement('div');
    overlay.className = 'ar-chap-overlay';

    chapModal = document.createElement('div');
    chapModal.className = 'ar-chap';
    chapModal.setAttribute('role', 'dialog');
    chapModal.setAttribute('aria-modal', 'true');

    // サムネイル（YouTube CDN。失敗したらローカルアーカイブ画像へフォールバック）
    var scene = '';
    if (vid) {
      scene = '<div class="ar-chap-scene">'
        + '<img src="https://i.ytimg.com/vi/' + esc(vid) + '/hqdefault.jpg"'
        + ' data-fallback="/api/archive/thumbnail/' + esc(vid) + '"'
        + ' alt="" />'
        + '<span class="ar-chap-scene-veil" aria-hidden="true"></span>'
        + '</div>';
    }

    chapModal.innerHTML = scene
      + '<div class="ar-chap-head">'
      + '<span class="ar-chap-title"><i class="fa-solid fa-list-ul"></i> タイムスタンプ</span>'
      + '<button type="button" class="ar-chap-close" aria-label="閉じる">&times;</button></div>'
      + '<div class="ar-chap-video"><a href="' + esc(videoUrl(vid)) + '" target="_blank" rel="noopener noreferrer">'
      + esc(title || vid) + '</a></div>'
      + '<div class="ar-chap-body"><div class="ar-chap-loading">読み込み中…</div></div>';

    overlay.appendChild(chapModal);
    document.body.appendChild(overlay);

    // 背景のスクロールを止める（ポップアップ内スクロールだけ有効）
    document.documentElement.classList.add('ar-chap-lock');
    document.body.classList.add('ar-chap-lock');

    // スクロール連鎖防止
    chapModal.style.overscrollBehavior = 'contain';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeChapterPopup();
    });

    chapModal.querySelector('.ar-chap-close').addEventListener('click', function () { closeChapterPopup(); });
    chapModal.querySelectorAll('img[data-fallback]').forEach(function (img) {
      img.addEventListener('error', function onErr() {
        img.removeEventListener('error', onErr);
        var fb = img.getAttribute('data-fallback');
        img.removeAttribute('data-fallback');
        if (fb) img.src = fb;
      });
    });

    // Esc で閉じる
    chapModal._esc = function (e) { if (e.key === 'Escape') closeChapterPopup(); };
    document.addEventListener('keydown', chapModal._esc);

    fetchChapters(vid).then(function (list) {
      if (!chapModal || chapModal.dataset.done) return;
      var body = chapModal.querySelector('.ar-chap-body');
      if (!list || !list.length) {
        body.innerHTML = '<div class="ar-chap-empty">タイムスタンプがありません</div>';
        return;
      }
      body.innerHTML = '<div class="ar-chap-list"></div>';
      var listEl = body.firstChild;
      list.forEach(function (ch) {
        var a = document.createElement('a');
        a.className = 'ar-chap-item';
        a.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(vid) + '&t=' + ch.time_sec + 's';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        var t = document.createElement('span');
        t.className = 'ar-chap-time';
        t.textContent = ch.time_str;
        var l = document.createElement('span');
        l.className = 'ar-chap-label';
        l.textContent = ch.title || '';
        a.appendChild(t);
        a.appendChild(l);
        listEl.appendChild(a);
      });
    }).catch(function () {
      if (!chapModal) return;
      chapModal.querySelector('.ar-chap-body').innerHTML =
        '<div class="ar-chap-empty">読み込めませんでした</div>';
    });
  }

  function closeChapterPopup() {
    if (chapModal) {
      chapModal.dataset.done = '1';
      if (chapModal._esc) document.removeEventListener('keydown', chapModal._esc);
      var overlay = chapModal.parentNode;
      chapModal.remove();
      if (overlay && overlay.parentNode) overlay.remove();
      chapModal = null;
    }
    document.documentElement.classList.remove('ar-chap-lock');
    document.body.classList.remove('ar-chap-lock');
  }

  function setStatus(text, isError) {
    el.status.textContent = text || '';
    el.status.classList.toggle('is-error', !!isError);
  }

  // カードの「タイムスタンプ」バッジをクリックでチャプター表示（委譲）
  function bindBadgeClick() {
    if (!el.results) return;
    el.results.addEventListener('click', function (e) {
      var b = e.target.closest('.ar-badge-chapters');
      if (!b) return;
      var card = b.closest('.ar-card[data-video]');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      showChapterPopup(card.getAttribute('data-video'));
    });
    el.results.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var b = e.target.closest('.ar-badge-chapters');
      if (!b) return;
      var card = b.closest('.ar-card[data-video]');
      if (!card) return;
      e.preventDefault();
      showChapterPopup(card.getAttribute('data-video'));
    });
  }

  function showSkeleton(n) {
    var one = '<div class="ar-card ar-skeleton"><div class="ar-thumb"></div>'
      + '<div class="ar-body"><span class="sk sk-sm"></span><span class="sk sk-lg"></span>'
      + '<span class="sk sk-md"></span></div></div>';
    el.results.innerHTML = new Array(n + 1).join(one);
    el.pager.hidden = true;
    if (el.loadMoreWrap) el.loadMoreWrap.hidden = true;
  }

  // ---------------------------------------------------------------- pager

  function pageBtn(page, label, cls, disabled) {
    return '<button type="button" class="ar-pg' + (cls ? ' ' + cls : '') + '"'
      + ' data-page="' + page + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  }

  function renderPager(total) {
    var pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) { el.pager.hidden = true; el.pager.innerHTML = ''; return; }

    var cur = state.page;
    var nums = [];
    var wanted = new Set([0, pages - 1]);
    for (var i = cur - PAGER_WINDOW; i <= cur + PAGER_WINDOW; i++) {
      if (i >= 0 && i < pages) wanted.add(i);
    }
    var sorted = Array.from(wanted).sort(function (a, b) { return a - b; });
    var prev = -1;
    sorted.forEach(function (p) {
      if (prev >= 0 && p - prev > 1) nums.push('<span class="ar-gap">…</span>');
      nums.push(pageBtn(p, String(p + 1), 'num' + (p === cur ? ' is-current' : '')));
      prev = p;
    });

    el.pager.innerHTML =
      pageBtn(0, '<i class="fa-solid fa-angles-left"></i><span class="ar-pg-txt">最初</span>', 'edge', cur === 0)
      + pageBtn(cur - 1, '<i class="fa-solid fa-angle-left"></i><span class="ar-pg-txt">前へ</span>', 'edge', cur === 0)
      + '<span class="ar-pages">' + nums.join('') + '</span>'
      + pageBtn(cur + 1, '<span class="ar-pg-txt">次へ</span><i class="fa-solid fa-angle-right"></i>', 'edge', cur >= pages - 1)
      + pageBtn(pages - 1, '<span class="ar-pg-txt">最後</span><i class="fa-solid fa-angles-right"></i>', 'edge', cur >= pages - 1);
    el.pager.hidden = false;
  }

  // ---------------------------------------------------------------- sort

  function normalizeSort() {
    // ヒット件数順は検索結果にしか存在しないので、一覧では既定に戻す
    if (!state.q && !state.author && SEARCH_ONLY_SORTS.indexOf(state.sort) >= 0) state.sort = DEFAULT_SORT;
  }

  function dateKey(video) {
    return video.stream_at_jst || video.stream_date_jst || '';
  }

  function numOr(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  /** 検索結果はサーバに ORDER BY が無いのでここで並べ替える */
  function sortGroups(groups) {
    var sort = state.sort;
    return groups.sort(function (a, b) {
      var av = a.video;
      var bv = b.video;
      var diff = 0;
      if (sort === 'stream_at_asc') {
        // 日付不明は常に末尾へ
        if (!dateKey(av) !== !dateKey(bv)) return dateKey(av) ? -1 : 1;
        diff = dateKey(av).localeCompare(dateKey(bv));
      } else if (sort === 'view_desc') {
        diff = numOr(bv.view_count, -1) - numOr(av.view_count, -1);
      } else if (sort === 'like_desc') {
        diff = numOr(bv.like_count, -1) - numOr(av.like_count, -1);
      } else if (sort === 'hits_desc') {
        diff = (b.hits.length + (b.titleSnippet ? 1 : 0)) - (a.hits.length + (a.titleSnippet ? 1 : 0));
      } else {
        if (!dateKey(av) !== !dateKey(bv)) return dateKey(av) ? -1 : 1;
        diff = dateKey(bv).localeCompare(dateKey(av));
      }
      if (diff !== 0) return diff;
      return dateKey(bv).localeCompare(dateKey(av)); // 同順位は新しい配信を先に
    });
  }

  // ---------------------------------------------------------------- data

  function apiGet(path, params) {
    var usp = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] !== '' && params[k] != null) usp.set(k, params[k]);
    });
    var qs = usp.toString();
    if (inFlight) inFlight.abort();
    inFlight = new AbortController();
    return fetch(path + (qs ? '?' + qs : ''), { signal: inFlight.signal })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) throw new Error(body.error || 'HTTP ' + r.status);
          return body;
        });
      });
  }

  function loadList() {
    showSkeleton(6);
    setStatus('読み込み中…');
    return apiGet('/api/archive/videos', {
      limit: PAGE_SIZE,
      offset: state.page * PAGE_SIZE,
      category: state.category,
      sort: state.sort,
    }).then(function (data) {
      var videos = data.videos || [];
      if (!videos.length) {
        renderCards('<p class="ar-empty">該当する動画がありませんでした。</p>');
        el.pager.hidden = true;
        setStatus('0 件');
        return;
      }
      renderCards(videos.map(function (v) { return cardHtml(v); }).join(''));
      var total = data.total || videos.length;
      var from = state.page * PAGE_SIZE + 1;
      var to = Math.min(from + videos.length - 1, total);
      setStatus('全 ' + total.toLocaleString('ja-JP') + ' 本中 ' + from + '〜' + to + ' 件を表示');
      renderPager(total);
    });
  }

  function searchKey() {
    return [state.q, state.kind, state.category, state.author].join('\u0000');
  }

  /** 検索対象の表示ラベル。author 検索時はユーザー名を前面に出す */
  function searchLabel() {
    if (state.author) return '@' + esc(state.author.replace(/^@/, ''));
    return '「' + esc(state.q) + '」';
  }

  function syncLoadMore() {
    if (!el.loadMoreWrap) return;
    if (!state.q && !state.author) { el.loadMoreWrap.hidden = true; return; }
    el.loadMoreWrap.hidden = !searchCache.hasMore;
    if (el.loadMore) el.loadMore.disabled = !!searchCache.loadingMore;
    if (el.loadMore) el.loadMore.innerHTML = searchCache.loadingMore
      ? '<i class="fa-solid fa-spinner fa-spin"></i> 読み込み中…'
      : 'さらに読み込む';
  }

  /** searchCache の内容を現在の並び順で描画する（再取得なし） */
  function renderSearch() {
    var groups = sortGroups(searchCache.groups.slice());
    if (!groups.length) {
      renderCards('<p class="ar-empty">' + searchLabel() + ' に一致する箇所は見つかりませんでした。</p>');
      el.pager.hidden = true;
      if (el.loadMoreWrap) el.loadMoreWrap.hidden = true;
      setStatus('0 件');
      return;
    }
    renderCards(groups.map(function (g) {
      return cardHtml(g.video, { titleSnippet: g.titleSnippet, hitsHtml: hitsHtml(g.hits) });
    }).join(''));
    el.pager.hidden = true;
    el.pager.innerHTML = '';
    if (state.author && searchCache.authorTotals) {
      // 発言数が多いユーザーは全件返せないので、配信数ベースで表示する
      var t = searchCache.authorTotals;
      setStatus(searchLabel() + ': 全 ' + t.videos.toLocaleString('ja-JP') + ' 配信 / '
        + t.hits.toLocaleString('ja-JP') + ' 発言 — 新しい方から ' + groups.length + ' 配信を表示'
        + (t.perVideo ? '（各配信 最大' + t.perVideo + '件を抜粋）' : ''));
    } else {
      setStatus(searchLabel() + ': ' + groups.length + ' 本の動画で ' + searchCache.totalHits + ' 件ヒット'
        + (searchCache.hasMore ? ' — まだ続きがあります' : ''));
    }
    syncLoadMore();
  }

  /** 1回分の /api/archive/search を取得し、searchCache にマージする */
  function fetchSearchPage(offset, done) {
    // ユーザー名検索は「配信単位」でページングする（1配信あたり数件のサンプルが返る）
    var isAuthor = !!state.author;
    return apiGet('/api/archive/search', {
      q: state.q,
      author: state.author || undefined,
      kind: state.kind,
      category: state.category,
      limit: isAuthor ? AUTHOR_LIMIT : SEARCH_LIMIT,
      offset: offset,
    }).then(function (data) {
      var meta = data.videos || {};
      var titleCount = (data.title || []).length;
      var hitCounts = {};
      HIT_KINDS.forEach(function (k) { hitCounts[k] = (data[k] || []).length; });

      // サーバが limit ちょうどを返してきた種別が1つでもあれば「まだ続きがある」とみなす
      var hasMore = false;
      if (isAuthor) {
        // author 検索はサーバが正確な has_more / 総件数を返す
        hasMore = !!data.has_more;
        searchCache.authorTotals = {
          hits: data.total_hits || 0,
          videos: data.total_videos || 0,
          perVideo: data.per_video || 0,
        };
      } else if (state.kind === 'all') {
        if (titleCount >= SEARCH_LIMIT) hasMore = true;
        HIT_KINDS.forEach(function (k) { if (hitCounts[k] >= SEARCH_LIMIT) hasMore = true; });
      } else if (state.kind === 'title') {
        if (titleCount >= SEARCH_LIMIT) hasMore = true;
      } else {
        if ((hitCounts[state.kind] || 0) >= SEARCH_LIMIT) hasMore = true;
      }

      if (offset === 0) {
        // 初回は作り直し
        var byVideo = new Map();
        var titleHits = new Map();
        var totalHits = 0;
        (data.title || []).forEach(function (hit) {
          totalHits++;
          titleHits.set(hit.video_id, hit.snippet || hit.title);
          if (!byVideo.has(hit.video_id)) byVideo.set(hit.video_id, []);
        });
        HIT_KINDS.forEach(function (kind) {
          (data[kind] || []).forEach(function (hit) {
            hit.kind = kind;
            totalHits++;
            if (!byVideo.has(hit.video_id)) byVideo.set(hit.video_id, []);
            byVideo.get(hit.video_id).push(hit);
          });
        });
        searchCache.groups = Array.from(byVideo.entries()).map(function (entry) {
          var id = entry[0];
          var hits = entry[1];
          var video = meta[id] || { video_id: id, url: videoUrl(id) };
          video.video_id = id;
          if (!video.title) video.title = (hits[0] && hits[0].title) || titleHits.get(id) || '';
          return { video: video, hits: hits, titleSnippet: titleHits.get(id) || '' };
        });
        searchCache.totalHits = totalHits;
        // titleHits を動画ID→snippetで保持しておくと、追記時に既存カードのタイトル一致が消えない
        searchCache._titleHits = titleHits;
        searchCache._byVideo = byVideo;
      } else {
        // 追記 — 既存の Map にマージ
        var byVideo2 = searchCache._byVideo;
        var titleHits2 = searchCache._titleHits;
        var meta2 = meta;
        // 新しく得たメタを既存グループにも反映（views/likesなどが欠けていた場合）
        searchCache.groups.forEach(function (g) {
          if (meta2[g.video.video_id]) {
            var m = meta2[g.video.video_id];
            if (!g.video.title && m.title) g.video.title = m.title;
            if (m.view_count != null) g.video.view_count = m.view_count;
            if (m.like_count != null) g.video.like_count = m.like_count;
            if (!g.video.stream_at_jst && m.stream_at_jst) g.video.stream_at_jst = m.stream_at_jst;
            if (!g.video.stream_date_jst && m.stream_date_jst) g.video.stream_date_jst = m.stream_date_jst;
          }
        });
        (data.title || []).forEach(function (hit) {
          searchCache.totalHits++;
          if (!titleHits2.has(hit.video_id)) titleHits2.set(hit.video_id, hit.snippet || hit.title);
          if (!byVideo2.has(hit.video_id)) {
            byVideo2.set(hit.video_id, []);
            // 新規動画
            var video = meta2[hit.video_id] || { video_id: hit.video_id, url: videoUrl(hit.video_id), title: hit.title || '' };
            video.video_id = hit.video_id;
            searchCache.groups.push({ video: video, hits: [], titleSnippet: titleHits2.get(hit.video_id) || '' });
          }
          // 既存動画の titleSnippet を補完
          var g2 = searchCache.groups.find(function (x) { return x.video.video_id === hit.video_id; });
          if (g2 && !g2.titleSnippet) g2.titleSnippet = titleHits2.get(hit.video_id) || '';
        });
        HIT_KINDS.forEach(function (kind) {
          (data[kind] || []).forEach(function (hit) {
            hit.kind = kind;
            searchCache.totalHits++;
            if (!byVideo2.has(hit.video_id)) {
              byVideo2.set(hit.video_id, []);
              var video2 = meta2[hit.video_id] || { video_id: hit.video_id, url: videoUrl(hit.video_id), title: hit.title || '' };
              video2.video_id = hit.video_id;
              var th = titleHits2.get(hit.video_id) || '';
              searchCache.groups.push({ video: video2, hits: [], titleSnippet: th });
            }
            byVideo2.get(hit.video_id).push(hit);
            var gg = searchCache.groups.find(function (x) { return x.video.video_id === hit.video_id; });
            if (gg) gg.hits.push(hit);
          });
        });
      }

      searchCache.offset = offset;
      searchCache.hasMore = hasMore;
      if (typeof done === 'function') done();
    });
  }

  function loadSearch() {
    showSkeleton(4);
    setStatus(searchLabel() + ' を検索中…');
    var key = searchKey();
    var isNewQuery = searchCache.key !== key;
    if (isNewQuery) {
      searchCache.key = key;
      searchCache.groups = [];
      searchCache.totalHits = 0;
      searchCache.offset = 0;
      searchCache.hasMore = false;
      searchCache._byVideo = new Map();
      searchCache._titleHits = new Map();
    }
    searchCache.loadingMore = false;
    return fetchSearchPage(0, function () { renderSearch(); });
  }

  function loadMoreSearch() {
    if (!searchCache.hasMore || searchCache.loadingMore) return;
    searchCache.loadingMore = true;
    syncLoadMore();
    var nextOffset = searchCache.offset + (state.author ? AUTHOR_LIMIT : SEARCH_LIMIT);
    fetchSearchPage(nextOffset, function () {
      searchCache.loadingMore = false;
      renderSearch();
    }).catch(function (err) {
      searchCache.loadingMore = false;
      syncLoadMore();
      if (err && err.name === 'AbortError') return;
      setStatus('追加の読み込みに失敗しました: ' + (err && err.message ? err.message : String(err)), true);
    });
  }

  function load() {
    var run;
    if (!state.q && !state.author) {
      run = loadList();
    } else if (searchCache.key === searchKey() && searchCache.groups.length) {
      renderSearch(); // 並び替えだけなら取得済みの結果を並べ直す（再取得なし）
      return;
    } else {
      run = loadSearch();
    }
    if (!run) return;
    run.catch(function (err) {
      if (err && err.name === 'AbortError') return;
      renderCards('<p class="ar-empty">読み込みに失敗しました。<br>'
        + esc(err && err.message ? err.message : String(err)) + '</p>');
      el.pager.hidden = true;
      if (el.loadMoreWrap) el.loadMoreWrap.hidden = true;
      setStatus('エラー', true);
    });
  }

  function loadCategories() {
    fetch('/api/archive/stats')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var cats = data && data.categories ? data.categories : {};
        var names = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
        names.forEach(function (name) {
          var opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name + '（' + cats[name] + '）';
          el.category.appendChild(opt);
        });
        if (state.category) el.category.value = state.category;
      })
      .catch(function () { /* カテゴリが取れなくても検索自体は使える */ });
  }

  // ---------------------------------------------------------------- state <-> URL

  function readUrl() {
    var p = new URLSearchParams(location.search);
    state.q = (p.get('q') || '').trim();
    state.author = (p.get('author') || '').trim();
    state.kind = p.get('kind') || 'all';
    state.category = p.get('category') || '';
    state.sort = p.get('sort') || DEFAULT_SORT;
    state.page = Math.max(0, parseInt(p.get('page'), 10) - 1 || 0);
    normalizeSort();
  }

  function writeUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.author) p.set('author', state.author);
    if (state.kind !== 'all') p.set('kind', state.kind);
    if (state.category) p.set('category', state.category);
    if (state.sort !== DEFAULT_SORT) p.set('sort', state.sort);
    if (!state.q && !state.author && state.page > 0) p.set('page', String(state.page + 1));
    var url = location.pathname + (p.toString() ? '?' + p.toString() : '');
    history.pushState(null, '', url);
  }

  function syncForm() {
    el.q.value = state.q;
    el.author.value = state.author;
    el.kind.value = state.kind;
    if (el.category.querySelector('option[value="' + CSS.escape(state.category) + '"]')) {
      el.category.value = state.category;
    }
    // ヒット件数順は検索時のみ選べる
    var hasQuery = !!(state.q || state.author);
    el.sortHits.hidden = !hasQuery;
    el.sortHits.disabled = !hasQuery;
    el.sort.value = state.sort;
    el.kindWrap.hidden = !hasQuery;
    el.clearWrap.hidden = !hasQuery;
  }

  function apply() {
    normalizeSort();
    writeUrl();
    syncForm();
    load();
  }

  function goToPage(page) {
    if (page === state.page || page < 0) return;
    state.page = page;
    apply();
    var top = el.form.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- 左右の立ち絵（スクロール連動）

  function initDeco() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.ar-deco'));
    if (!nodes.length) return;

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      nodes.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }

    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;

      nodes.forEach(function (n) {
        // スクロール量の一部だけ下へずらす → 本文より遅れて流れる（＝スクロールが鈍い）
        var speed = parseFloat(n.dataset.speed);
        if (!isFinite(speed)) speed = 0.2;
        n.style.setProperty('--dy', (y * speed).toFixed(1) + 'px');
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    requestAnimationFrame(function () {
      nodes.forEach(function (n) { n.classList.add('is-in'); });
    });
  }

  // ---------------------------------------------------------------- init

  function init() {
    initDeco();

    el.form = document.getElementById('ar-form');
    el.q = document.getElementById('ar-q');
    el.author = document.getElementById('ar-author');
    el.authorWrap = document.getElementById('ar-author-wrap');
    el.kind = document.getElementById('ar-kind');
    el.kindWrap = document.getElementById('ar-kind-wrap');
    el.category = document.getElementById('ar-category');
    el.sort = document.getElementById('ar-sort');
    el.sortHits = document.getElementById('ar-sort-hits');
    el.clear = document.getElementById('ar-clear');
    el.clearWrap = document.getElementById('ar-clear-wrap');
    el.results = document.getElementById('ar-results');
    el.status = document.getElementById('ar-status');
    el.pager = document.getElementById('ar-pager');
    el.loadMore = document.getElementById('ar-load-more');
    el.loadMoreWrap = document.getElementById('ar-load-more-wrap');
    if (!el.form || !el.results) return;

    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      state.q = el.q.value.trim();
      state.author = el.author.value.trim();
      if (state.author) {
        // ユーザー名検索はライブチャット対象に固定
        state.kind = 'chat';
        if (el.kind) el.kind.value = 'chat';
      }
      state.page = 0;
      apply();
    });

    el.clear.addEventListener('click', function () {
      state.q = '';
      state.author = '';
      state.page = 0;
      el.q.value = '';
      el.author.value = '';
      searchCache.key = '';
      apply();
    });

    el.kind.addEventListener('change', function () {
      state.kind = el.kind.value;
      apply();
    });

    el.category.addEventListener('change', function () {
      state.category = el.category.value;
      state.page = 0;
      apply();
    });

    el.sort.addEventListener('change', function () {
      state.sort = el.sort.value;
      if (!state.q && !state.author) state.page = 0;
      apply();
    });

    el.pager.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      goToPage(parseInt(btn.dataset.page, 10));
    });

    bindBadgeClick();

    if (el.loadMore) el.loadMore.addEventListener('click', function () { loadMoreSearch(); });

    window.addEventListener('popstate', function () {
      readUrl();
      syncForm();
      load();
    });

    readUrl();
    loadCategories();
    syncForm();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
