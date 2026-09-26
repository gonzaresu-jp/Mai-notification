
function initOshiDays() {
  const STORAGE_KEY = "maistart_date";
  const DEFAULT_DATE = "2020-01-07";
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const dateInput = document.getElementById("start");              // header内
  const meetValueEl = document.getElementById("days-to-meet");     // main内
  const meetStatItem = meetValueEl?.closest(".stat-item");

  if (!meetValueEl || !meetStatItem) return; // 表示側がないなら何もしない
  if (!dateInput) return;                    // headerが未挿入なら何もしない（待つ側で保証する）

  function parseYMD(ymd) {
    if (!ymd) return null;
    const parts = ymd.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  function daysSinceLocal(date) {
    const now = stripTime(new Date()).getTime();
    const then = stripTime(date).getTime();
    return Math.max(0, Math.floor((now - then) / MS_PER_DAY));
  }

  function loadAndApply() {
    const stored = localStorage.getItem(STORAGE_KEY);
    let effective = stored || dateInput.value || null;

    // DEFAULT_DATE を「未設定扱い」
    if (!effective || effective === DEFAULT_DATE) {
      meetStatItem.style.display = "none";
      meetValueEl.textContent = "0 日";
      if (!stored) dateInput.value = "";
      return;
    }

    const parsed = parseYMD(effective);
    if (!parsed) {
      meetStatItem.style.display = "none";
      return;
    }

    const since = daysSinceLocal(parsed);
    meetValueEl.textContent = `${since} 日`;
    meetStatItem.style.display = "";
    if (dateInput.value !== effective) dateInput.value = effective;
  }

  function saveDate(value) {
    if (!value || value === DEFAULT_DATE) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
    loadAndApply();
  }

  // 多重登録防止
  if (dateInput.dataset.boundOshiDays === "1") {
    loadAndApply();
    return;
  }
  dateInput.dataset.boundOshiDays = "1";

  loadAndApply();
  dateInput.addEventListener("change", (e) => saveDate(e.target.value));

  // 「保存」ボタン（ユーザー名保存と共用）でも保存したいなら
  const saveBtn = document.getElementById("subscriber-name-submit");
  if (saveBtn && !saveBtn.dataset.boundOshiDays) {
    saveBtn.dataset.boundOshiDays = "1";
    saveBtn.addEventListener("click", () => saveDate(dateInput.value));
  }

  // 日付跨ぎ対策
  setInterval(loadAndApply, 60 * 1000);
}


(async () => {
  const load = async (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    const res = await fetch(url, { cache: 'no-cache' });
    el.innerHTML = await res.text();
  };

  await load('header-slot', '/header.php');
  initOshiDays();               // ← ここが重要：header 注入後に初期化
  await load('footer-slot', '/footer.php');
})();
