// ============================================
// フロントエンド用: 週間予定表表示スクリプト
// 管理者予定 + ユーザー予定(編集可)を混在表示
// ============================================

let currentWeekOffset = 0;
let currentWeekData = [];
let currentUserSchedules = [];

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

async function loadWeeklySchedule(containerId = 'weekly-schedule', targetDate = new Date()) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:30px;color:#999;">読み込み中...</div>';

  try {
    const dateStr = formatLocalDate(targetDate);
    const weekRes = await fetch(`/api/events/weekly?date=${dateStr}`);
    if (!weekRes.ok) throw new Error('Failed to fetch weekly events');
    const weekly = await weekRes.json();

    const user = await waitAuthResolved();
    let schedules = [];
    if (user) {
      const schRes = await fetch('/api/user/schedules', { credentials: 'include' });
      if (schRes.ok) schedules = await schRes.json();
    }

    currentWeekData = weekly.week || [];
    currentUserSchedules = schedules || [];

    renderWeeklyView(container, currentWeekData, currentUserSchedules);
    renderWeeklyMessage(weekly.weekMessage);
    installScheduleControls();
    toggleAddButton(Boolean(user));
  } catch (error) {
    console.error('Error loading weekly schedule:', error);
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#e53935;">エラーが発生しました</div>';
    renderWeeklyMessage(null);
    toggleAddButton(false);
  }
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
  if (typeof window.update === 'function') setTimeout(window.update, 50);
}

function renderEventCard(event) {
  if (event.__kind === 'user_schedule') {
    const startTime = new Date(event.start_time);
    const timeStr = Number.isFinite(startTime.getTime())
      ? startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '日時未定';
    const readonly = !event.editable;
    return `
      <article class="event user-schedule ${readonly ? 'readonly' : ''} ${event.url ? 'has-link' : ''}" ${event.url ? `data-user-url="${escapeHtml(event.url)}"` : ''}>
        ${event.thumbnail_url ? `<div class="event-thumb"><img src="${escapeHtml(event.thumbnail_url)}" alt="${escapeHtml(event.title || '')}" loading="lazy"></div>` : ''}
        <div class="event-info">
          <div class="schedule-item-head">
            <div class="event-title">${escapeHtml(event.title || '')}</div>
            ${readonly ? '' : `<button class="schedule-edit-btn" type="button" data-schedule-edit="${event.schedule_id}"><i class="fa-regular fa-pen-to-square"></i></button>`}
          </div>
          <div class="event-time">
            <span>${timeStr}</span>
          </div>
          ${event.note ? `<div class="schedule-note">${escapeHtml(event.note)}</div>` : ''}
        </div>
      </article>
    `;
  }

  const eventType = event.event_type === 'video' ? 'video' : 'live';
  const url = event.url || '#';
  const thumbnail = event.thumbnail_url || '';
  let statusBadge = '';
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

  return `
    <a href="${url}" class="event ${eventType}" target="_blank" rel="noopener">
      ${thumbnail ? `<div class="event-thumb"><img src="${thumbnail}" alt="${escapeHtml(event.title)}" loading="lazy"></div>` : ''}
      <div class="event-info">
        <div class="event-time">${statusBadge} ${timeDisplay}</div>
        <div class="event-title">${escapeHtml(event.title)}</div>
      </div>
    </a>
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
            <span>テキスト</span>
            <input type="text" id="usm-note" maxlength="200">
          </label>
          <label class="field field-wide">
            <span>URL</span>
            <input type="url" id="usm-url" maxlength="500" placeholder="https://...">
          </label>
          <label class="field field-wide">
            <span>サムネURL</span>
            <input type="url" id="usm-thumbnail-url" maxlength="500" placeholder="https://...">
          </label>
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
  const noteEl = modal.querySelector('#usm-note');
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
  noteEl.value = schedule?.note || '';
  urlEl.value = schedule?.url || '';
  thumbnailUrlEl.value = schedule?.thumbnail_url || '';

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
        text: noteEl.value.trim() || null,
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

function installScheduleControls() {
  const weekly = document.getElementById('weekly-schedule');
  if (!weekly || weekly.dataset.controlsInstalled === '1') return;
  weekly.dataset.controlsInstalled = '1';

  weekly.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-schedule-edit]');
    if (!btn) return;
    const schedule = getUserScheduleById(btn.getAttribute('data-schedule-edit'));
    if (!schedule || schedule.editable === false) return;
    openScheduleModal('edit', schedule);
  });

  weekly.addEventListener('click', (e) => {
    if (e.target.closest('[data-schedule-edit]')) return;
    const card = e.target.closest('.event.user-schedule.has-link[data-user-url]');
    if (!card) return;
    const url = card.getAttribute('data-user-url');
    if (!url) return;
    window.open(url, '_blank', 'noopener');
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

function resetToCurrentWeek() {
  currentWeekOffset = 0;
  loadWeeklySchedule('weekly-schedule');
}

function enableAutoReload(intervalMinutes = 5) {
  setInterval(() => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
    loadWeeklySchedule('weekly-schedule', targetDate);
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

function renderWeeklyMessage(weekMessage) {
  const messageEl = document.getElementById('weekly-message');
  if (!messageEl) return;
  if (!weekMessage || !weekMessage.message) {
    messageEl.innerHTML = '';
    return;
  }
  messageEl.innerHTML = `<span class="message">${escapeHtml(weekMessage.message)}</span>`;
}
