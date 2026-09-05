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
  var state = { q: '', kind: 'all', category: '', sort: DEFAULT_SORT, page: 0 };
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
    return '<li class="ar-hit">'
      + '<div class="ar-hit-head">'
      + '<span class="ar-hit-kind ar-kind-' + esc(hit.kind) + '">' + esc(KIND_LABEL[hit.kind] || hit.kind) + '</span>'
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
    var head = '<div class="ar-hits-title"><i class="fa-solid fa-quote-left"></i> 該当箇所 ' + hits.length + ' 件</div>';
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
    return '<article class="ar-card' + (hits ? ' has-hits' : '') + '">'
      + thumbHtml(video)
      + '<div class="ar-body">'
      + '<div class="ar-date"><i class="fa-regular fa-calendar"></i> ' + esc(formatDate(video)) + badge + '</div>'
      + '<h3 class="ar-title">' + titleHtml + '</h3>'
      + catsHtml(video.categories)
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
  }

  function setStatus(text, isError) {
    el.status.textContent = text || '';
    el.status.classList.toggle('is-error', !!isError);
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
    if (!state.q && SEARCH_ONLY_SORTS.indexOf(state.sort) >= 0) state.sort = DEFAULT_SORT;
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
    return [state.q, state.kind, state.category].join('\u0000');
  }

  function syncLoadMore() {
    if (!el.loadMoreWrap) return;
    if (!state.q) { el.loadMoreWrap.hidden = true; return; }
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
      renderCards('<p class="ar-empty">「' + esc(state.q) + '」に一致する箇所は見つかりませんでした。</p>');
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
    setStatus('「' + esc(state.q) + '」: ' + groups.length + ' 本の動画で ' + searchCache.totalHits + ' 件ヒット'
      + (searchCache.hasMore ? ' — まだ続きがあります' : ''));
    syncLoadMore();
  }

  /** 1回分の /api/archive/search を取得し、searchCache にマージする */
  function fetchSearchPage(offset, done) {
    return apiGet('/api/archive/search', {
      q: state.q,
      kind: state.kind,
      category: state.category,
      limit: SEARCH_LIMIT,
      offset: offset,
    }).then(function (data) {
      var meta = data.videos || {};
      var titleCount = (data.title || []).length;
      var hitCounts = {};
      HIT_KINDS.forEach(function (k) { hitCounts[k] = (data[k] || []).length; });

      // サーバが limit ちょうどを返してきた種別が1つでもあれば「まだ続きがある」とみなす
      var hasMore = false;
      if (state.kind === 'all') {
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
    setStatus('「' + state.q + '」を検索中…');
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
    var nextOffset = searchCache.offset + SEARCH_LIMIT;
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
    if (!state.q) {
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
    state.kind = p.get('kind') || 'all';
    state.category = p.get('category') || '';
    state.sort = p.get('sort') || DEFAULT_SORT;
    state.page = Math.max(0, parseInt(p.get('page'), 10) - 1 || 0);
    normalizeSort();
  }

  function writeUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.kind !== 'all') p.set('kind', state.kind);
    if (state.category) p.set('category', state.category);
    if (state.sort !== DEFAULT_SORT) p.set('sort', state.sort);
    if (!state.q && state.page > 0) p.set('page', String(state.page + 1));
    var url = location.pathname + (p.toString() ? '?' + p.toString() : '');
    history.pushState(null, '', url);
  }

  function syncForm() {
    el.q.value = state.q;
    el.kind.value = state.kind;
    if (el.category.querySelector('option[value="' + CSS.escape(state.category) + '"]')) {
      el.category.value = state.category;
    }
    // ヒット件数順は検索時のみ選べる
    el.sortHits.hidden = !state.q;
    el.sortHits.disabled = !state.q;
    el.sort.value = state.sort;
    el.kindWrap.hidden = !state.q;
    el.clearWrap.hidden = !state.q;
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
      state.page = 0;
      apply();
    });

    el.clear.addEventListener('click', function () {
      state.q = '';
      state.page = 0;
      el.q.value = '';
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
      if (!state.q) state.page = 0;
      apply();
    });

    el.pager.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      goToPage(parseInt(btn.dataset.page, 10));
    });

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
