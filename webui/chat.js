(function () {
  const AVATAR = "./icon-192.webp";
  const log = document.getElementById("log");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const form = document.getElementById("composer");
  const suggest = document.getElementById("suggest");
  const r18Toggle = document.getElementById("r18Toggle");
  const headerSub = document.getElementById("headerSub");
  const newChatBtn = document.getElementById("newChat");
  const sessListEl = document.getElementById("sessList");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("scrim");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const prefsToggle = document.getElementById("prefsToggle");
  const prefsPanel = document.getElementById("prefsPanel");
  const prefsSave = document.getElementById("prefsSave");
  const prefsStatus = document.getElementById("prefsStatus");
  let busy = false;
  let currentSessionId = null;   // 現在のセッションID（null=未作成）
  let r18 = false;

  // ===== 質問履歴 (上矢印で復元用) =====
  const SENT_KEY = "mai_sent_questions";
  let sentQuestions = [];
  let sentIdx = -1;
  function loadSent() {
    try { sentQuestions = JSON.parse(localStorage.getItem(SENT_KEY) || "[]"); } catch { sentQuestions = []; }
    sentIdx = sentQuestions.length;
  }
  function saveSent(q) {
    if (!q.trim()) return;
    if (sentQuestions.length && sentQuestions[sentQuestions.length - 1] === q) return;
    sentQuestions.push(q);
    if (sentQuestions.length > 200) sentQuestions = sentQuestions.slice(-200);
    try { localStorage.setItem(SENT_KEY, JSON.stringify(sentQuestions)); } catch {}
    sentIdx = sentQuestions.length;
  }

  // ===== セッション管理 =====
  let sessions = [];      // [{id,title,r18,updated_at,preview,msg_count}]
  function closeSidebar() {
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
  }
  function openSidebar() {
    sidebar.classList.add("open");
    scrim.classList.add("show");
  }
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  scrim.addEventListener("click", closeSidebar);

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function safeUrl(u){ try{ const p=new URL(u, location.origin); return (p.protocol==="http:"||p.protocol==="https:")?p.href:""; }catch{ return ""; } }
  function fmtTime(utc){
    if (!utc) return "";
    const d = new Date(String(utc).replace(" ", "T") + "Z");
    if (isNaN(d)) return "";
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "たった今";
    if (min < 60) return min + "分前";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "時間前";
    return Math.floor(hr / 24) + "日前";
  }

  async function loadSessions(keepId) {
    try {
      const r = await fetch("/api/admin/chat/sessions", { credentials: "include" });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
      if (!r.ok) return;
      const j = await r.json();
      sessions = j.sessions || [];
      renderSessions();
    } catch (e) { console.warn("sessions load failed", e); }
  }

  function renderSessions() {
    if (!sessions.length) {
      sessListEl.innerHTML = `<div class="sess-empty">まだセッションがないよ<br>「＋ 新しいチャット」から始めてね</div>`;
      return;
    }
    sessListEl.innerHTML = "";
    for (const s of sessions) {
      const item = document.createElement("button");
      item.className = "sess-item" + (s.id === currentSessionId ? " active" : "");
      item.innerHTML =
        `<span class="sess-del" title="このセッションを削除">🗑</span>` +
        `<div class="sess-title">${esc(s.title)}</div>` +
        `<div class="sess-prev">${esc(s.preview || "（会話がまだありません）")} · ${fmtTime(s.updated_at)}</div>`;
      const del = item.querySelector(".sess-del");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSession(s.id);
      });
      item.addEventListener("click", () => loadSession(s.id));
      sessListEl.appendChild(item);
    }
  }

  async function createSession(messages) {
    const r = await fetch("/api/admin/chat/sessions", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ r18: r18 ? true : false, messages: messages || [] })
    });
    if (r.status === 401) { location.href = "/admin/login.html"; return null; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return null;
    return j.id;
  }

  async function deleteSession(id) {
    if (!confirm("このセッションを削除しますか？")) return;
    try {
      const r = await fetch("/api/admin/chat/sessions/" + id, {
        method: "DELETE", credentials: "include"
      });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
    } catch (e) { console.warn("delete failed", e); }
    if (currentSessionId === id) {
      currentSessionId = null;
      log.innerHTML = "";
      showWelcome();
    }
    await loadSessions();
  }

  async function newSession() {
    const id = await createSession();
    if (!id) return;
    currentSessionId = id;
    log.innerHTML = "";
    showWelcome();
    await loadSessions();
    if (r18) loadSessionPrefs();
    closeSidebar();
    input.focus();
  }
  newChatBtn.addEventListener("click", newSession);

  async function loadSession(id) {
    try {
      const r = await fetch("/api/admin/chat/sessions/" + id, { credentials: "include" });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
      if (!r.ok) return;
      const j = await r.json();
      currentSessionId = j.id;
      log.innerHTML = "";
      if (!j.messages || !j.messages.length) {
        showWelcome();
      } else {
        for (const m of j.messages) {
          if (m.role === "user") {
            addUser(m.content, true);
          } else {
            const b = addAI(true);
            renderAnswer(b, m.content, m.sources);
          }
        }
      }
      renderSessions();
      closeSidebar();
      scrollDown();
      if (r18) loadSessionPrefs();
    } catch (e) { console.warn("session load failed", e); }
  }

  // ===== R18モード: localStorage に保持 =====
  function initR18() {
    try { r18 = localStorage.getItem("mai_r18_mode") === "1"; } catch { r18 = false; }
    syncR18();
  }
  function syncR18() {
    r18Toggle.classList.toggle("on", r18);
    r18Toggle.setAttribute("aria-pressed", String(r18));
    headerSub.textContent = r18
      ? "🔞 大人のモード / だーりん、少し特殊な部屋で待機中…（18禁・フィクション）"
      : "恋の魔女 / だーりんの\u201cドキドキ\u201dを待っています";
    if (prefsToggle) {
      prefsToggle.classList.toggle("on", r18);
      prefsToggle.setAttribute("aria-pressed", String(r18));
    }
    if (!r18) {
      if (prefsPanel) prefsPanel.hidden = true;
      if (prefsToggle) prefsToggle.setAttribute("aria-pressed", "false");
    }
  }
  r18Toggle.addEventListener("click", () => {
    r18 = !r18;
    try { localStorage.setItem("mai_r18_mode", r18 ? "1" : "0"); } catch {}
    syncR18();
    if (r18) loadSessionPrefs();
  });

  // ===== だーりんのお願い・好み（R18） =====
  const prefEls = {
    likes: document.getElementById("prefLikes"),
    dislikes: document.getElementById("prefDislikes"),
    scene: document.getElementById("prefScene"),
    call: document.getElementById("prefCall"),
  };
  function splitTags(str) {
    return String(str || "").split(/[,、\n]/).map(t => t.trim()).filter(Boolean);
  }
  function prefsFromInputs() {
    return {
      likes: splitTags(prefEls.likes.value),
      dislikes: splitTags(prefEls.dislikes.value),
      scene: prefEls.scene.value.trim(),
      call: prefEls.call.value.trim(),
    };
  }
  async function loadSessionPrefs() {
    if (!currentSessionId || !prefEls.likes) return;
    try {
      const r = await fetch("/api/admin/chat/sessions/" + currentSessionId + "/prefs", { credentials: "include" });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
      if (!r.ok) return;
      const j = await r.json();
      const p = j.prefs || {};
      prefEls.likes.value = (p.likes || []).join(", ");
      prefEls.dislikes.value = (p.dislikes || []).join(", ");
      prefEls.scene.value = p.scene || "";
      prefEls.call.value = p.call || "";
    } catch (e) { console.warn("prefs load failed", e); }
  }
  async function saveSessionPrefs() {
    if (!currentSessionId) { showPrefsStatus("セッションを作ってから保存してね"); return; }
    try {
      const r = await fetch("/api/admin/chat/sessions/" + currentSessionId + "/prefs", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefsFromInputs())
      });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        showPrefsStatus("保存できなかったよ… " + (j.error || r.status));
        return;
      }
      showPrefsStatus("保存したよ ♡");
    } catch (e) { showPrefsStatus("通信エラー: " + e.message); }
  }
  function showPrefsStatus(msg) {
    if (!prefsStatus) return;
    prefsStatus.textContent = msg;
    clearTimeout(showPrefsStatus._t);
    showPrefsStatus._t = setTimeout(() => { prefsStatus.textContent = ""; }, 2500);
  }
  if (prefsToggle) {
    prefsToggle.addEventListener("click", () => {
      prefsPanel.hidden = !prefsPanel.hidden;
      if (!prefsPanel.hidden) loadSessionPrefs();
    });
  }
  if (prefsSave) prefsSave.addEventListener("click", saveSessionPrefs);

  function scrollDown(){ log.scrollTop = log.scrollHeight; }

  function addUser(text, fromLog){
    const el = document.createElement("div");
    el.className = "msg user";
    el.innerHTML = `<div class="bubble">${esc(text)}</div>`;
    log.appendChild(el); scrollDown();
  }
  function addAI(fromLog){
    const el = document.createElement("div");
    el.className = "msg ai";
    el.innerHTML = `<img class="ai-ava" src="${AVATAR}" alt="まい"><div class="bubble"></div>`;
    log.appendChild(el); scrollDown();
    return el.querySelector(".bubble");
  }
  function typing(bubble){
    bubble.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
  }
  function renderAnswer(bubble, answer, sources){
    let html = esc(answer || "（うまく答えられなかったみたい…ごめんね）");
    const list = (sources||[]).filter(s => s && s.title);
    if (list.length){
      const items = list.map(s => {
        const u = safeUrl(s.url);
        const t = esc(s.title);
        return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>` : t}</li>`;
      }).join("");
      html += `<details class="sources"><summary>参照 (${list.length})</summary><ul>${items}</ul></details>`;
    }
    bubble.innerHTML = html;
    scrollDown();
  }

  function showError(bubble, msg, question){
    bubble.innerHTML = esc(msg);
    const retry = document.createElement("button");
    retry.className = "retry-btn";
    retry.textContent = "🔄 もう一度試す";
    retry.addEventListener("click", () => {
      bubble.closest(".msg")?.remove();
      ask(question);
    });
    bubble.appendChild(retry);
    scrollDown();
  }

  // ===== 質問送信（サーバー側でセッションへ自動保存） =====
  async function ask(question){
    if (busy || !question.trim()) return;
    // 未作成なら先に新セッションを作成（タイトルは初回質問で自動生成される）
    if (!currentSessionId) {
      const id = await createSession();
      if (!id) return;
      currentSessionId = id;
      await loadSessions();
      log.innerHTML = "";
    }
    busy = true; sendBtn.disabled = true;
    if (suggest) suggest.style.display = "none";
    addUser(question);
    saveSent(question);
    const bubble = addAI(); typing(bubble);
    try {
      const r = await fetch("/api/admin/ask", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId: currentSessionId, r18: r18 ? true : false })
      });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const errMsg = "エラー: " + (j.error || r.status);
        showError(bubble, errMsg, question);
      } else {
        renderAnswer(bubble, j.answer, j.sources);
        await loadSessions(currentSessionId);
      }
    } catch (e) {
      const errMsg = "通信エラー: " + e.message;
      showError(bubble, errMsg, question);
    } finally {
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }

  // ===== ウェルカムメッセージ =====
  function showWelcome(){
    const b = addAI();
    b.textContent = "やっほー、だーりん！ 恋乃夜まいだよ ♡\n配信予定でも、まいのことでも、なんでも聞いてね？";
  }

  // ===== localStorage 旧履歴（mai_chat_log）をサーバーセッションへ移行 =====
  const HIST_KEY = "mai_chat_log";
  async function migrateLegacyLog() {
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch { legacy = []; }
    if (!legacy || !legacy.length) return;
    const r18Legacy = (() => { try { return localStorage.getItem("mai_r18_mode") === "1"; } catch { return false; } })();
    // 旧形式をDB取り込み用に変換
    const messages = legacy
      .filter(m => m && typeof m.text === "string" && m.text.trim())
      .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text, sources: m.sources || [] }));
    if (!messages.length) { try { localStorage.removeItem(HIST_KEY); } catch {} return; }
    r18 = r18Legacy;
    syncR18();
    const id = await createSession(messages);
    try { localStorage.removeItem(HIST_KEY); } catch {}
    if (id) {
      currentSessionId = id;
      await loadSession(id);
      return;
    }
    await loadSessions();
  }

  // ===== 入力欄の自動リサイズ =====
  function autosize(){ input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
  input.addEventListener("input", autosize);

  // ===== キーハンドリング =====
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); return; }
    if (e.key === "ArrowUp" && input.value === "" && sentQuestions.length) {
      e.preventDefault();
      if (sentIdx > 0) sentIdx--;
      input.value = sentQuestions[sentIdx] || "";
      autosize();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    if (e.key === "ArrowDown" && sentQuestions.length) {
      e.preventDefault();
      if (sentIdx < sentQuestions.length - 1) {
        sentIdx++;
        input.value = sentQuestions[sentIdx] || "";
      } else {
        sentIdx = sentQuestions.length;
        input.value = "";
      }
      autosize();
    }
  });

  function submit(){
    const q = input.value.trim();
    if (!q) return;
    input.value = ""; autosize();
    ask(q);
  }
  form.addEventListener("submit", e => { e.preventDefault(); submit(); });
  suggest.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip) ask(chip.textContent.trim());
  });

  // ===== 初期化 =====
  loadSent();
  initR18();
  loadSessions().then(() => migrateLegacyLog());
  showWelcome();
  input.focus();
})();
