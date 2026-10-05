(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtNum = (n) => Number(n || 0).toLocaleString("ja-JP");

  const state = { profile: null, overview: null, errors: [] };

  async function jget(url) {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(url + " → " + r.status);
    return r.json();
  }

  // ---------- プロフィール / 性格 / 語録 ----------
  function renderProfile() {
    const p = state.profile;
    if (!p) {
      $("#wk-profile").innerHTML = `<div class="wk-error">プロフィールデータの取得に失敗しました。時間をおいて再度お試しください。</div>`;
      $("#wk-personality").innerHTML = "";
      $("#wk-quotes").innerHTML = "";
      return;
    }

    $("#wk-profile").innerHTML =
      (p.knowledge || [])
        .map(
          (k) => `<article class="wk-card"><h2>${esc(k.title)}</h2><p>${esc(k.text)}</p></article>`
        )
        .join("") || `<div class="wk-error">プロフィールデータがありません</div>`;

    const pr = p.personality || {};
    const groups = [
      ["fact", "基本情報"],
      ["trait", "性格"],
      ["behavior", "行動パターン"],
      ["emotion", "感情の出し方"],
      ["style", "話し方・口調"],
      ["relationship", "だーりんとの関係"],
    ];
    $("#wk-personality").innerHTML =
      groups
        .filter(([k]) => Array.isArray(pr[k]) && pr[k].length)
        .map(([k, label]) => `<article class="wk-card"><h2>${label}</h2><ul>${pr[k].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></article>`)
        .join("") || `<div class="wk-error">性格データがありません</div>`;

    $("#wk-quotes").innerHTML = `<article class="wk-card"><h2>配信でよくあるセリフ</h2>
      <ul class="wk-quotes">${(pr.exemplars || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></article>`;
  }

  // ---------- 年表 / カテゴリ ----------
  function renderTimeline() {
    const o = state.overview;
    const el = $("#wk-timeline");
    if (!o) {
      el.innerHTML = state.errors.length
        ? `<div class="wk-error">年表データの取得に失敗しました（アーカイブAPIに接続できませんでした）。時間をおいて再度お試しください。</div>`
        : "";
      return;
    }

    const minYear = new Map((o.minutes?.perYear || []).map((m) => [m.year, m.videos]));
    const yearsHtml = (o.years || [])
      .map((y) => {
        const mv = minYear.get(y.year) || 0;
        return `<article class="wk-year">
        <div class="wk-year-head">
          <h2>${y.year}年</h2>
          <span class="wk-year-meta">${fmtNum(y.videos)}本・約${fmtNum(y.hours)}時間</span>
          ${mv ? `<span class="wk-badge">要約済み ${mv}本</span>` : ""}
        </div>
        <ul class="wk-tops">
          ${y.top
            .map(
              (t) => `<li>
              <img src="${esc(t.thumbnail)}" alt="" width="72" height="40" loading="lazy" decoding="async" />
              <a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>
              <span class="wk-views">${fmtNum(t.view_count)}再生</span>
            </li>`
            )
            .join("")}
        </ul>
      </article>`;
      })
      .join("");

    const chips = Object.entries(o.categories || {})
      .map(([name, n]) => `<span class="wk-chip">${esc(name)}<b>${fmtNum(n)}</b></span>`)
      .join("");

    el.innerHTML = `${yearsHtml}
      <article class="wk-card"><h2>カテゴリ別（全期間）</h2><div class="wk-chips">${chips}</div></article>`;
  }

  // ---------- 最近の話題（要約から） ----------
  function renderTopics() {
    const o = state.overview;
    const el = $("#wk-topics");
    if (!o) {
      el.innerHTML = state.errors.length
        ? `<div class="wk-error">要約データの取得に失敗しました。時間をおいて再度お試しください。</div>`
        : "";
      return;
    }
    const vids = o.recentMinutes || [];
    if (!vids.length) {
      el.innerHTML = `<div class="wk-error">要約がまだありません（毎朝の自動生成で少しずつ増えます）。</div>`;
      return;
    }
    el.innerHTML = vids
      .map(
        (v) => `<article class="wk-card">
        <h2><a href="${esc(v.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(v.title)}</a></h2>
        <div class="wk-video-meta">${esc(v.stream_date_jst)} 配信・配信アーカイブより</div>
        ${v.sections
          .map(
            (s) => `${s.section ? `<h3>${esc(s.section)}</h3>` : ""}
          <ul class="wk-facts">${s.items
            .map((it) => `<li><strong>${esc(it.topic)}</strong>${it.facts.length ? `<br>${it.facts.map((f) => esc(f)).join("<br>")}` : ""}</li>`)
            .join("")}</ul>`
          )
          .join("")}
      </article>`
      )
      .join("");
  }

  function renderStats() {
    const o = state.overview;
    const el = $("#wk-stats");
    if (!o) return;
    const y0 = (o.years || [])[o.years.length - 1];
    const y1 = (o.years || [])[0];
    const items = [
      [fmtNum(o.catalogTotal), "動画"],
      [fmtNum(o.minutes?.videos), "要約済み配信"],
      [fmtNum(o.minutes?.chunks), "要約チャンク"],
      [y0 && y1 ? `${y0.year}〜${y1.year}` : "", "活動期間"],
    ];
    el.innerHTML = items
      .filter(([b]) => b)
      .map(([b, s]) => `<div class="wk-stat"><b>${b}</b><span>${s}</span></div>`)
      .join("");
    el.hidden = false;
  }

  // ---------- タブ ----------
  function activateTab(name) {
    document.querySelectorAll(".wk-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
    ["profile", "personality", "quotes", "timeline", "topics"].forEach((id) => {
      const panel = $("#wk-" + id);
      if (panel) panel.hidden = id !== name;
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".wk-tab");
    if (btn) activateTab(btn.dataset.tab);
  });

  // ---------- 起動 ----------
  async function boot() {
    const results = await Promise.allSettled([jget("/api/wiki/profile"), jget("/api/wiki/overview")]);
    if (results[0].status === "fulfilled") state.profile = results[0].value;
    else state.errors.push("profile: " + results[0].reason);
    if (results[1].status === "fulfilled") state.overview = results[1].value;
    else state.errors.push("overview: " + results[1].reason);

    renderProfile();
    renderTimeline();
    renderTopics();
    renderStats();

    $("#wk-loading").remove();
    activateTab("profile");
  }

  boot();
})();
