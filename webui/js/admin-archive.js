(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  if (!$('arc-cat-list')) return;

  const STATUS_DURATION = 5000;
  let statusTimer = null;
  function setStatus(msg, type) {
    const el = $('arc-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status-message' + (msg ? ' show' : '') + (type === 'error' ? ' status-error' : '');
    clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(() => { el.className = 'status-message'; }, STATUS_DURATION);
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  async function api(url, opt = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      ...opt,
      headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
    });
    let data = null;
    try { data = await res.json(); } catch { /* noop */ }
    if (!res.ok) throw new Error((data && (data.error || data.detail)) || ('HTTP ' + res.status));
    return data;
  }

  function videoIdFrom(input) {
    const s = String(input || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    const m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    const m2 = s.match(/(?:youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m2) return m2[1];
    return null;
  }

  const fmtViews = (n) => {
    const v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + '千';
    return String(v);
  };

  const badge = (v) => {
    const cls = v.availability === 'deleted' ? 'deleted' : '';
    return `<span class="arc-badge ${cls}">${esc(v.availability || 'public')}</span>`;
  };

  const thumb = (v) => {
    if (v.availability === 'deleted') return '';
    return `<div class="arc-thumb"><img src="https://i.ytimg.com/vi/${esc(v.video_id)}/mqdefault.jpg" loading="lazy" alt="" /></div>`;
  };

  // --- タブ切替（アーカイブ内） ---
  $('arc-tabbar').addEventListener('click', (e) => {
    const btn = e.target.closest('.arc-tab');
    if (!btn) return;
    document.querySelectorAll('.arc-tab').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const tab = btn.dataset.tab;
    $('arc-pane-cats').style.display = tab === 'cats' ? '' : 'none';
    $('arc-pane-deleted').style.display = tab === 'deleted' ? '' : 'none';
    if (tab === 'deleted' && $('arc-del-list').textContent.trim() === '読み込み中...') loadDeleted();
  });

  // --- カテゴリ一覧（マスター） ---
  let MASTER_CATS = [];
  async function loadMasterCategories() {
    try {
      const d = await api('/api/admin/archive/categories');
      MASTER_CATS = (d.categories || []).map((c) => c.name);
    } catch (e) {
      MASTER_CATS = [];
    }
    const opts = MASTER_CATS.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const filt = $('arc-cat-filter');
    if (filt) {
      const cur = filt.value;
      filt.innerHTML = '<option value="">すべてのカテゴリ</option>' + opts;
      filt.value = cur || '';
    }
    const batch = $('arc-batch-cat');
    if (batch) batch.innerHTML = '<option value="">カテゴリを選ぶ…</option>' + opts;
  }

  // --- カテゴリ編集タブ ---
  const PAGE = 50;
  // 現在の表示クエリ
  let curQuery = { q: '', category: '', sort: 'stream_at_desc' };
  let curOffset = 0;
  let curTotal = 0;
  let curVideos = [];

  // 各行のカテゴリを video_id -> string[] で保持
  const catsMap = new Map();
  // バッチ選択
  const selected = new Set();

  function loadCatPage(offset, fromReset) {
    const info = $('arc-cat-info');
    const listEl = $('arc-cat-list');
    if (fromReset) { curOffset = 0; curTotal = 0; curVideos = []; selected.clear(); }
    if (offset !== undefined) curOffset = offset;

    const params = new URLSearchParams({
      limit: PAGE,
      offset: curOffset,
      sort: curQuery.sort || 'stream_at_desc',
      include_deleted: '1',
    });
    if (curQuery.category) params.set('category', curQuery.category);

    let p;
    if (curQuery.q) {
      params.set('q', curQuery.q);
      params.set('kind', 'title');
      // 検索は /api/search → videos マップになる
      p = api('/api/admin/archive/search?' + params.toString()).then((d) => {
        const hits = Array.isArray(d.title) ? d.title : (d.title ? Object.values(d.title) : []);
        const map = d.videos || {};
        const videos = hits.map((h) => (h && h.video_id ? map[h.video_id] || h : h)).filter(Boolean);
        curTotal = (d.total !== undefined && d.total !== null) ? d.total : (curOffset + videos.length);
        return { videos, total: curTotal };
      });
    } else {
      p = api('/api/admin/archive/videos?' + params.toString()).then((d) => ({
        videos: d.videos || [],
        total: d.total || 0,
      }));
    }

    listEl.innerHTML = '読み込み中...';
    return p.then(({ videos, total }) => {
      curVideos = videos;
      curTotal = total;
      videos.forEach((v) => {
        catsMap.set(v.video_id, Array.isArray(v.categories) ? v.categories.filter((c) => c) : []);
      });
      const from = curVideos.length ? curOffset + 1 : 0;
      const to = curOffset + curVideos.length;
      info.textContent = curQuery.q
        ? `検索結果 ${videos.length} 件${total ? ' / 該当 ' + total + ' 件' : ''} ${curQuery.q ? '（「' + curQuery.q + '」）' : ''}`
        : `表示 ${from}〜${to} 本 / 全 ${total || 0} 本`;
      renderCats();
      renderPagination();
    }).catch((e) => {
      info.innerHTML = `<span style="color:#b3261e">読み込みエラー: ${esc(e.message)}</span>`;
      listEl.innerHTML = '';
      setStatus('一覧を取得できませんでした', 'error');
      renderPagination();
    });
  }

  function renderPagination() {
    const pageCount = Math.max(1, Math.ceil(curTotal / PAGE));
    const pageNum = Math.floor(curOffset / PAGE) + 1;
    $('arc-cat-pg-info').textContent = curTotal ? `${pageNum} / ${pageCount} ページ` : '';
    const prev = $('arc-cat-prev');
    const next = $('arc-cat-next');
    prev.disabled = curOffset <= 0;
    next.disabled = curOffset + PAGE >= curTotal;
  }

  function renderCats() {
    const listEl = $('arc-cat-list');
    const rows = curVideos.map((v) => {
      const cats = catsMap.get(v.video_id) || [];
      const chips = cats.map((c) =>
        `<span class="arc-cat-chip on" data-id="${esc(v.video_id)}" data-cat="${esc(c)}">${esc(c)}<span class="x">×</span></span>`).join('');
      const suggestions = MASTER_CATS.filter((c) => !cats.includes(c)).slice(0, 4);
      const sug = suggestions.map((c) =>
        `<span class="arc-cat-chip" data-id="${esc(v.video_id)}" data-cat="${esc(c)}">+${esc(c)}</span>`).join('');
      return `
      <div class="arc-row" data-id="${esc(v.video_id)}">
        <input type="checkbox" class="arc-sel" data-sel="${esc(v.video_id)}" ${selected.has(v.video_id) ? 'checked' : ''} title="一括適用の対象に追加" />
        ${thumb(v)}
        <div class="arc-row-body">
          <div class="arc-row-head">
            <div class="arc-row-title">${esc(v.title || '(タイトルなし)')}</div>
            ${badge(v)}
          </div>
          <div class="arc-row-meta">${esc(v.video_id)} ・ ${esc(v.stream_date_jst || '日付不明')}
            ${v.view_count ? `<span class="arc-stat-cell">👁 ${fmtViews(v.view_count)}</span>` : ''}
          </div>
          <div class="arc-cat-show-list">${chips}${sug}</div>
        </div>
        <div class="arc-row-actions">
          <a class="btn-secondary" href="https://www.youtube.com/watch?v=${esc(v.video_id)}" target="_blank" rel="noopener">▶ YT</a>
          <button type="button" class="btn-secondary arc-edit" data-id="${esc(v.video_id)}">✏️ 詳細編集</button>
        </div>
        <div class="arc-editor" data-editor="${esc(v.video_id)}" style="display:none;"></div>
      </div>`;
    }).join('');
    listEl.innerHTML = rows || '<div class="arc-info">該当なし</div>';
    updateBatchBar();
  }

  function updateBatchBar() {
    $('arc-batch-num').textContent = selected.size + ' 件選択';
    $('arc-batchbar').style.display = selected.size ? '' : 'none';
    const selAll = $('arc-batch-selall');
    selAll.checked = curVideos.length > 0 && curVideos.every((v) => selected.has(v.video_id));
  }

  // チップクリック（追加/削除）
  $('arc-cat-list').addEventListener('click', (e) => {
    const chip = e.target.closest('.arc-cat-chip');
    if (chip) {
      applyCatToggle(chip.dataset.id, chip.dataset.cat, chip.classList.contains('on'));
      return;
    }
    const btn = e.target.closest('.arc-edit');
    if (btn) {
      const row = btn.closest('.arc-row');
      openEditor(btn.dataset.id, row.querySelector('.arc-editor'));
      return;
    }
    const sel = e.target.closest('.arc-sel');
    if (sel) {
      if (sel.checked) selected.add(sel.dataset.sel); else selected.delete(sel.dataset.sel);
      updateBatchBar();
    }
  });

  async function applyCatToggle(videoId, cat, currentlyOn) {
    if (!cat) return;
    const current = [...(catsMap.get(videoId) || [])];
    const next = currentlyOn
      ? current.filter((c) => c !== cat)
      : Array.from(new Set([...current, cat]));
    catsMap.set(videoId, next);
    try {
      await api('/api/admin/archive/video/' + videoId, {
        method: 'PATCH',
        body: JSON.stringify({ categories: next }),
      });
      setStatus(currentlyOn ? `「${cat}」を解除しました` : `「${cat}」を追加しました`);
      renderCats();
    } catch (e) {
      catsMap.set(videoId, current);
      renderCats();
      setStatus('更新エラー: ' + e.message, 'error');
    }
  }

  // 一括適用
  $('arc-batch-add').addEventListener('click', () => batchApply(true));
  $('arc-batch-remove').addEventListener('click', () => batchApply(false));
  async function batchApply(add) {
    const cat = $('arc-batch-cat').value;
    if (!cat) { setStatus('一括適用するカテゴリを選択してください', 'error'); return; }
    if (!selected.size) { setStatus('選択中の動画がありません', 'error'); return; }
    const ids = [...selected];
    try {
      for (const id of ids) {
        let next;
        if (add) {
          next = Array.from(new Set([...(catsMap.get(id) || []), cat]));
        } else {
          next = (catsMap.get(id) || []).filter((c) => c !== cat);
        }
        catsMap.set(id, next);
        await api('/api/admin/archive/video/' + id, {
          method: 'PATCH',
          body: JSON.stringify({ categories: next }),
        });
      }
      setStatus(add ? `「${cat}」を ${ids.length} 件に追加しました` : `「${cat}」を ${ids.length} 件から解除しました`);
      selected.clear();
      renderCats();
    } catch (e) {
      setStatus('一括更新エラー: ' + e.message, 'error');
      loadCatPage(curOffset);
    }
  }

  $('arc-batch-clear').addEventListener('click', () => { selected.clear(); renderCats(); });
  $('arc-batch-selall').addEventListener('change', (e) => {
    curVideos.forEach((v) => {
      if (e.target.checked) selected.add(v.video_id); else selected.delete(v.video_id);
    });
    renderCats();
  });

  // 検索・フィルタ・ソート・ページング
  $('arc-cat-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
  $('arc-cat-filter').addEventListener('change', runSearch);
  $('arc-cat-sort').addEventListener('change', runSearch);
  $('arc-cat-reload').addEventListener('click', runSearch);
  $('arc-cat-prev').addEventListener('click', () => loadCatPage(Math.max(0, curOffset - PAGE)));
  $('arc-cat-next').addEventListener('click', () => loadCatPage(curOffset + PAGE));

  function runSearch() {
    curQuery.q = $('arc-cat-search').value.trim();
    curQuery.category = $('arc-cat-filter').value || '';
    curQuery.sort = $('arc-cat-sort').value || 'stream_at_desc';
    loadCatPage(0, true);
  }

  async function openEditor(videoId, holderEl) {
    holderEl.style.display = '';
    holderEl.innerHTML = '読み込み中...';
    let detail;
    try {
      detail = await api('/api/admin/archive/video/' + videoId);
    } catch (e) {
      holderEl.innerHTML = `<span style="color:#b3261e">詳細取得エラー: ${esc(e.message)}</span>`;
      return;
    }
    const current = Array.isArray(detail.categories) ? detail.categories.filter((c) => c) : [];
    const title = String(detail.title || '');
    if (detail.video_id && catsMap.get(videoId) === undefined && current.length && !title) {
      // タイトル未取得の場合は、現行カテゴリから補完
      catsMap.set(videoId, current);
    }
    const union = Array.from(new Set([...MASTER_CATS, ...current]));
    const box = (name, checked) => `
      <label><input type="checkbox" class="arc-cat-cb" value="${esc(name)}" ${checked ? 'checked' : ''}> ${esc(name)}</label>`;
    holderEl.innerHTML = `
      <div class="form-group">
        <label>タイトル</label>
        <input type="text" data-cat-title value="${esc(title)}" />
      </div>
      <div class="form-group">
        <label>カテゴリ（このリストで選択）</label>
        <div class="cat-opts">${union.map((c) => box(c, current.includes(c))).join('') || '<span style="color:#888">カテゴリ候補がありません</span>'}</div>
      </div>
      <div class="form-group">
        <label>新しいカテゴリを追加</label>
        <input type="text" data-cat-new placeholder="例: 歌ってみた（既存候補になければ）" />
      </div>
      <div class="inline-actions">
        <button type="button" class="btn-primary" data-cat-save>💾 保存</button>
        <button type="button" class="btn-secondary" data-cat-close>閉じる</button>
      </div>`;
    holderEl.querySelector('[data-cat-save]').addEventListener('click', async () => {
      const checks = [...holderEl.querySelectorAll('.arc-cat-cb')].filter((c) => c.checked).map((c) => c.value);
      const extra = holderEl.querySelector('[data-cat-new]').value.split(/[、,]/).map((s) => s.trim()).filter(Boolean);
      const next = Array.from(new Set([...checks, ...extra]));
      const payload = { categories: next };
      const newTitle = holderEl.querySelector('[data-cat-title]').value.trim();
      if (newTitle && newTitle !== title) payload.title = newTitle;
      try {
        await api('/api/admin/archive/video/' + videoId, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setStatus('カテゴリを保存しました');
        catsMap.set(videoId, next);
        const prev = catsMap.get(videoId);
        if (prev) catsMap.set(videoId, next);
        openEditor(videoId, holderEl);
      } catch (e) {
        setStatus('保存エラー: ' + e.message, 'error');
      }
    });
    holderEl.querySelector('[data-cat-close]').addEventListener('click', () => { holderEl.style.display = 'none'; });
  }

  // --- 削除済み動画タブ ---
  async function loadDeleted() {
    const info = $('arc-del-info');
    const listEl = $('arc-del-list');
    listEl.innerHTML = '読み込み中...';
    try {
      const d = await api('/api/admin/archive/videos?availability=deleted&include_deleted=1&limit=100&sort=stream_at_desc');
      const videos = d.videos || [];
      info.textContent = `登録済み ${videos.length} 本`;
      listEl.innerHTML = videos.map((v) => `
        <div class="arc-row dim" data-id="${esc(v.video_id)}">
          <div class="arc-row-head">
            <div class="arc-row-title">${esc(v.title || '(タイトルなし)')}</div>
            <span class="arc-badge deleted">削除済み</span>
          </div>
          <div class="arc-row-meta">${esc(v.video_id)} ・ ${esc(v.stream_date_jst || '日付不明')} ・ 字幕: <span class="tr-badge" data-id="${esc(v.video_id)}">...</span> ・ 要約: <span class="min-badge" data-id="${esc(v.video_id)}">...</span></div>
          <div class="arc-row-actions">
            <button type="button" class="btn-secondary arc-edit" data-id="${esc(v.video_id)}">✏️ カテゴリ編集</button>
            <button type="button" class="btn-secondary arc-restore" data-id="${esc(v.video_id)}">↩️ 公開に戻す</button>
            <button type="button" class="btn-primary arc-gen" data-id="${esc(v.video_id)}">🤖 要約を生成</button>
            <button type="button" class="event-btn event-btn-danger arc-purge" data-id="${esc(v.video_id)}">🗑 完全削除</button>
          </div>
          <div class="arc-editor" data-editor="${esc(v.video_id)}" style="display:none;"></div>
        </div>`).join('') || '<div class="arc-info">削除済み動画の登録はありません</div>';

      videos.forEach((v) => {
        fetchBadges(v.video_id);
      });
    } catch (e) {
      listEl.innerHTML = `<div class="arc-info" style="color:#b3261e">読み込みエラー: ${esc(e.message)}</div>`;
    }
  }

  async function fetchBadges(videoId) {
    try {
      const tr = await api('/api/archive/transcript/' + videoId);
      const trEl = document.querySelector(`.tr-badge[data-id="${videoId}"]`);
      if (trEl) trEl.textContent = tr.has_transcript ? '✅あり' : '❌なし';
    } catch {
      const trEl = document.querySelector(`.tr-badge[data-id="${videoId}"]`);
      if (trEl) trEl.textContent = '?';
    }
    try {
      const mn = await api('/api/admin/archive/minutes/' + videoId);
      const mnEl = document.querySelector(`.min-badge[data-id="${videoId}"]`);
      if (mnEl) mnEl.textContent = mn.count ? mn.count + ' セグメント' : '未生成';
    } catch {
      const mnEl = document.querySelector(`.min-badge[data-id="${videoId}"]`);
      if (mnEl) mnEl.textContent = '?';
    }
  }

  $('arc-del-reload').addEventListener('click', loadDeleted);
  $('arc-del-list').addEventListener('click', (e) => {
    const edit = e.target.closest('.arc-edit');
    if (edit) {
      const row = edit.closest('.arc-row');
      openEditor(edit.dataset.id, row.querySelector('.arc-editor'));
      return;
    }
    const restore = e.target.closest('.arc-restore');
    if (restore) {
      if (!confirm('この動画を公開検索の対象に戻しますか？')) return;
      doPatch(restore.dataset.id, { availability: 'public' }, '公開に戻しました');
      return;
    }
    const gen = e.target.closest('.arc-gen');
    if (gen) {
      doGenerate(gen.dataset.id);
      return;
    }
    const purge = e.target.closest('.arc-purge');
    if (purge) {
      if (!confirm('カタログ索引から完全に削除します（字幕ファイルは残ります）。実行しますか？')) return;
      doPurge(purge.dataset.id);
    }
  });

  async function doPatch(videoId, body, okMsg) {
    try {
      await api('/api/admin/archive/video/' + videoId, { method: 'PATCH', body: JSON.stringify(body) });
      setStatus(okMsg + ' (' + videoId + ')');
      loadDeleted();
    } catch (e) {
      setStatus('更新エラー: ' + e.message, 'error');
    }
  }

  async function doGenerate(videoId) {
    const btnEl = document.querySelector(`.arc-gen[data-id="${videoId}"]`);
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '生成中...'; }
    try {
      const r = await api('/api/admin/archive/minutes/' + videoId, { method: 'POST', body: '{}' });
      setStatus(r.started ? '要約生成を開始しました' : '要約生成は実行中（クロンのロック待ち）です', r.started ? '' : 'error');
      setTimeout(() => fetchBadges(videoId), 3000);
    } catch (e) {
      setStatus('要約生成エラー: ' + e.message, 'error');
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🤖 要約を生成'; }
    }
  }

  async function doPurge(videoId) {
    try {
      await api('/api/admin/archive/video/' + videoId, { method: 'DELETE' });
      setStatus('完全削除しました (' + videoId + ')');
      loadDeleted();
    } catch (e) {
      setStatus('削除エラー: ' + e.message, 'error');
    }
  }

  $('arc-del-add').addEventListener('click', async () => {
    const id = videoIdFrom($('arc-del-id').value);
    if (!id) { setStatus('video_id が不正です（11文字、または YouTube URL）', 'error'); return; }
    const body = { availability: 'deleted' };
    const title = $('arc-del-title').value.trim();
    if (title) body.title = title;
    const date = $('arc-del-date').value;
    if (date) body.stream_date_jst = date;
    const dur = parseInt($('arc-del-duration').value, 10);
    if (!isNaN(dur) && dur > 0) body.duration_sec = dur;
    const url = $('arc-del-url').value.trim();
    if (url) body.url = url;
    try {
      const r = await api('/api/admin/archive/video/' + id, { method: 'PATCH', body: JSON.stringify(body) });
      setStatus(r.transcript === false
        ? '登録しましたが字幕ファイルが見つかりません（AI参照はできません）'
        : '削除済み動画として登録しました');
      $('arc-del-id').value = ''; $('arc-del-title').value = ''; $('arc-del-date').value = '';
      $('arc-del-duration').value = ''; $('arc-del-url').value = '';
      loadDeleted();
    } catch (e) {
      setStatus('登録エラー: ' + e.message, 'error');
    }
  });

  // --- 初期化 ---
  (async () => {
    await loadMasterCategories();
    try {
      await loadCatPage(0, true);
    } catch { /* loadCatPage が自身で表示する */ }
  })();
})();