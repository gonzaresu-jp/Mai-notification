// admin「まいAI」タブ: まいちゃんの活動傾向（推定）
// GET /api/admin/mai-state を描画する。グラフは admin-ai.js と同じく素の SVG。
(function () {
  const PRIMARY = "#B11E7C";
  const SUB = "#7F2534";
  const root = document.getElementById("mai-state");
  if (!root) return;

  const PCOLOR = { youtube: "#e62117", twitcasting: "#2d9cdb", twitch: "#9146ff", twitter: "#444", other: "#999" };
  const PLABEL = { youtube: "YouTube", twitcasting: "ツイキャス", twitch: "Twitch", twitter: "X告知", other: "その他" };
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  let data = null;
  let wdMode = "recent";

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  const pctTxt = (v) => (v == null ? "-" : Math.round(v * 100) + "%");

  function block(title, inner, note) {
    return `<div style="background:#fff; border:1px solid #eee; border-radius:12px; padding:12px 14px;">
      <div style="font-weight:800; font-size:.9rem; color:${SUB}; margin-bottom:6px;">${esc(title)}</div>
      ${note ? `<div style="color:#888; font-size:.72rem; margin:-2px 0 8px;">${note}</div>` : ""}
      ${inner}
    </div>`;
  }

  function card(title, icon, value, note, color) {
    return `<div style="flex:1; min-width:170px; background:#faf5f8; border:1px solid #f0dae4; border-radius:12px; padding:12px 14px;">
      <div style="font-size:.76rem; color:#8a5570; font-weight:700;"><i class="fa-solid ${icon}"></i> ${esc(title)}</div>
      <div style="font-size:1.5rem; font-weight:800; color:${color || "#2c2c3e"}; line-height:1.3;">${value}</div>
      <div style="font-size:.72rem; color:#888; line-height:1.5;">${note}</div>
    </div>`;
  }

  function legend(ids) {
    return `<div style="display:flex; gap:12px; flex-wrap:wrap; font-size:.72rem; color:#666; margin-top:6px;">` +
      ids.map((p) => `<span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${PCOLOR[p]};margin-right:4px;"></i>${PLABEL[p] || p}</span>`).join("") + `</div>`;
  }

  // ---- 状態カード
  function stateCards(st) {
    const m = st.motivation;
    const mColor = m >= 70 ? PRIMARY : m >= 45 ? "#c98a00" : "#667eea";
    const mLabel = m >= 70 ? "高め" : m >= 45 ? "ふだん並み" : "低め";
    const cColor = st.condition === "注意" ? "#d9534f" : st.condition === "ややサインあり" ? "#c98a00" : "#2e9e6b";
    const ratio = (r) => (r == null ? "-" : "×" + r);
    const senti = st.sentimentRecent == null ? "-" : (st.sentimentRecent >= 0 ? "+" : "") + st.sentimentRecent;
    return `<div style="display:flex; gap:10px; flex-wrap:wrap;">` +
      card("配信意欲（推定）", "fa-fire", `${m}<span style="font-size:.9rem;"> / 100</span>`,
        `${mLabel}・配信頻度 ${ratio(st.streamRatio)}・ツイート量 ${ratio(st.tweetRatio)}（直近2週 ÷ ふだん）`, mColor) +
      card("体調サイン", "fa-heart-pulse", esc(st.condition),
        st.signals.length ? st.signals.map(esc).join("<br>") : "体調関連の言葉・深夜投稿・感情・配信頻度に目立った変化はありません", cColor) +
      card("ツイートの感情", "fa-face-smile", senti,
        `直近2週（ふだん ${st.sentimentBase == null ? "-" : (st.sentimentBase >= 0 ? "+" : "") + st.sentimentBase}）・+1 が全部ポジティブ`) +
      card("深夜の投稿", "fa-moon", pctTxt(st.lateNightRecent), `1〜5時の投稿の割合（ふだん ${pctTxt(st.lateNightBase)}）`) +
      `</div>`;
  }

  // ---- 7日間の見込み
  function forecastSvg(days) {
    const w = 760, h = 150, colW = w / 7, barMaxH = 80, top = 26;
    let g = "";
    days.forEach((d, i) => {
      const x = i * colW;
      const bh = Math.max(2, d.probability * barMaxH);
      const color = PCOLOR[d.platform] || "#bbb";
      const isWe = d.weekday === 0 || d.weekday === 6;
      g += `<text x="${x + colW / 2}" y="14" text-anchor="middle" font-size="12" font-weight="700" fill="${isWe ? SUB : "#444"}">${esc(d.date.slice(5).replace("-", "/"))}(${esc(d.label)})</text>`;
      g += `<rect x="${x + colW * 0.25}" y="${top}" width="${colW * 0.5}" height="${barMaxH}" rx="4" fill="#f4eef2"></rect>`;
      g += `<rect x="${x + colW * 0.25}" y="${top + barMaxH - bh}" width="${colW * 0.5}" height="${bh}" rx="4" fill="${color}" opacity="${d.planned.length ? 1 : 0.75}"></rect>`;
      g += `<text x="${x + colW / 2}" y="${top + barMaxH - bh - 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#333">${Math.round(d.probability * 100)}%</text>`;
      const sub = d.planned.length ? "予定あり" : d.platform ? `${PLABEL[d.platform] || d.platform}` : "-";
      g += `<text x="${x + colW / 2}" y="${top + barMaxH + 16}" text-anchor="middle" font-size="11" fill="${d.planned.length ? PRIMARY : "#666"}" font-weight="${d.planned.length ? 700 : 400}">${esc(sub)}</text>`;
      g += `<text x="${x + colW / 2}" y="${top + barMaxH + 30}" text-anchor="middle" font-size="10" fill="#888">${d.hour == null ? "" : d.hour + "時ごろ"}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;" role="img" aria-label="7日間の配信見込み">${g}</svg>`;
  }

  // ---- 曜日×プラットフォーム（積み上げ横棒 + 配信があった週の割合）
  function weekdaySvg(wp, platforms) {
    const w = 760, rowH = 24, labelW = 30, rateW = 200;
    const max = Math.max(1, ...wp.rows.map((r) => r.total));
    const unit = (w - labelW - rateW - 10) / max;
    let g = "";
    wp.rows.forEach((r, i) => {
      const y = i * rowH + 4;
      g += `<text x="${labelW - 8}" y="${y + 13}" text-anchor="end" font-size="12" fill="${r.weekday === 0 || r.weekday === 6 ? SUB : "#555"}" font-weight="700">${esc(r.label)}</text>`;
      let x = labelW;
      for (const p of platforms) {
        const n = r.byPlatform[p] || 0;
        if (!n) continue;
        g += `<rect x="${x.toFixed(1)}" y="${y}" width="${(n * unit).toFixed(1)}" height="16" fill="${PCOLOR[p]}" opacity=".85"><title>${PLABEL[p]} ${n}回</title></rect>`;
        x += n * unit;
      }
      g += `<text x="${(x + 6).toFixed(1)}" y="${y + 13}" font-size="11" fill="#333">${r.total}回</text>`;
      g += `<text x="${w - 2}" y="${y + 13}" text-anchor="end" font-size="11" fill="#666">配信した週 ${Math.round(r.streamRate * 100)}%${r.topPlatform ? "・" + esc(PLABEL[r.topPlatform]) : ""}</text>`;
    });
    const h = wp.rows.length * rowH + 8;
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;" role="img" aria-label="曜日別の配信プラットフォーム">${g}</svg>`;
  }

  // ---- 開始時刻×プラットフォーム（積み上げ縦棒・5時始まり）
  function hourSvg(hours, platforms) {
    const w = 760, h = 130, padB = 16, order = [...Array(24).keys()].map((i) => (i + 5) % 24);
    const totals = order.map((hr) => platforms.reduce((a, p) => a + (hours[p]?.[hr] || 0), 0));
    const max = Math.max(1, ...totals);
    const bw = w / 24;
    let g = "";
    order.forEach((hr, i) => {
      let y = h - padB;
      for (const p of platforms) {
        const n = hours[p]?.[hr] || 0;
        if (!n) continue;
        const bh = ((h - padB - 12) * n) / max;
        y -= bh;
        g += `<rect x="${(i * bw + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" fill="${PCOLOR[p]}" opacity=".85"><title>${hr}時 ${PLABEL[p]} ${n}回</title></rect>`;
      }
      g += `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${h - 3}" text-anchor="middle" font-size="9" fill="#666">${hr}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;" role="img" aria-label="開始時刻別の配信数">${g}</svg>`;
  }

  // ---- 週ごとの推移（配信数の積み上げ棒 + 感情の折れ線）
  function weeklySvg(weeks, platforms) {
    const w = 760, h = 170, padB = 18, padT = 10, padL = 24;
    const max = Math.max(1, ...weeks.map((x) => x.streams));
    const bw = (w - padL) / weeks.length;
    const ch = h - padB - padT;
    let g = "";
    for (let v = 0; v <= max; v += Math.max(1, Math.ceil(max / 4))) {
      const y = h - padB - (ch * v) / max;
      g += `<line x1="${padL}" x2="${w}" y1="${y}" y2="${y}" stroke="#eee"></line><text x="${padL - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#999">${v}</text>`;
    }
    weeks.forEach((wk, i) => {
      let y = h - padB;
      for (const p of platforms) {
        const n = wk.byPlatform[p] || 0;
        if (!n) continue;
        const bh = (ch * n) / max;
        y -= bh;
        g += `<rect x="${(padL + i * bw + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" fill="${PCOLOR[p]}" opacity=".8"><title>${wk.weekStart}〜 ${PLABEL[p]} ${n}回</title></rect>`;
      }
      if (i % 4 === 0) g += `<text x="${(padL + i * bw + bw / 2).toFixed(1)}" y="${h - 4}" text-anchor="middle" font-size="9" fill="#666">${esc(wk.weekStart.slice(5).replace("-", "/"))}</text>`;
    });
    // 感情（-1〜+1 を縦軸いっぱいに）
    const pts = weeks.map((wk, i) => wk.sentiment == null ? null : [padL + i * bw + bw / 2, padT + ch * (1 - (wk.sentiment + 1) / 2)]);
    let path = "";
    pts.forEach((p) => { if (p) path += (path ? " L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); });
    if (path) g += `<path d="${path}" fill="none" stroke="${PRIMARY}" stroke-width="2" stroke-dasharray="4 3"></path>`;
    pts.forEach((p, i) => { if (p) g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${PRIMARY}"><title>${weeks[i].weekStart}〜 感情 ${weeks[i].sentiment}（${weeks[i].sentimentN}件）</title></circle>`; });
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;" role="img" aria-label="週ごとの配信数と感情">${g}</svg>`;
  }

  function wdToggle() {
    const opts = [["recent", "直近3か月"], ["sinceLog", "全プラットフォームの記録がある期間"], ["youtubeAll", "YouTube 全期間"]];
    return `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">` + opts.map(([k, l]) =>
      `<button type="button" data-wd="${k}" style="border:1px solid ${k === wdMode ? PRIMARY : "#ddd"}; background:${k === wdMode ? PRIMARY : "#fff"}; color:${k === wdMode ? "#fff" : "#666"}; border-radius:999px; padding:3px 12px; font-size:.74rem; cursor:pointer;">${l}</button>`).join("") + `</div>`;
  }

  function render() {
    const d = data;
    const plats = d.platforms.map((p) => p.id);
    const st = d.state;
    const wp = d.weekdayPlatform[wdMode];
    const wpPlats = wdMode === "youtubeAll" ? ["youtube"] : plats;
    const health = st.healthTweets.length
      ? block("体調に関する言葉が入ったツイート（直近2週）", st.healthTweets.map((t) =>
          `<div style="font-size:.8rem; color:#444; padding:3px 0; border-bottom:1px dashed #eee;"><span style="color:#999; margin-right:8px;">${esc(t.date)}</span>${esc(t.text)}</div>`).join(""))
      : "";
    root.innerHTML =
      `<div style="color:#888; font-size:.74rem;">${esc(d.note)}・更新 ${esc(new Date(d.generated_at).toLocaleString("ja-JP"))}
        <button type="button" id="mai-state-refresh" style="margin-left:8px; border:1px solid #ddd; background:#fff; border-radius:999px; padding:1px 10px; font-size:.72rem; cursor:pointer;"><i class="fa-solid fa-arrows-rotate"></i> 再計算</button></div>` +
      stateCards(st) +
      block("これから7日間の配信見込み", forecastSvg(d.forecast) + legend(plats.concat(["twitter"])),
        "直近12週の曜日ごとの配信実績 × いまの活動量（配信頻度）から算出。配信予定が登録されている日は 95% 表示") +
      block("曜日ごとの配信プラットフォーム", wdToggle() + weekdaySvg(wp, wpPlats) + legend(wpPlats),
        `${esc(wp.from)} 〜 ${esc(wp.to)}（${wp.weeks}週）・深夜0〜4時の配信は前日の枠として数えています` +
        (wdMode !== "youtubeAll" ? `・ツイキャス/Twitch は通知ログ（${esc(d.sources.platformLogSince)}〜）から集計` : "")) +
      block("配信の開始時刻", hourSvg(wp.hours, wpPlats) + legend(wpPlats), "上の期間と同じ・横軸は5時始まり") +
      block("週ごとの推移（直近26週）", weeklySvg(d.weekly, plats) + legend(plats) +
        `<div style="font-size:.72rem; color:#888; margin-top:4px;"><span style="color:${PRIMARY};">- - ●</span> ツイートの感情（上ほどポジティブ）</div>`) +
      health;
    root.querySelectorAll("[data-wd]").forEach((b) => b.addEventListener("click", () => { wdMode = b.dataset.wd; render(); }));
    const rf = document.getElementById("mai-state-refresh");
    if (rf) rf.addEventListener("click", () => load(true));
  }

  async function load(force) {
    try {
      const r = await fetch("/api/admin/mai-state" + (force ? "?refresh=1" : ""), { credentials: "include" });
      if (!r.ok) { root.innerHTML = `<div style="color:#c0392b; font-size:.84rem;">活動傾向を取得できませんでした (HTTP ${r.status})</div>`; return; }
      data = await r.json();
      render();
    } catch (e) {
      root.innerHTML = `<div style="color:#c0392b; font-size:.84rem;">通信エラー: ${esc(e.message)}</div>`;
    }
  }
  load(false);
})();
