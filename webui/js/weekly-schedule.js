// ============================================
// フロントエンド用: 週間予定表表示スクリプト
// 管理者予定 + ユーザー予定(編集可)を混在表示
// ============================================

const USM_THUMBNAILS = [
  'https://mai.honna-yuzuki.com/user-thumb/1.webp',
  'https://mai.honna-yuzuki.com/user-thumb/2.webp',
  'https://mai.honna-yuzuki.com/user-thumb/3.webp',
  'https://mai.honna-yuzuki.com/user-thumb/4.webp',
  'https://mai.honna-yuzuki.com/user-thumb/5.webp',
  'https://mai.honna-yuzuki.com/user-thumb/6.webp',
  'https://mai.honna-yuzuki.com/user-thumb/7.webp',
];

// サムネピッカー用スタイルを動的に挿入（重複挿入防止）
function ensureUsmThumbPickerStyle() {
  if (document.getElementById('usm-thumb-picker-style')) return;
  const style = document.createElement('style');
  style.id = 'usm-thumb-picker-style';
  style.textContent = `
    .usm-thumb-picker {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 8px;
      margin-top: 6px;
    }
    .usm-thumb-item {
      cursor: pointer;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid transparent;
      transition: border-color .15s, box-shadow .15s;
    }
    .usm-thumb-item img {
      width: 100%;
      height: 60px;
      object-fit: cover;
      display: block;
    }
    .usm-thumb-item.selected {
      border-color: #B11E7C;
      box-shadow: 0 0 0 2px #B11E7C33;
    }
  `;
  document.head.appendChild(style);
}

let currentWeekOffset = 0;
let currentWeekData = [];
let currentUserSchedules = [];
let currentViewMode = 'week'; // 'week' | 'month'
let currentMonthOffset = 0;

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

