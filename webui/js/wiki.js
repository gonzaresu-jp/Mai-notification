(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtNum = (n) => Number(n || 0).toLocaleString("ja-JP");
  const set = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  const errBox = (msg) => `<div class="wk-error">${esc(msg)}</div>`;

  const state = { profile: null, overview: null };

  async function jget(url) {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(url + " → " + r.status);
    return r.json();
  }

  // ---------- 概要 ----------
  function renderOverview() {
    const p = state.profile;
    const o = state.overview;
    if (p) {
      const k0 = (p.knowledge || []).find((k) => k.title.includes("プロフィール")) || (p.knowledge || [])[0];
      if (k0) set("wk-overview", `<div class="wk-card"><h3>${esc(k0.title)}</h3><p>${esc(k0.text)}</p></div>`);
      else set("wk-overview", errBox("プロフィールデータがありません"));
    } else {
      set("wk-overview", errBox("プロフィールデータの取得に失敗しました"));
    }
    if (!o) return;

    const subs = o.subscribers && o.subscribers.last;
    const debut = o.firstStreamDate ? o.firstStreamDate.slice(0, 7).replace("-", "年") + "月" : "";
    const items = [
      [fmtNum(o.catalogTotal), "動画（アーカイブ収録）"],
      [debut ? debut.replace("年", ".").replace("月", "") + "〜" : "", "活動期間"],
      [subs ? `約${subs.wan}万人` : "", "YouTube登録者"],
      [fmtNum(o.minutes?.videos), "要約済み配信"],
      [String(Object.keys(o.categories || {}).length), "配信カテゴリ"],
    ];
    const el = $("#wk-stats");
    el.innerHTML = items
      .filter(([b]) => b)
      .map(([b, s]) => `<div class="wk-stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`)
      .join("");
    el.hidden = false;
  }

  // ---------- 活動内容 ----------
  const PLATFORM_LABELS = {
    twitterMain: "X（旧Twitter）",
    twitterSub: "X サブアカウント",
    youtube: "YouTube ライブ",
    youtubeCommunity: "YouTube コミュニティ",
    twitcasting: "TwitCasting",
    twitch: "Twitch",
    fanbox: "Pixiv Fanbox",
    bilibili: "bilibili",
  };

  function renderActivity() {
    const o = state.overview;
    if (!o) {
      set("wk-activity", errBox("アーカイブデータの取得に失敗しました"));
      return;
    }
    const cats = Object.entries(o.categories || {});
    const max = cats.length ? cats[0][1] : 1;
    const total = cats.reduce((n, [, c]) => n + c, 0) || 1;

    const bars = cats
      .map(
        ([name, n]) => `<div class="wk-cat">
        <span class="wk-cat-name">${esc(name)}</span>
        <span class="wk-cat-bar"><i style="width:${Math.max(2, Math.round((n / max) * 100))}%"></i></span>
        <span class="wk-cat-n">${fmtNum(n)}本・${Math.round((n / total) * 100)}%</span>
      </div>`
      )
      .join("");

    const plats = (o.platforms || [])
      .map((p) => `<span class="wk-chip">${esc(PLATFORM_LABELS[p.key] || p.key)}<b>${fmtNum(p.n)}</b></span>`)
      .join("");

    set(
      "wk-activity",
      `<div class="wk-card">
        <h3>配信カテゴリの内訳（タグ延べ ${fmtNum(total)} 件・1本に複数付くことがあります）</h3>
        ${bars}
      </div>
      <div class="wk-card">
        <h3>活動プラットフォーム</h3>
        <p>各プラットフォームで配信・告知を行っています（件数はこのサイトが送信した通知の記録）。</p>
        <div class="wk-platforms">${plats}</div>
      </div>`
    );
  }

  // ---------- ゲーム実況 ----------
  function renderGames() {
    const o = state.overview;
    if (!o) return set("wk-games", errBox("データがありません"));
    const games = o.games || [];
    if (!games.length) return set("wk-games", errBox("ゲーム実況の記録がありません"));
    const items = games
      .map(
        (g, i) => `<li>
        <span class="wk-rank-n">${i + 1}.</span>
        <span class="wk-rank-name">${esc(g.name)}</span>
        <span class="wk-rank-cnt">×${g.count}本</span>
        ${g.sample ? `<span class="wk-rank-sample">例: <a href="${esc(g.sample.url)}" target="_blank" rel="noopener">${esc(g.sample.title)}</a></span>` : ""}
      </li>`
      )
      .join("");
    set(
      "wk-games",
      `<div class="wk-card"><h3>実況したゲーム（回数順・上位20タイトル）</h3><ol class="wk-rank">${items}</ol></div>`
    );
  }

  // ---------- コラボ ----------
  function renderCollabs() {
    const o = state.overview;
    if (!o) return set("wk-collabs", errBox("データがありません"));
    const list = o.collaborators || [];
    if (!list.length) return set("wk-collabs", errBox("コラボの記録がありません"));
    const items = list
      .map(
        (c, i) => `<li>
        <span class="wk-rank-n">${i + 1}.</span>
        <span class="wk-rank-name">${esc(c.name)}</span>
        <span class="wk-rank-cnt">×${c.count}本</span>
        ${c.sample ? `<span class="wk-rank-sample">例: <a href="${esc(c.sample.url)}" target="_blank" rel="noopener">${esc(c.sample.title)}</a></span>` : ""}
      </li>`
      )
      .join("");
    set(
      "wk-collabs",
      `<div class="wk-card"><h3>コラボした配信者（回数順）</h3><ol class="wk-rank">${items}</ol></div>`
    );
  }

  // ---------- 代表作 ----------
  function renderWorks() {
    const o = state.overview;
    if (!o) return set("wk-works", errBox("データがありません"));
    const works = o.topVideos || [];
    if (!works.length) return set("wk-works", errBox("再生数データがありません"));
    const items = works
      .map(
        (v, i) => `<div class="wk-work">
        <img src="${esc(v.thumbnail)}" alt="" width="128" height="72" loading="lazy" decoding="async" />
        <div class="wk-work-body">
          <span class="wk-work-rank">第${i + 1}位</span>
          <a class="wk-work-title" href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>
          <span class="wk-work-meta">${esc(v.stream_date_jst)}・${fmtNum(v.view_count)}再生・約${fmtNum(v.duration_min)}分</span>
        </div>
      </div>`
      )
      .join("");
    set("wk-works", `<div class="wk-works">${items}</div>`);
  }

  // ---------- 活動年表 ----------
  function renderTimeline() {
    const o = state.overview;
    if (!o) return set("wk-timeline", errBox("年表データの取得に失敗しました"));
    const minYear = new Map((o.minutes?.perYear || []).map((m) => [m.year, m.videos]));
    const html = (o.years || [])
      .map((y) => {
        const mv = minYear.get(y.year) || 0;
        return `<article class="wk-year">
        <div class="wk-year-head">
          <h3>${y.year}年</h3>
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
    set("wk-timeline", html || errBox("年表データがありません"));
  }

  // ---------- 最近の配信 ----------
  function renderRecent() {
    const o = state.overview;
    if (!o) return set("wk-recent", errBox("要約データの取得に失敗しました"));
    const vids = o.recentMinutes || [];
    if (!vids.length) return set("wk-recent", errBox("要約がまだありません（毎朝の自動生成で少しずつ増えます）"));
    const html = vids
      .map(
        (v) => `<article class="wk-card">
        <h3><a href="${esc(v.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(v.title)}</a></h3>
        <div class="wk-video-meta">${esc(v.stream_date_jst)} 配信</div>
        ${v.sections
          .map(
            (s) => `${s.section ? `<h4 style="font-size:0.92rem;color:var(--wk-secondary);margin:10px 0 4px">${esc(s.section)}</h4>` : ""}
          <ul class="wk-facts">${s.items
            .map(
              (it) => `<li><strong>${esc(it.topic)}</strong>${it.facts.length ? `<br>${it.facts.map((f) => esc(f)).join("<br>")}` : ""}</li>`
            )
            .join("")}</ul>`
          )
          .join("")}
      </article>`
      )
      .join("");
    set("wk-recent", html);
  }

  // ---------- キャラクター ----------
  function renderCharacter() {
    const p = state.profile;
    if (!p) return set("wk-character", errBox("データの取得に失敗しました"));
    const k = p.knowledge || [];
    const k1 = k.find((x) => x.title.includes("性格")) || null;
    const pr = p.personality || {};
    const groups = [
      ["fact", "配信で語られていること"],
      ["trait", "性格"],
      ["behavior", "行動パターン"],
      ["emotion", "感情の出し方"],
      ["style", "話し方"],
      ["relationship", "だーりんとの関係"],
    ];
    const cards = [
      k1 ? `<div class="wk-card"><h3>${esc(k1.title)}</h3><p>${esc(k1.text)}</p></div>` : "",
      ...groups
        .filter(([key]) => Array.isArray(pr[key]) && pr[key].length)
        .map(
          ([key, label]) =>
            `<div class="wk-card"><h3>${label}</h3><ul>${pr[key].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`
        ),
    ].join("");
    set("wk-character", cards || errBox("性格データがありません"));
  }

  // ---------- 語録・口調 ----------
  function renderQuotes() {
    const p = state.profile;
    if (!p) return set("wk-quotes", errBox("データの取得に失敗しました"));
    const k = p.knowledge || [];
    const k2 = k.find((x) => x.title.includes("口調")) || null;
    const ex = p.personality?.exemplars || [];
    set(
      "wk-quotes",
      [
        k2 ? `<div class="wk-card"><h3>${esc(k2.title)}</h3><p>${esc(k2.text)}</p></div>` : "",
        ex.length
          ? `<div class="wk-card"><h3>配信で実際にあったセリフ（字幕から抜粋）</h3><ul class="wk-quotes">${ex
              .map((x) => `<li>${esc(x)}</li>`)
              .join("")}</ul></div>`
          : "",
      ].join("") || errBox("語録データがありません")
    );
  }

  // ---------- 目次のスクロールスパイ ----------
  function setupScrollSpy() {
    const links = [...document.querySelectorAll(".wk-toc-list a")];
    const sections = links
      .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
      .filter(Boolean);
    if (!sections.length || !("IntersectionObserver" in window)) return;

    const visible = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        let bestId = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (!bestId) return;
        links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + bestId));
      },
      { rootMargin: "-76px 0px -55% 0px", threshold: [0, 0.1, 0.5, 1] }
    );
    sections.forEach((s) => observer.observe(s));
  }

  // ---------- 起動 ----------
  async function boot() {
    const results = await Promise.allSettled([jget("/api/wiki/profile"), jget("/api/wiki/overview")]);
    if (results[0].status === "fulfilled") state.profile = results[0].value;
    if (results[1].status === "fulfilled") state.overview = results[1].value;

    renderOverview();
    renderActivity();
    renderGames();
    renderCollabs();
    renderWorks();
    renderTimeline();
    renderRecent();
    renderCharacter();
    renderQuotes();

    $("#wk-loading")?.remove();
    document.querySelector('.wk-toc-list a[href="#overview"]')?.classList.add("is-active");
    setupScrollSpy();
  }

  boot();
})();
