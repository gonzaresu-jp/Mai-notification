// admin「まいAI」タブ ツイート統計カード＋SVGグラフ描画
(function () {
  const PRIMARY = "#B11E7C";
  const SUB = "#7F2534";
  const root = document.getElementById("tw-stats");
  if (!root) return;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function pct(n, total) { return total ? (Math.round((n / total) * 1000) / 10) : 0; }

  // 横棒グラフ（rows: [{label, value, max}]）
  function barSvg(rows, opts) {
    const o = Object.assign({ w: 760, rowH: 20, unit: "", max: null }, opts || {});
    const max = o.max || Math.max(1, ...rows.map(r => r.value));
    const labelW = 92, valueW = 54;
    const w = o.w, h = rows.length * o.rowH + 6;
    let bars = "";
    rows.forEach((r, i) => {
      const y = i * o.rowH + 3;
      const bw = Math.max(1, ((w - labelW - valueW - 16) * r.value) / max);
      const color = r.color || PRIMARY;
      bars += `<text x="${labelW - 8}" y="${y + 14}" text-anchor="end" font-size="12" fill="#555">${esc(r.label)}</text>` +
        `<rect x="${labelW}" y="${y}" width="${bw.toFixed(1)}" height="14" rx="3" fill="${color}" opacity=".85"></rect>` +
        `<text x="${w - 2}" y="${y + 14}" text-anchor="end" font-size="12" fill="#333">${esc(r.value)}${esc(o.unit)}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;" role="img">${bars}</svg>`;
  }

  // 縦棒グラフ（24時間ヒストグラム用）
  function hourSvg(hours, weekdaysJa) {
    const w = 760, h = 150, padL = 28, padB = 18;
    const max = Math.max(1, ...hours);
    const bw = (w - padL - 8) / 24;
    let bars = "";
    hours.forEach((v, i) => {
      const bh = Math.max(1, ((h - padB - 14) * v) / max);
      const x = padL + i * bw + 2;
      bars += `<rect x="${x.toFixed(1)}" y="${(h - padB - bh).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${PRIMARY}" opacity=".85"></rect>` +
        `<text x="${(x + bw / 2 - 2).toFixed(1)}" y="${h - 4}" text-anchor="middle" font-size="9" fill="#666">${i}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;" role="img" aria-label="時間帯別投稿数">${bars}</svg>`;
  }

  // 月別縦棒
  function monthSvg(months) {
    const entries = Object.entries(months);
    if (!entries.length) return "";
    const w = 760, h = 130, padL = 34, padB = 16;
    const max = Math.max(1, ...entries.map(e => e[1]));
    const bw = (w - padL - 8) / entries.length;
    let bars = "";
    entries.forEach(([m, v], i) => {
      const bh = Math.max(1, ((h - padB - 14) * v) / max);
      const x = padL + i * bw + 2;
      bars += `<rect x="${x.toFixed(1)}" y="${(h - padB - bh).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${SUB}" opacity=".8"></rect>` +
        `<text x="${(x + bw / 2 - 2).toFixed(1)}" y="${h - 4}" text-anchor="middle" font-size="9" fill="#666">${esc(m.slice(2))}</text>` +
        `<text x="${(x + bw / 2 - 2).toFixed(1)}" y="${(h - padB - bh - 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#333">${v}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;" role="img">${bars}</svg>`;
  }

  // 積み上げ横棒（感情×期間の交差）。rows: [{label, slot:{POSITIVE,NEUTRAL,NEGATIVE}}]
  function sentiStackSvg(rows, opts) {
    const o = Object.assign({ w: 760, rowH: 18 }, opts || {});
    const max = Math.max(1, ...rows.map(r => (r.slot.POSITIVE + r.slot.NEUTRAL + r.slot.NEGATIVE)));
    const labelW = o.labelW || 96, valueW = 96;
    let bars = "";
    rows.forEach((r, i) => {
      const y = i * o.rowH + 3;
      const total = r.slot.POSITIVE + r.slot.NEUTRAL + r.slot.NEGATIVE;
      if (!total) return;
      const iw = (w - labelW - valueW - 6) / max;
      bars += `<text x="${labelW - 8}" y="${y + 13}" text-anchor="end" font-size="12" fill="#555">${esc(r.label)}</text>`;
      for (const k of ["POSITIVE", "NEUTRAL", "NEGATIVE"]) {
        const n = r.slot[k] || 0;
        if (!n) continue;
        bars += `<rect x="${labelW}" y="${y}" width="${(n * iw).toFixed(1)}" height="${o.rowH - 4}" fill="${k === "POSITIVE" ? "#e06b9a" : k === "NEGATIVE" ? "#667eea" : "#c9c3cf"}" opacity=".85"></rect>`;
      }
      const ns = Math.round((r.slot.POSITIVE - r.slot.NEGATIVE) / total * 100) / 100;
      bars += `<text x="${w - 2}" y="${y + 13}" text-anchor="end" font-size="12" fill="#333">±${ns >= 0 ? "+" : ""}${ns.toFixed(2)} (${total})</text>`;
    });
    const h = rows.length * o.rowH + 6;
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;" role="img">${bars}</svg>`;
  }

  function card(title, icon, value, note) {
    return `<div style="flex:1; min-width:150px; background:#faf5f8; border:1px solid #f0dae4; border-radius:12px; padding:12px 14px;">
      <div style="font-size:.76rem; color:#8a5570; font-weight:700;"><i class="fa-solid ${icon}"></i> ${esc(title)}</div>
      <div style="font-size:1.5rem; font-weight:800; color:#2c2c3e; line-height:1.3;">${esc(value)}</div>
      <div style="font-size:.72rem; color:#999;">${esc(note)}</div>
    </div>`;
  }

  function block(title, inner) {
    return `<div style="background:#fff; border:1px solid #eee; border-radius:12px; padding:12px 14px;">
      <div style="font-weight:800; font-size:.9rem; color:${SUB}; margin-bottom:6px;">${esc(title)}</div>
      ${inner}
    </div>`;
  }

  function render(s) {
    const days = s.range.from && s.range.to ? s.range.from + " 〜 " + s.range.to : "-";
    const posN = Object.values(s.analysis.sentiment).reduce((a, b) => a + b, 0);
    const cards = `<div style="display:flex; gap:10px; flex-wrap:wrap;">` +
      card("総ツイート", "fa-feather", s.total.toLocaleString("ja-JP") + "件", `${s.main} Main / ${s.sub} Sub`) +
      card("画像付き", "fa-image", (s.total ? Math.round((s.withImage / s.total) * 1000) / 10 : 0) + "%", `${s.withImage} 件`) +
      card("POSITIVE", "fa-face-smile", (posN ? Math.round((s.analysis.sentiment.POSITIVE / posN) * 1000) / 10 : 0) + "%", `分析 ${s.analysis.assigned}/${s.total} (${s.analysis.coverage}%)`) +
      card("配信告知率", "fa-video", s.analysis.liveRate + "%", `LIVE告知 ${s.analysis.categories.LIVE || 0} 件`) +
      `</div>`;

    const hourRows = s.hours.map((v, i) => ({ label: i % 3 === 0 ? i + "時" : "", value: v }));
    const hoursBlock = block("時間帯別（JST）", hourSvg(s.hours) + `<div style="color:#777; font-size:.72rem;">ピーク: ${s.hours.indexOf(Math.max(...s.hours))}時台（${Math.max(...s.hours)}件）</div>`);
    const monthBlock = block("月別投稿数", monthSvg(s.months));

    const wdRows = s.weekdays.map((v, i) => ({ label: s.weekdaysJa[i], value: v, color: i === 0 || i === 6 ? SUB : PRIMARY }));
    const weekdayBlock = block("曜日別", barSvg(wdRows, { rowH: 18 }));

    const linkRows = Object.entries(s.links).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: k, value: v }));
    const linkBlock = block("リンク付きツイート", linkRows.length ? barSvg(linkRows, { rowH: 18, max: Math.max(...linkRows.map(r => r.value)) }) : "<div style='font-size:.84rem;color:#999;'>なし</div>");

    const catLabels = { LIVE: "配信", DAILY: "雑談", NEWS: "お知らせ", PROMOTION: "グッズ宣伝", MORNING: "あいさつ", OTHER: "その他", REPOST: "リポスト" };
    const catRows = Object.entries(s.analysis.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: (catLabels[k] || k), value: v }));
    const sentiLabels = { POSITIVE: "POSITIVE", NEUTRAL: "NEUTRAL", NEGATIVE: "NEGATIVE" };
    const sentiColors = { POSITIVE: "#e06b9a", NEUTRAL: "#aaa2ad", NEGATIVE: "#667eea" };
    const sentiRows = Object.entries(s.analysis.sentiment).map(([k, v]) => ({ label: sentiLabels[k] || k, value: v, color: sentiColors[k] }));

    const phraseRows = Object.entries(s.phrases).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }));
    const phraseBlock = block("フレーズ使用数", barSvg(phraseRows, { rowH: 18 }));

    const tagInner = s.tags.length ? s.tags.map(t => `<span style="display:inline-block; background:#f7e9f0; color:${SUB}; font-size:.76rem; padding:3px 10px; border-radius:999px; margin:0 6px 6px 0;">${esc(t.tag)} <b>${t.count}</b></span>`).join("") : "<div style='color:#999;font-size:.84rem;'>なし</div>";
    const tagBlock = block("ハッシュタグ Top", `<div>${tagInner}</div>`);

    const catBlock = catRows.length ? block("分析ラベル — カテゴリ", barSvg(catRows, { rowH: 18 })) : "";
    const sentiBlock = sentiRows.length ? block("感情（sentiment）", barSvg(sentiRows, { rowH: 18 })) : "";

    // 感情×時期の交差（いつ どの時間帯に POSITIVE/NEGATIVE が集中するか）
    const byMonthRows = Object.entries(s.analysis.byMonth).sort().map(([m, slot]) => ({ label: m, slot }));
    const monthSenti = byMonthRows.length
      ? block("感情 × 月（積み上げ: ポジ/グレー/ネガ・右の±は POSITIVE−NEGATIVE インデックス）", sentiStackSvg(byMonthRows)) : "";
    const byHourRows = Object.keys(s.analysis.byHour).map(Number).sort((a, b) => a - b).map(h => ({
      label: (String(h).padStart(2) + "時"), slot: s.analysis.byHour[String(h)] || s.analysis.byHour[h]
    }));
    const hourSenti = byHourRows.length ? block("感情 × 時間帯（JST・± 低い時帯ほどネガティブ寄り）", sentiStackSvg(byHourRows, { labelW: 46, rowH: 16 })) : "";
    const byWdRows = [0, 1, 2, 3, 4, 5, 6].filter(d => s.analysis.byWeekday[d]).map(d => ({ label: s.weekdaysJa[d], slot: s.analysis.byWeekday[d] }));
    const wdSenti = byWdRows.length ? block("感情 × 曜日", sentiStackSvg(byWdRows, { labelW: 40, rowH: 16 })) : "";
    const catLabelJa = { LIVE: "配信", DAILY: "雑談", NEWS: "お知らせ", PROMOTION: "グッズ", MORNING: "あいさつ", OTHER: "その他", REPOST: "リポスト" };
    const catSentiRows = Object.entries(s.analysis.byCategory).sort((a, b) => (b[1].POSITIVE + b[1].NEGATIVE) - (a[1].POSITIVE + a[1].NEGATIVE)).map(([k, slot]) => ({ label: catLabelJa[k] || k, slot }));
    const catSenti = catSentiRows.length ? block("感情 × カテゴリ（雑談のネガティブが目立つ傾向）", sentiStackSvg(catSentiRows, { rowH: 16 })) : "";

    root.innerHTML =
      cards +
      hoursBlock +
      monthBlock +
      weekdayBlock +
      (catRows.length ? catBlock : "") +
      (sentiRows.length ? sentiBlock : "") +
      monthSenti +
      hourSenti +
      wdSenti +
      catSenti +
      phraseBlock +
      linkBlock +
      tagBlock;
  }

  (async () => {
    try {
      const r = await fetch("/api/admin/twitter/stats", { credentials: "include" });
      if (!r.ok) { root.innerHTML = `<div style="color:#c0392b; font-size:.84rem;">統計を取得できませんでした (HTTP ${r.status})</div>`; return; }
      render(await r.json());
    } catch (e) {
      root.innerHTML = `<div style="color:#c0392b; font-size:.84rem;">通信エラー: ${esc(e.message)}</div>`;
    }
  })();
})();