function toLocalDatetimeValue(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function toSafeHttpUrl(raw) {
  if (!raw) return '';
  try {
    const parsed = new URL(String(raw).trim(), window.location.origin);
    const protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function waitAuthResolved() {
  return new Promise((resolve) => {
    let count = 0;
    const timer = setInterval(() => {
      if (typeof window.__authUser !== 'undefined' || count > 20) {
        clearInterval(timer);
        resolve(window.__authUser || null);
      }
      count += 1;
    }, 200);
  });
}

let _weeklyFetchCache = new Map();

async function loadWeeklySchedule(containerId = 'weekly-schedule', targetDate = new Date()) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const dateStr = formatLocalDate(targetDate);
  const cacheKey = containerId + '_' + dateStr;

  if (_weeklyFetchCache.has(cacheKey)) {
    return _weeklyFetchCache.get(cacheKey);
  }

  const fetchPromise = (async () => {
    // 今週の日付を計算してスケルトン行を表示（week-events 内に読み込み中を表示）
    const dow = targetDate.getDay();
    const weekStart = new Date(targetDate);
    weekStart.setDate(targetDate.getDate() - dow); // 日曜スタート
    const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
    let skeletonHtml = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const isToday = formatLocalDate(d) === formatLocalDate(new Date());
      const month = d.getMonth() + 1;
      const day = d.getDate();
      skeletonHtml += `<div class="${isToday ? 'week-row is-today' : 'week-row'}">
        <div class="week-header">
          <span>${DAY_NAMES[d.getDay()]}</span>
          <span class="week-date">${month}/${day}</span>
        </div>
        <div class="week-events"><div class="event none" style="color:#bbb;">読み込み中...</div></div>
      </div>`;
    }
    container.classList.add('weekly-list', 'is-loading');
    container.style.display = 'flex';
    container.style.width = '100%';
    container.innerHTML = skeletonHtml;

    try {
      const weekPromise = fetch(`/api/events/weekly?date=${dateStr}`).then(res => {
        if (!res.ok) throw new Error('Failed to fetch weekly events');
        return res.json();
      });

      const schPromise = waitAuthResolved().then(async user => {
        if (!user) return { user: null, schedules: [] };
        const res = await fetch('/api/user/schedules', { credentials: 'include' });
        return { user, schedules: res.ok ? await res.json() : [] };
      });

      const [weekly, schResult] = await Promise.all([weekPromise, schPromise]);

      currentWeekData = weekly.week || [];
      currentUserSchedules = schResult.schedules || [];

      container.classList.remove('is-loading');
      renderWeeklyView(container, currentWeekData, currentUserSchedules);
      renderWeeklyMessage(weekly.weekMessage);
      installScheduleControls();
      toggleAddButton(Boolean(schResult.user));
      // 週間表示では年月ラベルを消す
      const _ml = document.getElementById('schedule-month-label');
      if (_ml) { _ml.textContent = ''; _ml.style.display = 'none'; }
    } catch (error) {
      console.error('Error loading weekly schedule:', error);
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#e53935;">エラーが発生しました</div>';
      renderWeeklyMessage(null);
      toggleAddButton(false);
    } finally {
      _weeklyFetchCache.delete(cacheKey);
    }
  })();

  _weeklyFetchCache.set(cacheKey, fetchPromise);
  return fetchPromise;
}

function mergeWeeklyAndUserSchedules(weekData, schedules) {
  const dateMap = new Map();
  const mergedWeek = (weekData || []).map((day) => {
    const events = (day.events || []).map((e) => ({ ...e, __kind: 'admin_event' }));
    dateMap.set(day.date, events);
    return { ...day, events };
  });

  (schedules || []).forEach((s) => {
    const dt = new Date(s.scheduled_at || s.start_time || '');
    if (!Number.isFinite(dt.getTime())) return;
    const dateKey = formatLocalDate(dt);
    if (!dateMap.has(dateKey)) return;

    const editable = Boolean(s.editable);
    dateMap.get(dateKey).push({
      __kind: 'user_schedule',
      schedule_id: s.id,
      title: s.title || s.event_title || 'マイスケジュール',
      note: s.note || '',
      url: s.url || '',
      thumbnail_url: s.thumbnail_url || '',
      start_time: s.scheduled_at || s.start_time,
      reminder_minutes: s.reminder_minutes ?? 30,
      editable,
      source: s.source || (editable ? 'user' : 'admin')
    });
  });

  mergedWeek.forEach((day) => {
    day.events.sort((a, b) => {
      const aMs = new Date(a.start_time || 0).getTime();
      const bMs = new Date(b.start_time || 0).getTime();
      return aMs - bMs;
    });
  });

  return mergedWeek;
}

function renderWeeklyView(container, weekData, schedules) {
  const today = formatLocalDate(new Date());
  const merged = mergeWeeklyAndUserSchedules(weekData, schedules);

  container.classList.add('weekly-list');
  container.style.display = 'flex';
  container.style.width = '100%';

  let html = '';
  merged.forEach((day) => {
    const isToday = day.date === today;
    const dayClass = isToday ? 'week-row is-today' : 'week-row';
    html += `<div class="${dayClass}">`;
    html += `
      <div class="week-header">
        <span>${day.dayOfWeek}</span>
        <span class="week-date">${formatDate(day.date)}</span>
      </div>
    `;

    html += '<div class="week-events">';
    if (!day.events.length) {
      html += '<div class="event none">予定なし</div>';
    } else {
      day.events.forEach((event) => {
        html += renderEventCard(event);
      });
    }
    html += '</div></div>';
  });

  container.innerHTML = html;
  window.dispatchEvent(new CustomEvent('schedule:rendered', { detail: { mode: 'week' } }));
}

function renderEventCard(event) {
  if (event.__kind === 'user_schedule') {
    const startTime = new Date(event.start_time);
    const timeStr = Number.isFinite(startTime.getTime())
      ? startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '日時未定';
    const readonly = !event.editable;
    const safeUrl = toSafeHttpUrl(event.url);
    return `
      <article class="event user-schedule has-link ${readonly ? 'readonly' : ''}" data-user-url="${safeUrl ? encodeURIComponent(safeUrl) : ''}">
        ${event.thumbnail_url ? `<div class="event-thumb"><img src="${escapeHtml(event.thumbnail_url)}" alt="${escapeHtml(event.title || '')}" loading="lazy" referrerpolicy="no-referrer"></div>` : ''}
        <div class="event-info">
          <div class="schedule-item-head">
            <div class="event-time">
              <span>${timeStr}</span>
            </div>
            
            ${readonly ? '' : `<button class="schedule-edit-btn" type="button" data-schedule-edit="${event.schedule_id}"><i class="fa-regular fa-pen-to-square"></i></button>`}
          </div>
          
          <div class="schedule-note">${escapeHtml(event.title || '')}</div>
        </div>
      </article>
    `;
  }

  const eventType = event.event_type === 'video' ? 'video' : 'live';
  const url = event.url || '#';
  const thumbnail = event.thumbnail_url || '';
  let statusBadge = '';
  if (event.event_type === 'memo') {
    // メモは専用デザインで表示（リンクなし・時刻なし）
    return `
      <div class="event memo">
        <div class="event-info">
          <div>${escapeHtml(event.title).replace(/&lt;br&gt;/gi, '<br>')}</div>
          ${event.description ? `<div class="schedule-note">${escapeHtml(event.description)}</div>` : ''}
        </div>
      </div>
    `;
  }
  if (event.event_type === 'live') statusBadge = '<span class="event-status-badge live">【配信】</span>';
  else if (event.event_type === 'video') statusBadge = '<span class="event-status-badge video">【動画】</span>';
  else if (event.event_type === 'voice') statusBadge = '<span class="event-status-badge voice">【ボイス】</span>';
  else if (event.event_type === '1on1') statusBadge = '<span class="event-status-badge 1on1">【1on1】</span>';
  else statusBadge = '<span class="event-status-badge other">【その他】</span>';

  let timeDisplay = '';
  if (event.start_time) {
    const start = new Date(event.start_time);
    const now = new Date();
    const timeStr = start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (start > now && (event.confirmed === null || event.confirmed === false)) {
      timeDisplay = `${timeStr} <span class="unconfirmed-badge">未定</span>`;
    } else {
      timeDisplay = timeStr;
    }
  } else {
    timeDisplay = '<span class="unconfirmed-badge">日時未定</span>';
  }

  const safeAdminUrl = toSafeHttpUrl(url);
  return `
    <article class="event ${eventType}${safeAdminUrl ? ' has-link' : ''}" ${safeAdminUrl ? `data-event-url="${encodeURIComponent(safeAdminUrl)}"` : ''}>
      ${thumbnail ? `<div class="event-thumb"><img src="${thumbnail}" alt="${escapeHtml(event.title)}" loading="lazy" referrerpolicy="no-referrer"></div>` : ''}
      <div class="event-info">
        <div class="event-time">${statusBadge} ${timeDisplay}</div>
        <div class="event-title">${escapeHtml(event.title)}</div>
      </div>
    </article>
  `;
}

function getUserScheduleById(scheduleId) {
  return currentUserSchedules.find((s) => String(s.id) === String(scheduleId));
}

function ensureScheduleModal() {
  let modal = document.getElementById('user-schedule-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'user-schedule-modal';
  modal.className = 'user-schedule-modal';
  modal.innerHTML = `
    <div class="overlay" data-close-modal="1"></div>
    <div class="content">
      <h3 class="title" id="usm-title">予定を追加</h3>
      <form id="usm-form">
        <div class="grid">
          <label class="field field-wide">
            <span>タイトル</span>
            <input type="text" id="usm-event-title" maxlength="120" required>
          </label>
          <label class="field">
            <span>日時</span>
            <input type="datetime-local" id="usm-event-time" required>
          </label>
          <label class="field">
            <span>通知(分前)</span>
            <select id="usm-reminder">
              <option value="60">60分前</option>
              <option value="30">30分前</option>
              <option value="10">10分前</option>
              <option value="5">5分前</option>
              <option value="3">3分前</option>
            </select>
          </label>
          <label class="field field-wide">
            <span>URL</span>
            <input type="url" id="usm-url" maxlength="500" placeholder="https://...">
          </label>
          <label class="field field-wide">
            <span>サムネURL</span>
            <input type="url" id="usm-thumbnail-url" maxlength="500" placeholder="https://...">
          </label>
          <div class="field field-wide">
            <span style="font-size:0.85em;color:#555;">候補サムネ</span>
            <div id="usm-thumb-picker" class="usm-thumb-picker"></div>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn danger" id="usm-delete" style="display:none;">削除</button>
          <button type="button" class="btn sub" data-close-modal="1">キャンセル</button>
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openScheduleModal(mode, schedule) {
  const user = window.__authUser;
  if (!user) {
    alert('ログイン後に編集できます。');
    return;
  }

  const modal = ensureScheduleModal();
  const form = modal.querySelector('#usm-form');
  const titleEl = modal.querySelector('#usm-event-title');
  const timeEl = modal.querySelector('#usm-event-time');
  const reminderEl = modal.querySelector('#usm-reminder');
  const urlEl = modal.querySelector('#usm-url');
  const thumbnailUrlEl = modal.querySelector('#usm-thumbnail-url');
  const deleteBtn = modal.querySelector('#usm-delete');
  const headerTitle = modal.querySelector('#usm-title');

  headerTitle.textContent = mode === 'edit' ? '予定を編集' : '予定を追加';
  deleteBtn.style.display = mode === 'edit' ? 'inline-block' : 'none';

  form.dataset.mode = mode;
  form.dataset.id = schedule?.id ? String(schedule.id) : '';
  titleEl.value = schedule?.title || '';
  timeEl.value = schedule?.scheduled_at ? toLocalDatetimeValue(schedule.scheduled_at) : '';
  reminderEl.value = String(schedule?.reminder_minutes ?? 30);
  urlEl.value = schedule?.url || '';
  thumbnailUrlEl.value = schedule?.thumbnail_url || '';

  // サムネピッカー初期化
  ensureUsmThumbPickerStyle();
  const thumbPickerEl = modal.querySelector('#usm-thumb-picker');
  if (thumbPickerEl) {
    thumbPickerEl.innerHTML = USM_THUMBNAILS.map((thumbUrl) =>
      `<div class="usm-thumb-item${thumbnailUrlEl.value === thumbUrl ? ' selected' : ''}" data-url="${thumbUrl}">` +
      `<img src="${thumbUrl}" alt="thumbnail" loading="lazy"></div>`
    ).join('');

    // クリックで選択
    thumbPickerEl.onclick = (e) => {
      const item = e.target.closest('.usm-thumb-item');
      if (!item) return;
      thumbPickerEl.querySelectorAll('.usm-thumb-item').forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
      thumbnailUrlEl.value = item.dataset.url || '';
    };

    // テキスト入力と連動
    thumbnailUrlEl.addEventListener('input', () => {
      const val = thumbnailUrlEl.value.trim();
      thumbPickerEl.querySelectorAll('.usm-thumb-item').forEach((el) => {
        el.classList.toggle('selected', el.dataset.url === val);
      });
    });
  }

  const open = () => {
    modal.classList.add('is-open');
    modal.style.display = 'flex';
  };
  const closeHard = () => {
    modal.classList.remove('is-open');
    modal.style.display = 'none';
  };
  modal.querySelectorAll('[data-close-modal="1"]').forEach((el) => {
    el.onclick = closeHard;
  });

  deleteBtn.onclick = async () => {
    if (mode !== 'edit') return;
    if (!window.confirm('この予定を削除しますか？')) return;
    try {
      const res = await fetch(`/api/user/schedules/${form.dataset.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '削除に失敗しました');
      }
      closeHard();
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
      await loadWeeklySchedule('weekly-schedule', targetDate);
    } catch (e) {
      alert(e.message || '削除に失敗しました');
    }
  };

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const dt = new Date(timeEl.value);
      if (!Number.isFinite(dt.getTime())) {
        alert('日時を正しく入力してください。');
        return;
      }
      const payload = {
        title: titleEl.value.trim(),
        scheduled_at: dt.toISOString(),
        reminder_minutes: Number(reminderEl.value || 30),
        url: urlEl.value.trim() || null,
        thumbnail_url: thumbnailUrlEl.value.trim() || null
      };
      if (!payload.title) {
        alert('タイトルは必須です。');
        return;
      }

      const isEdit = mode === 'edit';
      const url = isEdit ? `/api/user/schedules/${form.dataset.id}` : '/api/user/schedules';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '保存に失敗しました');
      }
      closeHard();
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
      await loadWeeklySchedule('weekly-schedule', targetDate);
    } catch (e) {
      alert(e.message || '保存に失敗しました');
    }
  };

  open();
}

