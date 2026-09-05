/* webui/js/notification-stats.js
 *
 * 通知履歴の詳細統計パネル（ヒートマップの拡張タブ）
 *   - 月別の通知量（棒グラフ / 種別積み上げ切替）
 *   - 通知種別の内訳（ドーナツ + 凡例）
 *   - 曜日別の傾向（棒グラフ + 平均線）
 *   - 時間帯別の傾向（24時間の棒グラフ）
 *
 * 外部ライブラリ非依存（Canvas 2D のみ）。グローバル関数を1つだけ公開する。
 *   window.loadNotificationStats(containerId)
 *   window.redrawNotificationStats()   // タブ表示時の再描画用
 */
'use strict';

(function () {

  /* ===== プラットフォーム定義 ===== */
  const PLATFORM_META = {
    'twitcasting':       { label: 'ツイキャス',      color: '#00a0e9' },
    'youtube':           { label: 'YouTube',         color: '#ff0000' },
    'youtube-community': { label: 'YTコミュニティ',  color: '#ff7a7a' },
    'twitter-main':      { label: 'X（メイン）',     color: '#1d1d1f' },
    'twitter-sub':       { label: 'X（サブ）',       color: '#8e8e93' },
    'fanbox':            { label: 'FANBOX',          color: '#2e7bf6' },
    'twitch':            { label: 'Twitch',          color: '#9146ff' },
    'bilibili':          { label: 'bilibili',        color: '#00b5e5' },
    'milestone':         { label: '記念日',          color: '#e6a817' },
    'schedule':          { label: 'スケジュール',    color: '#b11e7c' },
    'gipt':              { label: 'GIPT',            color: '#16a085' },
    'system':            { label: 'システム／テスト', color: '#7f8c8d' },
    'unknown':           { label: 'その他',          color: '#b0a4ab' },
  };

  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  const THEME = {
    primary: '#b11e7c',
    primaryLight: '#f82cad',
    grid: 'rgba(177, 30, 124, .14)',
    axis: '#5c5c5c',
    weekend: '#f82cad',
  };

  // 直近N年のプリセット（0 = 全期間）。この後ろに暦年ボタンが並ぶ。
  const ROLLING_RANGES = [
    { years: 1, label: '直近1年' },
    { years: 2, label: '直近2年' },
    { years: 0, label: '全期間' },
  ];

  /* ===== 状態 ===== */
  const state = {
    containerId: null,
    range: { mode: 'rolling', years: 1, year: null },
    availableYears: [],
    monthlyMode: 'total',   // 'total' | 'type'
    data: null,
    loading: false,
    reqId: 0,
    buzzwords: null,
    buzzwordsLoading: false,
    buzzwordsExpanded: false,
  };

  const isActiveRange = (r) => (
    state.range.mode === 'year'
      ? (r.mode === 'year' && r.year === state.range.year)
      : (r.mode === 'rolling' && r.years === state.range.years)
  );

  function buzzwordsYear() {
    if (state.range.mode === 'year') return state.range.year;
    // rolling(直近N年)では最新年を採用（例: 直近1年(2025-08-30〜2026-08-29)なら2026年）
    return state.availableYears[0] || new Date().getFullYear();
  }

  /* ===== ユーティリティ ===== */
  const num = n => Number(n || 0).toLocaleString('ja-JP');
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function normalizePlatform(platform) {
    const s = String(platform || '').toLowerCase().trim();
    if (!s) return 'unknown';
    // ツイキャスは settingKey に screenId ("c:koinoya_mai") が保存されていた時期があるため両対応
    if (s.includes('twitcasting') || s.startsWith('c:')) return 'twitcasting';
    if (s.includes('youtube') && s.includes('community')) return 'youtube-community';
    if (s.includes('ytcommunity')) return 'youtube-community';
    if (s.includes('youtube')) return 'youtube';
    if (s.includes('fanbox') || s.includes('pixiv')) return 'fanbox';
    if (s.includes('twitter') || s.includes('x.com')) {
      return (s.includes('koinoyamai17') || s.includes('sub')) ? 'twitter-sub' : 'twitter-main';
    }
    if (s.includes('milestone') || s.includes('記念日')) return 'milestone';
    if (s.includes('schedule') || s.includes('スケジュール')) return 'schedule';
    if (s.includes('gipt')) return 'gipt';
    if (s.includes('twitch')) return 'twitch';
    if (s.includes('bilibili')) return 'bilibili';
    if (s === 'admin' || s === 'test' || s === 'event') return 'system';
    return 'unknown';
  }

  const metaOf = key => PLATFORM_META[key] || PLATFORM_META.unknown;

  /** 月キー "2026-08" -> 表示ラベル（年が変わる位置では年付き） */
  function monthLabel(key, withYear) {
    const [y, m] = key.split('-');
    return withYear ? `${y}/${m}` : `${Number(m)}月`;
  }

  const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

  /**
   * 目盛りが整数になるようにY軸のスケールを決める。
   * @returns {{max:number, step:number}}
   */
  function niceScale(maxVal, divisions) {
    const v = Math.max(maxVal, 1) / divisions;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const step = (NICE_STEPS.find(s => f <= s) || 10) * exp;
    return { max: step * divisions, step };
  }

  /** DPR対応でCanvasを準備。幅が0（非表示中）なら null を返す。 */
  function prepCanvas(canvas, height) {
    const wrap = canvas.parentElement;
    const W = Math.floor(wrap ? wrap.getBoundingClientRect().width : 0);
    if (!W) return null;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = height * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, height);
    return { ctx, W, H: height };
  }

  /** 角丸の上端だけ丸い矩形（棒グラフ用） */
  function barPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h));
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  /* ===== ツールチップ ===== */
  function tooltipEl() {
    let el = document.getElementById('ns-tooltip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ns-tooltip';
      el.className = 'ns-tooltip';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    return el;
  }

  function hideTooltip() {
    const el = document.getElementById('ns-tooltip');
    if (el) el.style.display = 'none';
  }

  /**
   * Canvasにホバー領域（canvas._hit = [{x,y,w,h,html}]）のツールチップを設定。
   * 円グラフ用に判定関数 hitTest(px, py) を渡すこともできる。
   */
  function attachHover(canvas, hitTest) {
    if (canvas._nsHoverBound) return;
    canvas._nsHoverBound = true;
    const tip = tooltipEl();

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      const hit = hitTest
        ? hitTest(canvas, cx, cy)
        : (canvas._hit || []).find(b => cx >= b.x && cx <= b.x + b.w && cy >= b.y - 6 && cy <= b.y + b.h + 6);
      if (!hit) { tip.style.display = 'none'; return; }
      tip.innerHTML = hit.html;
      tip.style.display = 'block';
      tip.style.left = (rect.left + window.scrollX + (hit.tx != null ? hit.tx : hit.x + hit.w / 2)) + 'px';
      tip.style.top = (rect.top + window.scrollY + (hit.ty != null ? hit.ty : hit.y)) + 'px';
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchmove', onMove, { passive: true });
    canvas.addEventListener('mouseleave', hideTooltip);
    canvas.addEventListener('touchend', hideTooltip);
  }

  /* ===== グラフ: 月別通知数 ===== */
  function drawMonthly() {
    const canvas = document.getElementById('ns-chart-monthly');
    if (!canvas) return;
    const months = state.data.monthly || [];
    if (!months.length) return;

    const c = prepCanvas(canvas, 200);
    if (!c) return;
    const { ctx, W, H } = c;

    const stacked = state.monthlyMode === 'type';
    const stacks = stacked ? buildMonthlyStacks(months) : null;

    const PAD = { t: 16, r: 10, b: 30, l: 44 };
    const CW = W - PAD.l - PAD.r;
    const CH = H - PAD.t - PAD.b;
    const scale = niceScale(Math.max(...months.map(m => m.count), 1), 4);
    const yMax = scale.max;
    const py = v => PAD.t + CH - (v / yMax) * CH;

    // グリッド + Y軸
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = scale.step * i;
      const y = py(v);
      ctx.strokeStyle = THEME.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + CW, y); ctx.stroke();
      ctx.fillStyle = THEME.axis;
      ctx.fillText(num(v), PAD.l - 5, y);
    }

    // 棒
    const slot = CW / months.length;
    const bw = Math.max(3, Math.min(slot * 0.68, 34));
    const hits = [];
    const labels = [];
    let prevYear = null;

    months.forEach((m, i) => {
      const x = PAD.l + slot * i + (slot - bw) / 2;
      const top = py(m.count);
      const h = PAD.t + CH - top;

      if (m.count > 0) {
        if (stacked) {
          // 種別ごとに積み上げ
          let acc = 0;
          (stacks.get(m.month) || []).forEach(seg => {
            const y0 = py(acc + seg.count);
            const y1 = py(acc);
            ctx.fillStyle = metaOf(seg.key).color;
            ctx.fillRect(x, y0, bw, Math.max(1, y1 - y0));
            acc += seg.count;
          });
        } else {
          const grad = ctx.createLinearGradient(0, top, 0, PAD.t + CH);
          grad.addColorStop(0, THEME.primaryLight);
          grad.addColorStop(1, THEME.primary);
          ctx.fillStyle = grad;
          barPath(ctx, x, top, bw, h, 3);
          ctx.fill();
        }
      }

      // X軸ラベル候補（年が変わる位置を優先して後段で衝突回避しながら描画）
      const [yy] = m.month.split('-');
      const isYearHead = yy !== prevYear;
      prevYear = yy;
      labels.push({ cx: x + bw / 2, text: monthLabel(m.month, isYearHead), isYearHead });

      const detail = stacked
        ? (stacks.get(m.month) || []).slice(0, 6)
            .map(s => `<span class="ns-tt-row"><i style="background:${metaOf(s.key).color}"></i>${metaOf(s.key).label} ${num(s.count)}</span>`)
            .join('')
        : '';
      hits.push({
        x: PAD.l + slot * i, y: Math.min(top, PAD.t + CH - 1), w: slot, h: Math.max(h, 1),
        tx: x + bw / 2, ty: top,
        html: `<strong>${num(m.count)} 件</strong><br>${m.month.replace('-', '年')}月${detail ? '<br>' + detail : ''}`,
      });
    });

    // X軸ラベル描画（年頭を優先、重なるものは間引く）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const placed = [];
    const tryDraw = (lb) => {
      ctx.font = lb.isYearHead ? 'bold 9px sans-serif' : '9px sans-serif';
      const half = ctx.measureText(lb.text).width / 2 + 3;
      // 端のラベルは見切れないよう内側に寄せる
      const cx = Math.min(Math.max(lb.cx, half), W - half);
      if (placed.some(p => cx - half < p.r && cx + half > p.l)) return;
      ctx.fillStyle = lb.isYearHead ? THEME.primary : THEME.axis;
      ctx.fillText(lb.text, cx, PAD.t + CH + 7);
      placed.push({ l: cx - half, r: cx + half });
    };
    labels.filter(l => l.isYearHead).forEach(tryDraw);
    const step = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(CW / 40))));
    labels.forEach((l, i) => { if (!l.isYearHead && i % step === 0) tryDraw(l); });

    canvas._hit = hits;
    attachHover(canvas);
  }

  /** monthlyByType を月キー -> [{key, count}] （降順）に変換 */
  function buildMonthlyStacks(months) {
    const map = new Map(months.map(m => [m.month, new Map()]));
    (state.data.monthlyByType || []).forEach(r => {
      const bucket = map.get(r.month);
      if (!bucket) return;
      const key = normalizePlatform(r.platform);
      bucket.set(key, (bucket.get(key) || 0) + r.count);
    });
    const out = new Map();
    map.forEach((bucket, month) => {
      out.set(month, Array.from(bucket, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count));
    });
    return out;
  }

  /* ===== グラフ: 通知種別（ドーナツ） ===== */
  function drawTypes() {
    const canvas = document.getElementById('ns-chart-types');
    if (!canvas) return;
    const types = aggregateTypes();
    if (!types.length) return;

    const c = prepCanvas(canvas, 190);
    if (!c) return;
    const { ctx, W, H } = c;

    const total = types.reduce((s, t) => s + t.count, 0) || 1;
    const cx = W / 2, cy = H / 2;
    const rOuter = Math.min(W, H) / 2 - 6;
    const rInner = rOuter * 0.6;

    let angle = -Math.PI / 2;
    const arcs = [];
    types.forEach(t => {
      const sweep = (t.count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, angle, angle + sweep);
      ctx.arc(cx, cy, rInner, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fillStyle = metaOf(t.key).color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      arcs.push({ from: angle, to: angle + sweep, t });
      angle += sweep;
    });

    // 中央：総数
    ctx.fillStyle = '#2c2c3e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(num(total), cx, cy + 2);
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#7a6a72';
    ctx.fillText('件', cx, cy + 15);

    canvas._arcs = arcs;
    canvas._geo = { cx, cy, rInner, rOuter, total };
    attachHover(canvas, (cv, px, py) => {
      const g = cv._geo;
      if (!g) return null;
      const dx = px - g.cx, dy = py - g.cy;
      const dist = Math.hypot(dx, dy);
      if (dist < g.rInner || dist > g.rOuter) return null;
      let a = Math.atan2(dy, dx);
      if (a < -Math.PI / 2) a += Math.PI * 2;
      const hit = (cv._arcs || []).find(s => a >= s.from && a < s.to);
      if (!hit) return null;
      const m = metaOf(hit.t.key);
      const pct = (hit.t.count / g.total * 100).toFixed(1);
      return {
        tx: px, ty: py - 8,
        html: `<span class="ns-tt-row"><i style="background:${m.color}"></i><strong>${m.label}</strong></span>${num(hit.t.count)} 件（${pct}%）`,
      };
    });
  }

  /** byType を正規化キーで集約（降順） */
  function aggregateTypes() {
    const map = new Map();
    (state.data.byType || []).forEach(r => {
      const key = normalizePlatform(r.platform);
      map.set(key, (map.get(key) || 0) + r.count);
    });
    return Array.from(map, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }

  /* ===== グラフ: 曜日別 ===== */
  function drawDow() {
    const canvas = document.getElementById('ns-chart-dow');
    if (!canvas) return;
    const rows = state.data.byDayOfWeek || [];
    if (!rows.length) return;

    const c = prepCanvas(canvas, 180);
    if (!c) return;
    const { ctx, W, H } = c;

    const PAD = { t: 16, r: 10, b: 30, l: 40 };
    const CW = W - PAD.l - PAD.r;
    const CH = H - PAD.t - PAD.b;
    const scale = niceScale(Math.max(...rows.map(r => r.count), 1), 4);
    const yMax = scale.max;
    const py = v => PAD.t + CH - (v / yMax) * CH;

    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = scale.step * i;
      const y = py(v);
      ctx.strokeStyle = THEME.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + CW, y); ctx.stroke();
      ctx.fillStyle = THEME.axis;
      ctx.fillText(num(v), PAD.l - 5, y);
    }

    const total = rows.reduce((s, r) => s + r.count, 0);
    const avg = total / 7;
    const maxCount = Math.max(...rows.map(r => r.count), 1);

    const slot = CW / 7;
    const bw = Math.min(slot * 0.6, 40);
    const hits = [];

    rows.forEach((r, i) => {
      const x = PAD.l + slot * i + (slot - bw) / 2;
      const top = py(r.count);
      const h = PAD.t + CH - top;
      const isWeekend = i === 0 || i === 6;
      const isPeak = r.count === maxCount && r.count > 0;

      if (r.count > 0) {
        const grad = ctx.createLinearGradient(0, top, 0, PAD.t + CH);
        grad.addColorStop(0, THEME.primaryLight);
        grad.addColorStop(1, THEME.primary);
        ctx.fillStyle = grad;
        barPath(ctx, x, top, bw, h, 4);
        ctx.fill();
      }
      if (isPeak) {
        ctx.fillStyle = THEME.primary;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('最多', x + bw / 2, top - 2);
      }

      ctx.fillStyle = isWeekend ? THEME.weekend : THEME.axis;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(DOW_LABELS[i], x + bw / 2, PAD.t + CH + 7);

      const share = total ? (r.count / total * 100).toFixed(1) : '0.0';
      hits.push({
        x: PAD.l + slot * i, y: Math.min(top, PAD.t + CH - 1), w: slot, h: Math.max(h, 1),
        tx: x + bw / 2, ty: top,
        html: `<strong>${DOW_LABELS[i]}曜日</strong><br>${num(r.count)} 件（${share}%）<br>1日あたり ${r.avg} 件`,
      });
    });

    // 平均線
    if (avg > 0) {
      const y = py(avg);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#e6a817';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + CW, y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#c98f0c';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('平均 ' + Math.round(avg), PAD.l + 3, y - 1);
    }

    canvas._hit = hits;
    attachHover(canvas);
  }

  /* ===== グラフ: 時間帯別 ===== */
  function drawHour() {
    const canvas = document.getElementById('ns-chart-hour');
    if (!canvas) return;
    const rows = state.data.byHour || [];
    if (!rows.length) return;

    const c = prepCanvas(canvas, 170);
    if (!c) return;
    const { ctx, W, H } = c;

    const PAD = { t: 14, r: 8, b: 26, l: 36 };
    const CW = W - PAD.l - PAD.r;
    const CH = H - PAD.t - PAD.b;
    const maxCount = Math.max(...rows.map(r => r.count), 1);
    const scale = niceScale(maxCount, 3);
    const yMax = scale.max;
    const py = v => PAD.t + CH - (v / yMax) * CH;
    const total = rows.reduce((s, r) => s + r.count, 0);

    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const v = scale.step * i;
      const y = py(v);
      ctx.strokeStyle = THEME.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + CW, y); ctx.stroke();
      ctx.fillStyle = THEME.axis;
      ctx.fillText(num(v), PAD.l - 5, y);
    }

    const slot = CW / 24;
    const bw = Math.max(2, slot * 0.66);
    const hits = [];

    rows.forEach((r, i) => {
      const x = PAD.l + slot * i + (slot - bw) / 2;
      const top = py(r.count);
      const h = PAD.t + CH - top;
      if (r.count > 0) {
        // 件数の多さで濃淡をつける
        const ratio = r.count / maxCount;
        ctx.fillStyle = `rgba(177, 30, 124, ${(0.3 + ratio * 0.7).toFixed(3)})`;
        barPath(ctx, x, top, bw, h, 2);
        ctx.fill();
      }
      if (i % 3 === 0) {
        ctx.fillStyle = THEME.axis;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(i), x + bw / 2, PAD.t + CH + 6);
      }
      const share = total ? (r.count / total * 100).toFixed(1) : '0.0';
      hits.push({
        x: PAD.l + slot * i, y: Math.min(top, PAD.t + CH - 1), w: slot, h: Math.max(h, 1),
        tx: x + bw / 2, ty: top,
        html: `<strong>${String(i).padStart(2, '0')}:00 〜 ${String(i).padStart(2, '0')}:59</strong><br>${num(r.count)} 件（${share}%）`,
      });
    });

    canvas._hit = hits;
    attachHover(canvas);
  }

  /* ===== 流行語 ===== */
  function buzzwordsBodyHtml() {
    if (state.buzzwordsLoading) {
      return '<div class="ns-buzzwords-loading"><span class="ns-skel ns-skel-title" style="width:160px"></span><div class="ns-buzzwords-skel">' + '<span class="ns-skel" style="height:18px"></span>'.repeat(5) + '</div></div>';
    }
    const bw = state.buzzwords;
    if (!bw) return '<p class="ns-buzzwords-empty">読み込み中…</p>';
    if (!bw.buzzwords || !bw.buzzwords.length) {
      return `<p class="ns-buzzwords-empty">この年はまだ十分な字幕データがありません<br><small>${bw.total_videos || 0}本の動画</small></p>`;
    }
    const y = bw.year;
    const list = state.buzzwordsExpanded ? bw.buzzwords : bw.buzzwords.slice(0, 10);
    const maxScore = list[0]?.score || 100;
    const html = '<ul class="ns-buzzwords-list" role="list">' + list.map(item => {
      const pct = Math.max(8, (item.score / maxScore) * 100);
      const href = `/archive.php?q=${encodeURIComponent(item.word)}`;
      const ex = item.examples && item.examples.length
        ? `<span class="ns-bw-ex">${item.examples.map(e => `<a href="${esc(e.url)}" target="_blank" rel="noopener" title="${esc(e.title)}">${esc(e.title.slice(0, 22))}${e.title.length > 22 ? '…' : ''}</a>`).join('<span class="ns-bw-ex-sep"> / </span>')}</span>`
        : '';
      return `<li class="ns-buzzwords-item${ex ? ' has-ex' : ''}">`
        + `<span class="ns-bw-rank">${item.rank}</span>`
        + `<a class="ns-bw-word" href="${href}" target="_blank" rel="noopener">${esc(item.word)}</a>`
        + `<span class="ns-bw-bar"><i style="width:${pct.toFixed(1)}%"></i></span>`
        + `<span class="ns-bw-count">${num(item.count)}<em>回</em></span>`
        + ex
        + `</li>`;
    }).join('') + '</ul>';
    const meta = `<div class="ns-buzzwords-meta">${y}年 ${bw.total_videos}本の動画から抽出${bw.updated_at ? ` · 更新 ${bw.updated_at.slice(0,10)}` : ''}</div>`;
    const more = bw.buzzwords.length > 10
      ? `<button type="button" class="ns-buzzwords-more" data-expand="${state.buzzwordsExpanded ? '0' : '1'}">${state.buzzwordsExpanded ? '閉じる' : `もっと見る（あと${bw.buzzwords.length - 10}語）`}</button>`
      : '';
    return meta + html + more;
  }

  async function loadBuzzwords() {
    const y = buzzwordsYear();
    if (!y) return;
    // キャッシュが同じ年なら再取得しない
    if (state.buzzwords && state.buzzwords.year === y && !state.buzzwordsLoading) return;
    state.buzzwordsLoading = true;
    // 既に描画済みならローディング表示を差し込む
    const body = document.getElementById('ns-buzzwords-body');
    if (body) body.innerHTML = buzzwordsBodyHtml();
    try {
      const res = await fetch(`/api/buzzwords?year=${y}&top=100`);
      if (!res.ok) throw new Error('buzzwords ' + res.status);
      const data = await res.json();
      // yearが単年の場合と全年分の場合で形が違うので正規化
      if (data.buzzwords) {
        state.buzzwords = data;
      } else if (data.by_year) {
        const arr = data.by_year[String(y)] || [];
        state.buzzwords = { year: y, buzzwords: arr, total_videos: data.total_videos_by_year?.[String(y)] || 0, updated_at: data.updated_at, available_years: data.available_years };
      } else {
        state.buzzwords = data;
      }
    } catch (e) {
      console.error('Failed to load buzzwords:', e);
      state.buzzwords = { year: y, buzzwords: [], total_videos: 0, error: String(e) };
    } finally {
      state.buzzwordsLoading = false;
      const body2 = document.getElementById('ns-buzzwords-body');
      if (body2) {
        body2.innerHTML = buzzwordsBodyHtml();
        const container = document.getElementById(state.containerId);
        if (container) bindBuzzwords(container);
      }
    }
  }

  /* ===== HTML 組み立て ===== */
  function summaryHtml() {
    const s = state.data.summary || {};
    const types = aggregateTypes();
    const dow = state.data.byDayOfWeek || [];
    const hours = state.data.byHour || [];

    const topType = types[0];
    const topDow = dow.reduce((a, r) => (!a || r.count > a.count ? r : a), null);
    const topHour = hours.reduce((a, r) => (!a || r.count > a.count ? r : a), null);

    const cards = [
      { v: num(s.total), l: '通知総数' },
      { v: num(s.activeDays), l: '通知のあった日数' },
      { v: (s.avgPerDay ?? 0).toFixed(1), l: '1日平均' },
      s.currentStreak != null ? { v: num(s.currentStreak), l: '現在の連続日数', unit: '日' } : null,
      { v: num(s.longestStreak), l: '最長の連続日数', unit: '日' },
      s.busiestDay
        ? { v: num(s.busiestDay.count), l: '最多の日<br><small>' + s.busiestDay.date + '</small>' }
        : null,
      topType ? { v: metaOf(topType.key).label, l: '最多の種別', small: true } : null,
      topDow ? { v: DOW_LABELS[topDow.dow] + '曜', l: '最も多い曜日' } : null,
      topHour ? { v: String(topHour.hour).padStart(2, '0') + '時', l: '最も多い時間帯' } : null,
    ].filter(Boolean);

    return '<div class="ns-summary">' + cards.map(c =>
      `<div class="ns-stat"><span class="ns-stat-val${c.small ? ' is-text' : ''}">${c.v}${c.unit ? '<em>' + c.unit + '</em>' : ''}</span><span class="ns-stat-label">${c.l}</span></div>`
    ).join('') + '</div>';
  }

  function typeLegendHtml() {
    const types = aggregateTypes();
    const total = types.reduce((s, t) => s + t.count, 0) || 1;
    const max = types[0] ? types[0].count : 1;
    return '<ul class="ns-legend" role="list">' + types.map(t => {
      const m = metaOf(t.key);
      const pct = (t.count / total * 100).toFixed(1);
      return `<li class="ns-legend-item">
        <span class="ns-legend-dot" style="background:${m.color}"></span>
        <span class="ns-legend-name">${m.label}</span>
        <span class="ns-legend-bar"><i style="width:${(t.count / max * 100).toFixed(1)}%;background:${m.color}"></i></span>
        <span class="ns-legend-val">${num(t.count)}<em>${pct}%</em></span>
      </li>`;
    }).join('') + '</ul>';
  }

  function rangeHtml() {
    const items = ROLLING_RANGES.map(r => ({ mode: 'rolling', years: r.years, year: null, label: r.label }))
      .concat(state.availableYears.map(y => ({ mode: 'year', years: null, year: y, label: `${y}年` })));

    return '<div class="ns-range" role="group" aria-label="集計期間">' + items.map(r => {
      const on = isActiveRange(r);
      const attr = r.mode === 'year' ? `data-year="${r.year}"` : `data-years="${r.years}"`;
      return `<button type="button" class="ns-range-btn${on ? ' is-active' : ''}${r.mode === 'year' ? ' is-year' : ''}" ${attr} aria-pressed="${on}">${r.label}</button>`;
    }).join('') + '</div>';
  }

  function render(container) {
    const s = state.data.summary || {};

    if (!s.total) {
      const win = (s.rangeStart && s.rangeEnd) ? `<br><small>${s.rangeStart} 〜 ${s.rangeEnd}</small>` : '';
      container.innerHTML = `<div class="ns-root">${rangeHtml()}<p class="ns-empty">この期間の通知データはまだありません${win}</p></div>`;
      bindRange(container);
      return;
    }

    // 集計対象の期間そのもの（データの有無に関係なく実際に見ている窓）
    const period = (s.rangeStart && s.rangeEnd)
      ? `${s.rangeStart} 〜 ${s.rangeEnd}`
      : (s.firstDate && s.lastDate ? `${s.firstDate} 〜 ${s.lastDate}` : '');

    container.innerHTML = `
      <div class="ns-root">
        <div class="ns-toolbar">
          ${rangeHtml()}
          ${period ? `<span class="ns-period">${period}</span>` : ''}
        </div>
        <p class="ns-note">記念日・システム通知は集計から除外しています</p>

        ${summaryHtml()}

        <section class="ns-card">
          <div class="ns-card-head">
            <h3 class="ns-card-title">月ごとの通知量</h3>
            <div class="ns-seg" role="group" aria-label="月別グラフの表示切替">
              <button type="button" class="ns-seg-btn${state.monthlyMode === 'total' ? ' is-active' : ''}" data-mode="total" aria-pressed="${state.monthlyMode === 'total'}">合計</button>
              <button type="button" class="ns-seg-btn${state.monthlyMode === 'type' ? ' is-active' : ''}" data-mode="type" aria-pressed="${state.monthlyMode === 'type'}">種別</button>
            </div>
          </div>
          <div class="ns-canvas-wrap"><canvas id="ns-chart-monthly" role="img" aria-label="月別の通知件数グラフ"></canvas></div>
        </section>

        <section class="ns-card">
          <div class="ns-card-head"><h3 class="ns-card-title">通知種別の内訳</h3></div>
          <div class="ns-type-layout">
            <div class="ns-canvas-wrap ns-donut-wrap"><canvas id="ns-chart-types" role="img" aria-label="通知種別の内訳グラフ"></canvas></div>
            ${typeLegendHtml()}
          </div>
        </section>

        <section class="ns-card">
          <div class="ns-card-head"><h3 class="ns-card-title">曜日ごとの傾向</h3></div>
          <div class="ns-canvas-wrap"><canvas id="ns-chart-dow" role="img" aria-label="曜日別の通知件数グラフ"></canvas></div>
        </section>

        <section class="ns-card">
          <div class="ns-card-head"><h3 class="ns-card-title">時間帯ごとの傾向<span class="ns-card-note">（時・JST）</span></h3></div>
          <div class="ns-canvas-wrap"><canvas id="ns-chart-hour" role="img" aria-label="時間帯別の通知件数グラフ"></canvas></div>
        </section>

        <section class="ns-card ns-buzzwords-card">
          <div class="ns-card-head"><h3 class="ns-card-title">年間流行語<span class="ns-card-note">（字幕から抽出）</span></h3></div>
          <div id="ns-buzzwords-body">${buzzwordsBodyHtml()}</div>
        </section>
      </div>`;

    bindRange(container);
    bindSeg(container);
    bindBuzzwords(container);
    drawAll();
    // 流行語は年が確定してから非同期で取得（統計の availableYears が必要）
    loadBuzzwords();
  }

  function bindRange(container) {
    container.querySelectorAll('.ns-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.year != null
          ? { mode: 'year', years: null, year: parseInt(btn.dataset.year, 10) }
          : { mode: 'rolling', years: parseInt(btn.dataset.years, 10), year: null };
        if (isActiveRange(next)) return;
        state.range = next;
        state.buzzwordsExpanded = false;
        load(container, true);
      });
    });
  }

  function bindBuzzwords(container) {
    const body = container.querySelector('#ns-buzzwords-body');
    if (!body) return;
    body.querySelectorAll('.ns-buzzwords-more').forEach(btn => {
      btn.addEventListener('click', () => {
        state.buzzwordsExpanded = !state.buzzwordsExpanded;
        body.innerHTML = buzzwordsBodyHtml();
        bindBuzzwords(container);
      });
    });
  }

  function bindSeg(container) {
    container.querySelectorAll('.ns-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === state.monthlyMode) return;
        state.monthlyMode = mode;
        container.querySelectorAll('.ns-seg-btn').forEach(b => {
          const on = b.dataset.mode === mode;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        drawMonthly();
      });
    });
  }

  function drawAll() {
    drawMonthly();
    drawTypes();
    drawDow();
    drawHour();
  }

  function renderSkeleton(container) {
    container.innerHTML = `
      <div class="ns-root is-loading">
        <div class="ns-toolbar">${rangeHtml()}</div>
        <div class="ns-summary">${'<div class="ns-stat"><span class="ns-skel ns-skel-val"></span><span class="ns-skel ns-skel-label"></span></div>'.repeat(6)}</div>
        ${'<section class="ns-card"><div class="ns-card-head"><span class="ns-skel ns-skel-title"></span></div><div class="ns-skel ns-skel-chart"></div></section>'.repeat(4)}
      </div>`;
    bindRange(container);
  }

  /* ===== データ取得 ===== */
  async function load(container, keepScroll) {
    const id = ++state.reqId;
    state.loading = true;
    const y = container.scrollTop;
    renderSkeleton(container);
    if (keepScroll) container.scrollTop = y;

    const q = state.range.mode === 'year'
      ? `year=${state.range.year}`
      : `years=${state.range.years}`;

    try {
      const res = await fetch(`/api/notifications/stats/detail?${q}`);
      if (!res.ok) throw new Error('API error ' + res.status);
      const data = await res.json();
      if (id !== state.reqId) return; // 期間を連打された場合は古い応答を破棄
      state.data = data;
      if (Array.isArray(data.availableYears)) state.availableYears = data.availableYears;
      render(container);
    } catch (e) {
      if (id !== state.reqId) return;
      console.error('Failed to load notification stats:', e);
      container.innerHTML = `<div class="ns-root">${rangeHtml()}<p class="ns-empty">統計データの読み込みに失敗しました</p></div>`;
      bindRange(container);
    } finally {
      if (id === state.reqId) state.loading = false;
    }
  }

  /* ===== リサイズ対応 ===== */
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!state.data) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { hideTooltip(); drawAll(); }, 180);
  });

  /* ===== 公開API ===== */

  /** 統計パネルを読み込む（初回のみ通信、以降は再描画のみ） */
  function loadNotificationStats(containerId) {
    const container = document.getElementById(containerId || 'notification-stats');
    if (!container) return;
    state.containerId = container.id;
    if (state.data || state.loading) { drawAll(); return; }
    load(container, false);
  }

  /** タブ表示直後など、幅が確定したタイミングでの再描画用 */
  function redrawNotificationStats() {
    if (state.data) drawAll();
  }

  window.loadNotificationStats = loadNotificationStats;
  window.redrawNotificationStats = redrawNotificationStats;

})();
