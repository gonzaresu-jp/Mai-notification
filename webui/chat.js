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
  const speakToggle = document.getElementById("speakToggle");
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
        `<span class="sess-del" title="このセッションを削除"><i class="fa-solid fa-trash-can"></i></span>` +
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
    headerSub.innerHTML = r18
      ? '<i class="fa-solid fa-heart-circle-exclamation"></i> 大人のモード / だーりん、少し特殊な部屋で待機中…（18禁・フィクション）'
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
    // 共通好み（chat_prefs）を読み込む。パネルは全チャット共通の設定を編集するUI。
    if (!prefEls.likes) return;
    try {
      const r = await fetch("/api/admin/chat/prefs", { credentials: "include" });
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
    // 保存先は 共通(chat_prefs)。開いているセッションがあれば そのセッションにも同期（即時反映のため）。
    const body = prefsFromInputs();    try {
      const r = await fetch("/api/admin/chat/prefs", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        showPrefsStatus("保存できなかったよ… " + (j.error || r.status));
        return;
      }
      if (currentSessionId) {
        // セッション個別の好みも同じ値へ同期（フォールバックで共通が使われるが、過去セッションの古い個別値を上書き）
        fetch("/api/admin/chat/sessions/" + currentSessionId + "/prefs", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }).catch(() => {});
      }
      showPrefsStatus("保存したよ ♡ 全チャットに反映されるよ");
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

  // ===== 自動読み上げ（まいの声・/api/admin/chat/speak 経由・SSE文単位ストリーム再生） =====
  const SPEAK_KEY = "mai_chat_speak";
  let speakOn = false;
  let speakAbort = null;   // 進行中のfetch（新しい応答やOFFで打ち切り）
  let speakAudio = null;   // 再生中のAudio
  let speakQueue = [];     // 未再生のチャンク（Blob URL）
  let speakDone = false;   // ストリーム受信完了
  let speaking = false;    // 生成中〜再生中

  function syncSpeak() {
    if (!speakToggle) return;
    speakToggle.classList.toggle("on", speakOn);
    speakToggle.classList.toggle("speaking", speaking);
    speakToggle.setAttribute("aria-pressed", String(speakOn));
    speakToggle.title = !speakOn
      ? "自動読み上げ: OFF（まいの声を再生）"
      : speaking ? "まいが読んでるよ…（クリックでOFF）" : "自動読み上げ: ON";
  }
  function initSpeak() {
    try { speakOn = localStorage.getItem(SPEAK_KEY) === "1"; } catch { speakOn = false; }
    syncSpeak();
  }
  function stopSpeak() {
    ttsReset();
    if (speakAbort) { try { speakAbort.abort(); } catch {} speakAbort = null; }
    if (speakAudio) { try { speakAudio.pause(); } catch {} speakAudio = null; }
    speakQueue.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    speakQueue = [];
    speakDone = false;
    speaking = false;
    syncSpeak();
  }

  function pumpSpeak(ac) {
    if (speakAbort !== ac) return;            // 打ち切り済み
    if (speakAudio) return;                   // 再生中
    if (!speakQueue.length) {
      if (speakDone) { speaking = false; syncSpeak(); }
      return;
    }
    const url = speakQueue.shift();
    const audio = new Audio(url);
    speakAudio = audio;
    const done = () => {
      try { URL.revokeObjectURL(url); } catch {}
      if (speakAudio === audio) { speakAudio = null; pumpSpeak(ac); }
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  }

  function b64ToUrl(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: "audio/wav" }));
  }

  if (speakToggle) {
    speakToggle.addEventListener("click", () => {
      speakOn = !speakOn;
      try { localStorage.setItem(SPEAK_KEY, speakOn ? "1" : "0"); } catch {}
      if (!speakOn) stopSpeak(); else syncSpeak();
    });
  }

  function cleanForSpeech(text) {
    let s = String(text || "");
    s = s.replace(/```[\s\S]*?```/g, " コード省略。 ");
    s = s.replace(/`([^`]+)`/g, "$1");
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    s = s.replace(/https?:\/\/\S+/g, " リンク。 ");
    s = s.replace(/^[>#\-*\s]+/gm, "");
    s = s.replace(/\*\*|__|[*_]/g, "");
    s = s.replace(/[#|]/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  // ===== 読み上げパイプライン（回答生成と並列・文単位で逐次TTS） =====
  // 回答はSSEでストリーミングされ、文が確定するごとにTTSへ発行する。
  // セッション単位の AbortController（speakAbort）で再生と取得をまとめて打ち切る。
  let ttsPending = "";     // 未送信の生テキスト
  let ttsActive = false;   // TTS fetch進行中
  let ttsStarted = false;  // 今回の回答でTTSを1回でも発したか
  let ttsFeedOpen = false; // 回答テキストの受信中

  function ttsReset() {
    ttsPending = "";
    ttsActive = false;
    ttsStarted = false;
    ttsFeedOpen = false;
  }

  function ttsFeed(delta) {
    if (!delta) return;
    ttsPending += delta;
    ttsTryDispatch();
  }

  function ttsFinish() {
    ttsFeedOpen = false;
    ttsTryDispatch();
  }

  function ttsTakeSegment(final) {
    const s = ttsPending;
    if (!s) return "";
    if (final) {
      ttsPending = "";
      const c = cleanForSpeech(s);
      return c ? c.slice(0, 1000) : "";
    }
    const m = Math.max(
      s.lastIndexOf("。"), s.lastIndexOf("！"), s.lastIndexOf("？"),
      s.lastIndexOf("!"), s.lastIndexOf("?"), s.lastIndexOf("…"), s.lastIndexOf("\n")
    );
    if (m >= 0) {
      const head = s.slice(0, m + 1);
      // 初回は短文だとTTFB固定費が倒掛するので12文字以上を待つ。2回目以降は文境界で即送る。
      if (ttsStarted || head.length >= 12) {
        ttsPending = s.slice(m + 1);
        const c = cleanForSpeech(head);
        if (c) { ttsStarted = true; return c; }
        return "";
      }
    }
    // 文境界が無くても80字たまったら文途中で切って送る
    if (s.length >= 80) {
      const head2 = s.slice(0, 60);
      ttsPending = s.slice(60);
      const c = cleanForSpeech(head2);
      if (c) { ttsStarted = true; return c; }
    }
    return "";
  }

  function ttsTryDispatch() {
    if (!speakOn || ttsActive) return;
    const seg = ttsTakeSegment(!ttsFeedOpen);
    if (seg) { ttsRun(seg); return; }
    if (!ttsFeedOpen && !ttsPending && ttsStarted) ttsComplete();
  }

  function ttsComplete() {
    speakDone = true;
    pumpSpeak(speakAbort);
  }

  async function ttsRun(cleaned) {
    ttsActive = true;
    if (!speakAbort) speakAbort = new AbortController(); // 読み上げセッション単位（再生中も有効）
    const ac = speakAbort;
    speaking = true;
    syncSpeak();
    try {
      const r = await fetch("/api/admin/chat/speak", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleaned, stream: true }),
        signal: ac.signal,
      });
      if (speakAbort !== ac) return; // 打ち切り済み
      if (!r.ok) {
        console.warn("[speak] failed:", r.status);
        return;
      }
      const ctype = (r.headers.get("content-type") || "");
      if (!r.body || ctype.indexOf("audio/") !== -1) {
        // フォールバック: 旧プロキシの一括WAV
        const blob = await r.blob();
        if (speakAbort !== ac) return;
        speakQueue.push(URL.createObjectURL(blob));
        pumpSpeak(ac);
        return;
      }
      // SSE: 文単位チャンクが完成するごとに届き、先頭から順に再生
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const handleBlock = (block) => {
        let ev = "", dataStr = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
        }
        if (!dataStr) return;
        let d;
        try { d = JSON.parse(dataStr); } catch { return; }
        if (ev === "audio_chunk" && d.audio_base64) {
          speakQueue.push(b64ToUrl(d.audio_base64));
          pumpSpeak(ac);
        } else if (ev === "error") {
          console.warn("[speak] stream error:", d && d.error && d.error.message);
        }
      };
      for (;;) {
        const { value, done: rdone } = await reader.read();
        if (rdone) break;
        if (speakAbort !== ac) { try { reader.cancel(); } catch {} return; }
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          handleBlock(buf.slice(0, idx));
          buf = buf.slice(idx + 2);
        }
      }
      if (buf.trim()) handleBlock(buf);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      console.warn("[speak] error:", e);
    } finally {
      // セッションが変わっていない時だけ次セグメントへ連鎖（stopSpeak後は無効）
      if (speakAbort === ac) {
        ttsActive = false;
        ttsTryDispatch();
      }
    }
  }

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
    retry.innerHTML = '<i class="fa-solid fa-rotate"></i> もう一度試す';
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
    stopSpeak(); // 前回の読み上げ再生・生成を打ち切る
    addUser(question);
    saveSent(question);
    const bubble = addAI(); typing(bubble);
    try {
      const r = await fetch("/api/admin/ask", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId: currentSessionId, r18: r18 ? true : false, stream: true })
      });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
      const ctype = (r.headers.get("content-type") || "");
      if (ctype.indexOf("text/event-stream") === -1) {
        // ストリーム未対応サーバー向けの従来JSON経路
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          showError(bubble, "エラー: " + (j.error || r.status), question);
        } else {
          renderAnswer(bubble, j.answer, j.sources);
          ttsFeed(j.answer);
          ttsFinish();
          await loadSessions(currentSessionId);
        }
      } else {
        // SSE: deltaを逐次表示しつつ、文単位で読み上げへ発行（生成と並列）
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let answerAcc = "";
        let sources = null;
        let streamErr = null;
        let lastRender = 0;
        const renderPartial = (force) => {
          const now = Date.now();
          if (!force && now - lastRender < 80) return;
          lastRender = now;
          renderAnswer(bubble, answerAcc, null);
        };
        const handleBlock = (block) => {
          let ev = "", dataStr = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) ev = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) return;
          let d;
          try { d = JSON.parse(dataStr); } catch { return; }
          if (ev === "delta" && d.text) {
            answerAcc += d.text;
            renderPartial(false);
            ttsFeed(d.text);
          } else if (ev === "meta") {
            sources = d.sources || null;
          } else if (ev === "done") {
            if (d.answer) answerAcc = d.answer;
          } else if (ev === "error") {
            streamErr = d.error || "stream error";
          }
        };
        for (;;) {
          const { value, done: rdone } = await reader.read();
          if (rdone) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            handleBlock(buf.slice(0, idx));
            buf = buf.slice(idx + 2);
          }
        }
        if (buf.trim()) handleBlock(buf);
        ttsFinish();
        if (streamErr && !answerAcc) {
          showError(bubble, "エラー: " + streamErr, question);
        } else {
          if (streamErr) console.warn("[ask] stream error:", streamErr);
          renderAnswer(bubble, answerAcc, sources);
          await loadSessions(currentSessionId);
        }
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
  initSpeak();
  // TTSコンテナの先行ウォームアップ（コールドスタート吸収・失敗は無視）
  fetch("/api/admin/chat/tts-warm", { credentials: "include" }).catch(() => {});
  loadSessions().then(() => migrateLegacyLog());
  showWelcome();
  input.focus();
})();