// =====================
// イベントポップアップ
// =====================

let _popupCurrentCard = null;

function closeEventPopup() {
  const existing = document.getElementById('event-popup');
  const overlay = document.getElementById('event-popup-overlay');
  if (existing) {
    existing.classList.add('closing');
    existing.addEventListener('animationend', () => existing.remove(), { once: true });
  }
  if (overlay) overlay.remove();
  if (_popupCurrentCard) {
    _popupCurrentCard.classList.remove('is-expanded');
    _popupCurrentCard = null;
  }
}

function openEventPopup(card) {
  // 既存を閉じる
  closeEventPopup();

  const rawAdmin = card.getAttribute('data-event-url');
  const rawUser = card.getAttribute('data-user-url');
  const url = rawAdmin ? decodeURIComponent(rawAdmin) : rawUser ? decodeURIComponent(rawUser) : '';

  // カード内からデータを読み取る
  const thumbEl = card.querySelector('.event-thumb img');
  const timeEl = card.querySelector('.event-time');
  const titleEl = card.querySelector('.event-title');

  const thumbSrc = thumbEl ? thumbEl.src : '';
  const timeHTML = timeEl ? timeEl.innerHTML : '';
  const titleText = titleEl ? titleEl.textContent : '';

  // ポップアップHTML生成
  const popup = document.createElement('div');
  popup.id = 'event-popup';
  popup.innerHTML = `
    ${thumbSrc ? `<div class="popup-thumb"><img src="${thumbSrc}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : ''}
    <div class="popup-info">
      ${timeHTML ? `<div class="popup-time">${timeHTML}</div>` : ''}
      ${titleText ? `<div class="popup-title">${escapeHtml(titleText)}</div>` : ''}
    </div>
    ${url ? `<button class="popup-link-btn" type="button">リンクを開く <i class="fa-solid fa-arrow-up-right-from-square"></i></button>` : ''}
  `;

  // オーバーレイ（背景クリックで閉じる）
  const overlay = document.createElement('div');
  overlay.id = 'event-popup-overlay';
  overlay.addEventListener('click', closeEventPopup);

  document.body.appendChild(overlay);
  document.body.appendChild(popup);

  if (url) {
    popup.querySelector('.popup-link-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(url, '_blank', 'noopener');
      closeEventPopup();
    });
  }

  // 位置計算（カードのすぐ下、画面端補正あり）
  const rect = card.getBoundingClientRect();
  const popW = popup.offsetWidth || 280;
  const popH = popup.offsetHeight || 200;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 水平: カード中央揃え → 画面端で補正
  let left = rect.left + rect.width / 2 - popW / 2;
  left = Math.max(margin, Math.min(left, vw - popW - margin));

  // 垂直: カードの下 → 下に入らなければ上に
  let top = rect.bottom + 10;
  if (top + popH > vh - margin) {
    top = rect.top - popH - 10;
  }
  top = Math.max(margin, top);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  // 吹き出し三角をカード中央に合わせる
  const cardCenterX = rect.left + rect.width / 2;
  const arrowLeft = cardCenterX - left;
  popup.style.setProperty('--arrow-left', `${Math.max(16, Math.min(arrowLeft, popW - 16))}px`);

  card.classList.add('is-expanded');
  _popupCurrentCard = card;
}

function collapseAllEvents() {
  closeEventPopup();
}

function installScheduleControls() {
  const weekly = document.getElementById('weekly-schedule');
  if (!weekly || weekly.dataset.controlsInstalled === '1') return;
  weekly.dataset.controlsInstalled = '1';

  // 編集ボタン
  weekly.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-schedule-edit]');
    if (!btn) return;
    e.stopPropagation();
    const schedule = getUserScheduleById(btn.getAttribute('data-schedule-edit'));
    if (!schedule || schedule.editable === false) return;
    openScheduleModal('edit', schedule);
  });

  // イベントカードのクリック → ポップアップ表示
  weekly.addEventListener('click', (e) => {
    if (e.target.closest('[data-schedule-edit]')) return;

    const card = e.target.closest('.event.has-link[data-event-url], .event.user-schedule[data-user-url]');
    if (!card) return;
    e.stopPropagation();

    if (card.classList.contains('is-expanded')) {
      closeEventPopup();
    } else {
      openEventPopup(card);
    }
  });

  // 月間表示の日付クリック → その週の週間表示へ
  weekly.addEventListener('click', (e) => {
    // 月間表示でなければ無視
    if (currentViewMode !== 'month') return;

    const cell = e.target.closest('[data-week-date]');
    if (!cell) return;
    // イベントカードのクリックは委譲先に任せる
    if (e.target.closest('.event')) return;
    e.stopPropagation();

    const dateStr = cell.getAttribute('data-week-date');
    if (!dateStr) return;

    const clickedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // クリックした日が属する月曜日を求める
    const dow = clickedDate.getDay();
    const mondayOfClicked = new Date(clickedDate);
    mondayOfClicked.setDate(clickedDate.getDate() - (dow === 0 ? 6 : dow - 1));

    // 今週の月曜日を求める
    const todayDow = today.getDay();
    const mondayOfToday = new Date(today);
    mondayOfToday.setDate(today.getDate() - (todayDow === 0 ? 6 : todayDow - 1));

    // 何週分ずれているか
    const weekDiffMs = mondayOfClicked.getTime() - mondayOfToday.getTime();
    currentWeekOffset = Math.round(weekDiffMs / (1000 * 60 * 60 * 24 * 7));

    // ビューを週間に切り替え
    currentViewMode = 'week';
    const weekBtn = document.getElementById('view-btn-week');
    const monthBtn = document.getElementById('view-btn-month');
    if (weekBtn) weekBtn.classList.add('is-active');
    if (monthBtn) monthBtn.classList.remove('is-active');
    const addBtn = document.getElementById('week-add-user-schedule');
    if (addBtn) addBtn.style.display = 'inline-block';

    loadWeeklySchedule('weekly-schedule', clickedDate);
  });

  const addBtn = document.getElementById('week-add-user-schedule');
  if (addBtn && addBtn.dataset.bound !== '1') {
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', () => {
      openScheduleModal('add', null);
    });
  }
}

function toggleAddButton(isLoggedIn) {
  const addBtn = document.getElementById('week-add-user-schedule');
  if (!addBtn) return;
  addBtn.style.display = 'inline-block';
  addBtn.title = isLoggedIn ? '予定を追加' : 'ログインして予定を追加';
}

function navigateWeek(direction) {
  currentWeekOffset += direction;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
  loadWeeklySchedule('weekly-schedule', targetDate);
}

// ビューモードに応じた汎用ナビゲーション（index.php から呼ばれる）
function navigateSchedule(direction) {
  if (currentViewMode === 'month') {
    navigateMonth(direction);
  } else {
    navigateWeek(direction);
  }
}

// 週間 / 月間 切り替え
function switchViewMode(mode) {
  if (currentViewMode === mode) return;
  currentViewMode = mode;

  const weekBtn = document.getElementById('view-btn-week');
  const monthBtn = document.getElementById('view-btn-month');
  if (weekBtn) weekBtn.classList.toggle('is-active', mode === 'week');
  if (monthBtn) monthBtn.classList.toggle('is-active', mode === 'month');

  // 「+」ボタンは週間のみ表示
  const addBtn = document.getElementById('week-add-user-schedule');
  if (addBtn) addBtn.style.display = mode === 'week' ? 'inline-block' : 'none';

  // 週間モードに戻る場合はオフセットをリセット
  if (mode === 'week') {
    currentWeekOffset = 0;
    loadWeeklySchedule('weekly-schedule');
  } else {
    currentMonthOffset = 0;
    loadMonthlySchedule('weekly-schedule');
  }
}

// 現在の週/月ラベルを更新
function updateCurrentLabel() {
  const el = document.getElementById('week-current-label');
  const monthLabel = document.getElementById('schedule-month-label');
  if (currentViewMode === 'month') {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + currentMonthOffset);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (el) el.textContent = `${y}年${m}月`;
    if (monthLabel) {
      monthLabel.textContent = `${y}年${m}月`;
      monthLabel.style.display = 'block';
    }
  } else {
    const d = new Date();
    d.setDate(d.getDate() + currentWeekOffset * 7);
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - dow + (dow === 0 ? -6 : 1));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (x) => `${x.getMonth() + 1}/${x.getDate()}`;
    if (el) el.textContent = `${fmt(mon)}〜${fmt(sun)}`;
    if (monthLabel) {
      monthLabel.textContent = '';
      monthLabel.style.display = 'none';
    }
  }
}

// 月を移動
function navigateMonth(direction) {
  currentMonthOffset += direction;
  loadMonthlySchedule('weekly-schedule');
}

function resetToCurrentWeek() {
  currentWeekOffset = 0;
  currentMonthOffset = 0;
  currentViewMode = 'week';
  loadWeeklySchedule('weekly-schedule');
}

function enableAutoReload(intervalMinutes = 5) {
  setInterval(() => {
    if (currentViewMode === 'month') {
      loadMonthlySchedule('weekly-schedule');
    } else {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
      loadWeeklySchedule('weekly-schedule', targetDate);
    }
  }, intervalMinutes * 60 * 1000);
}

function addRssFeedLink() {
  const link = document.createElement('link');
  link.rel = 'alternate';
  link.type = 'application/rss+xml';
  link.title = 'まいちゃん予定表 RSS';
  link.href = '/api/events/rss';
  document.head.appendChild(link);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addRssFeedLink);
} else {
  addRssFeedLink();
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add("schedule-ready");
});

function renderWeeklyMessage(weekMessage) {
  const messageEl = document.getElementById('weekly-message');
  if (!messageEl) return;
  if (!weekMessage || !weekMessage.message) {
    messageEl.classList.add('is-empty');
    messageEl.innerHTML = '';
    return;
  }
  messageEl.classList.remove('is-empty');
  messageEl.innerHTML = `
    <div class="weekly-message-bg" aria-hidden="true"></div>
    <div class="weekly-message-inner">
      <span class="message">${escapeHtml(weekMessage.message)}</span>
    </div>
  `;
}

// =============================================
// 月間スケジュール
// =============================================

async function loadMonthlySchedule(containerId = 'weekly-schedule') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // 対象月の計算
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + currentMonthOffset);
  const year = base.getFullYear();
  const month = base.getMonth(); // 0-indexed

  // 月の最初の日・最後の日
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // 表示する最初の月曜日を計算（月初を含む週の月曜）
  const startDow = firstDay.getDay(); // 0=日
  const calStart = new Date(firstDay);
  calStart.setDate(1 - (startDow === 0 ? 6 : startDow - 1));

  // 表示する最後の日曜日（月末を含む週の日曜）
  const endDow = lastDay.getDay();
  const calEnd = new Date(lastDay);
  calEnd.setDate(lastDay.getDate() + (endDow === 0 ? 0 : 7 - endDow));

  // 週ごとに代表日を収集
  const weekDates = [];
  const cur = new Date(calStart);
  while (cur <= calEnd) {
    weekDates.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }

  // スケルトン表示
  container.classList.add('weekly-list');
  container.classList.remove('monthly-grid');
  container.style.display = 'block';
  container.style.width = '100%';
  container.innerHTML = `<div style="text-align:center;padding:20px;color:#bbb;">読み込み中...</div>`;

  updateCurrentLabel();

  try {
    // 各週のデータを並列取得
    const weeklyResults = await Promise.all(
      weekDates.map(async (weekMon) => {
        const dateStr = formatLocalDate(weekMon);
        const res = await fetch(`/api/events/weekly?date=${dateStr}`);
        if (!res.ok) return null;
        return res.json();
      })
    );

    const user = await waitAuthResolved();
    let schedules = [];
    if (user) {
      const schRes = await fetch('/api/user/schedules', { credentials: 'include' });
      if (schRes.ok) schedules = await schRes.json();
    }

    currentUserSchedules = schedules || [];

    // 全週のデータを date -> events にまとめる
    const allDays = new Map();
    for (const result of weeklyResults) {
      if (!result || !result.week) continue;
      for (const day of result.week) {
        if (!allDays.has(day.date)) allDays.set(day.date, day);
      }
    }

    renderMonthlyView(container, allDays, schedules, year, month, calStart, calEnd);
    renderWeeklyMessage(null); // 月間ではメッセージを非表示
    installScheduleControls();
    toggleAddButton(false); // 月間では追加ボタン非表示

  } catch (error) {
    console.error('Error loading monthly schedule:', error);
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#e53935;">エラーが発生しました</div>';
  }
}

function renderMonthlyView(container, allDays, schedules, year, month, calStart, calEnd) {
  const todayStr = formatLocalDate(new Date());
  const targetMonth = month; // 0-indexed

  // ユーザースケジュールを date -> events にまとめる
  const userByDate = new Map();
  (schedules || []).forEach((s) => {
    const dt = new Date(s.scheduled_at || s.start_time || '');
    if (!Number.isFinite(dt.getTime())) return;
    const key = formatLocalDate(dt);
    if (!userByDate.has(key)) userByDate.set(key, []);
    userByDate.get(key).push({
      __kind: 'user_schedule',
      schedule_id: s.id,
      title: s.title || s.event_title || 'マイスケジュール',
      note: s.note || '',
      url: s.url || '',
      thumbnail_url: s.thumbnail_url || '',
      start_time: s.scheduled_at || s.start_time,
      reminder_minutes: s.reminder_minutes ?? 30,
      editable: Boolean(s.editable),
      source: s.source || (s.editable ? 'user' : 'admin')
    });
  });

  // 曜日ヘッダー（日〜土）
  const DOW_JP = ['日', '月', '火', '水', '木', '金', '土'];
  let html = '<div class="monthly-grid">';
  html += '<div class="month-dow-header">';
  for (const d of DOW_JP) html += `<div class="month-dow-cell">${d}</div>`;
  html += '</div>';

  // 週ごとに行を生成
  const cur = new Date(calStart);
  while (cur <= calEnd) {
    html += '<div class="month-week-row">';
    for (let i = 0; i < 7; i++) {
      const cellDate = new Date(cur);
      const dateStr = formatLocalDate(cellDate);
      const isCurrentMonth = cellDate.getMonth() === targetMonth;
      const isToday = dateStr === todayStr;
      const dow = cellDate.getDay();

      let cellClass = 'month-day-cell';
      if (isToday) cellClass += ' is-today';
      if (!isCurrentMonth) cellClass += ' out-of-month';

      let numClass = 'month-day-num';
      if (dow === 0) numClass += ' is-sunday';
      if (dow === 6) numClass += ' is-saturday';
      if (isToday) numClass += ' is-today-num';

      html += `<div class="${cellClass}" data-week-date="${dateStr}">`;
      html += `<div class="${numClass}">${cellDate.getDate()}</div>`;
      html += '<div class="week-events">';

      // 管理者イベント
      const dayData = allDays.get(dateStr);
      if (dayData && dayData.events && dayData.events.length) {
        for (const ev of dayData.events) {
          html += renderEventCard({ ...ev, __kind: 'admin_event' });
        }
      }
      // ユーザースケジュール
      const userEvs = userByDate.get(dateStr) || [];
      for (const ev of userEvs) html += renderEventCard(ev);

      html += '</div>'; // .week-events
      html += '</div>'; // .month-day-cell

      cur.setDate(cur.getDate() + 1);
    }
    html += '</div>'; // .month-week-row
  }
  html += '</div>'; // .monthly-grid

  container.classList.remove('weekly-list');
  container.style.display = 'block';
  container.innerHTML = html;
  window.dispatchEvent(new CustomEvent('schedule:rendered', { detail: { mode: 'month' } }));
}