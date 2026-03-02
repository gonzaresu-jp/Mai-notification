// count-days.js - デビュー日・誕生日・周年・推し日カウンター

/* =========================
 * 共通ユーティリティ
 * ========================= */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 時刻部分を切り捨てて日付のみのDateを返す */
function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** 経過日数（過去→現在）*/
function daysSince(date) {
  return Math.floor((stripTime(new Date()).getTime() - stripTime(date).getTime()) / MS_PER_DAY);
}

/** 2日付の差分（target - now）*/
function daysDiff(target, now = new Date()) {
  return Math.floor((stripTime(target).getTime() - stripTime(now).getTime()) / MS_PER_DAY);
}

/** 経過年・月を返す */
function yearsMonthsSince(date, now = new Date()) {
  const start = stripTime(date);
  const end   = stripTime(now);
  if (end < start) return { years: 0, months: 0 };

  let years  = end.getFullYear() - start.getFullYear();
  let months = end.getMonth()    - start.getMonth();
  if (end.getDate() < start.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years  < 0) return { years: 0, months: 0 };
  return { years, months };
}

/** "YYYY-MM-DD" 文字列をDateに変換（不正値はnull）*/
function parseYMD(ymd) {
  if (!ymd) return null;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}


/* =========================
 * デビュー日・誕生日・周年カウント
 * ========================= */
(() => {
  const DEBUT_DATE  = new Date(2021, 2, 21);
  const BIRTHDAY    = { month: 0, day: 7  };
  const ANNIVERSARY = { month: 2, day: 21 };
  const UPDATE_INTERVAL = 60 * 1000;

  function nextOccurrence(monthZeroBased, day) {
    const now     = new Date();
    let candidate = new Date(now.getFullYear(), monthZeroBased, day, 0, 0, 0, 0);
    if (stripTime(candidate) < stripTime(now)) {
      candidate = new Date(now.getFullYear() + 1, monthZeroBased, day, 0, 0, 0, 0);
    }
    return candidate;
  }

  function setValue(id, value, sinceDate) {
    const el = document.getElementById(id);
    if (!el) return;
    if (sinceDate) {
      const { years, months } = yearsMonthsSince(sinceDate);
      el.textContent = `${value}日(${years}年${months}ヶ月)`;
    } else {
      el.textContent = `${value} 日`;
    }
  }

  function updateAll() {
    const now = new Date();
    setValue('days-since-debut',    Math.max(0, daysSince(DEBUT_DATE)), DEBUT_DATE);
    setValue('days-to-birthday',    daysDiff(nextOccurrence(BIRTHDAY.month,    BIRTHDAY.day),    now));
    setValue('days-to-anniversary', daysDiff(nextOccurrence(ANNIVERSARY.month, ANNIVERSARY.day), now));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateAll();
      setInterval(updateAll, UPDATE_INTERVAL);
    });
  } else {
    updateAll();
    setInterval(updateAll, UPDATE_INTERVAL);
  }
})();


/* =========================
 * 推し始めた日カウント
 * ========================= */
function initOshiDays() {
  const STORAGE_KEY = 'maistart_date';

  const dateInput    = document.getElementById('start');         // header内
  const meetValueEl  = document.getElementById('days-to-meet'); // main内
  const meetStatItem = meetValueEl?.closest('.stat-item');

  if (!meetValueEl || !meetStatItem) return;

  // header の遅延読み込みに対応して再試行
  if (!dateInput) {
    const retry = (window.__oshiDaysRetryCount || 0) + 1;
    window.__oshiDaysRetryCount = retry;
    if (retry <= 20) setTimeout(initOshiDays, 50);
    return;
  }

  // 多重登録防止
  if (dateInput.dataset.boundOshiDays === '1') {
    loadAndApply();
    return;
  }
  dateInput.dataset.boundOshiDays = '1';

  function loadAndApply() {
    const effective = localStorage.getItem(STORAGE_KEY) || dateInput.value || null;

    if (!effective) {
      meetStatItem.style.display = 'none';
      meetValueEl.textContent    = '0 日';
      return;
    }

    const parsed = parseYMD(effective);
    if (!parsed) { meetStatItem.style.display = 'none'; return; }

    const { years, months } = yearsMonthsSince(parsed);
    meetValueEl.textContent    = `${Math.max(0, daysSince(parsed))}日(${years}年${months}ヶ月)`;
    meetStatItem.style.display = '';
    if (dateInput.value !== effective) dateInput.value = effective;
  }

  function saveDate(value) {
    if (!value) localStorage.removeItem(STORAGE_KEY);
    else        localStorage.setItem(STORAGE_KEY, value);
    loadAndApply();
  }

  loadAndApply();
  dateInput.addEventListener('change', e => saveDate(e.target.value));

  const saveBtn = document.getElementById('subscriber-name-submit');
  if (saveBtn && !saveBtn.dataset.boundOshiDays) {
    saveBtn.dataset.boundOshiDays = '1';
    saveBtn.addEventListener('click', () => saveDate(dateInput.value));
  }

  setInterval(loadAndApply, 60 * 1000); // 日付跨ぎ対策
}

initOshiDays();