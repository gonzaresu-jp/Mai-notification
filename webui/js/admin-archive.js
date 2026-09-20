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

  const badge = (v) => {
    const cls = v.availability === 'deleted' ? 'deleted' : '';
    return `<span class="arc-badge ${cls}">${esc(v.availability || 'public')}</span>`;
  };

  // --- タブ切替 ---
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
  }

  // --- カテゴリ編集タブ ---
  const catVideos = [];
  let catOffset = 0;
  let catAllLoaded = false;
  const PAGE = 50;

  // 取得済みのカテゴリ表記を video_id -> text で保持し、
  // 「もっと読み込む」などで再利用する（再描画で「-」に戻る・再フェッチするのを防ぐ）
  const catCache = new Map();

  async function loadCatPage(reset) {
    const info = $('arc-cat-info');
    const listEl = $('arc-cat-list');
    try {
      if (reset) { catVideos.length = 0; catOffset = 0; catAllLoaded = false; }
      const d = await api(`/api/admin/archive/videos?limit=${PAGE}&offset=${catOffset}&sort=stream_at_desc&include_deleted=1`);
      const videos = d.videos || [];
      if (!videos.length) { catAllLoaded = true; info.textContent = 'これ以上の動画はありません。'; }
      catVideos.push(...videos);
      catOffset += videos.length;
      info.textContent = `読み込み済み ${catVideos.length} 本${d.total ? ' / 全 ' + d.total + ' 本' : ''}`;
      renderCats();
    } catch (e) {
      info.innerHTML = `<span style="color:#b3261e">読み込みエラー: ${esc(e.message)}</span>`;
      setStatus('カテゴリ一覧を取得できませんでした', 'error');
    }
  }

  function renderCats() {
    const listEl = $('arc-cat-list');
    const filter = $('arc-cat-filter').value.trim().toLowerCase();
    const rows = catVideos.filter((v) => {
      if (!filter) return true;
      return (v.title || '').toLowerCase().includes(filter) || (v.video_id || '').toLowerCase().includes(filter);
    });
    listEl.innerHTML = rows.map((v) => `
      <div class="arc-row" data-id="${esc(v.video_id)}">
        <div class="arc-row-head">
          <div class="arc-row-title">${esc(v.title || '(タイトルなし)')}</div>
          ${badge(v)}
        </div>
        <div class="arc-row-meta">${esc(v.video_id)} ・ ${esc(v.stream_date_jst || '日付不明')} ・ <span class="cats-inline" data-id="${esc(v.video_id)}">${esc(catCache.get(v.video_id) || '-')}</span></div>
        <div class="arc-row-actions">
          <button type="button" class="btn-secondary arc-edit" data-id="${esc(v.video_id)}">✏️ カテゴリ編集</button>
        </div>
        <div class="arc-editor" data-editor="${esc(v.video_id)}" style="display:none;"></div>
      </div>`).join('') || '<div class="arc-info">該当なし</div>';
    // 未取得のものだけフェッチする（取得済みはキャッシュ表示）
    listEl.querySelectorAll('.cats-inline').forEach((el) => {
      if (!catCache.has(el.dataset.id)) fillCatInline(el);
    });
  }

  async function fillCatInline(el) {
    try {
      const d = await api('/api/admin/archive/video/' + el.dataset.id);
      const cats = (d.categories || []).filter((c) => c);
      const text = cats.length ? cats.join(', ') : '（カテゴリなし）';
      catCache.set(el.dataset.id, text);
      el.textContent = text;
    } catch { el.textContent = '（未取得）'; }
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
    const union = Array.from(new Set([...MASTER_CATS, ...current]));
    const box = (name, checked) => `
      <label><input type="checkbox" class="arc-cat-cb" value="${esc(name)}" ${checked ? 'checked' : ''}> ${esc(name)}</label>`;
    holderEl.innerHTML = `
      <div class="form-group">
        <label>タイトル</label>
        <input type="text" data-cat-title value="${esc(detail.title || '')}" />
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
      if (newTitle && newTitle !== (detail.title || '')) payload.title = newTitle;
      try {
        await api('/api/admin/archive/video/' + videoId, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setStatus('カテゴリを保存しました');
        const text = next.length ? next.join(', ') : '（カテゴリなし）';
        catCache.set(videoId, text);
        const el = document.querySelector(`.cats-inline[data-id="${videoId}"]`);
        if (el) el.textContent = text;
        openEditor(videoId, holderEl);
      } catch (e) {
        setStatus('保存エラー: ' + e.message, 'error');
      }
    });
    holderEl.querySelector('[data-cat-close]').addEventListener('click', () => { holderEl.style.display = 'none'; });
  }

  $('arc-cat-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.arc-edit');
    if (!btn) return;
    const row = btn.closest('.arc-row');
    const holder = row.querySelector('.arc-editor');
    openEditor(btn.dataset.id, holder);
  });
  $('arc-cat-reload').addEventListener('click', () => loadCatPage(true));
  $('arc-cat-more').addEventListener('click', () => loadCatPage(false));
  $('arc-cat-search').addEventListener('click', () => renderCats());
  $('arc-cat-filter').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderCats(); });

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
      await loadCatPage(true);
    } catch { /* loadCatPage が自身で表示する */ }
  })();
})();