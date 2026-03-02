/**
 * subscribers.v2.0.js
 * チャンネル登録者数グラフ描画
 *
 * ■ txtファイルの配置場所
 *   /data/subscribers/youtube.txt
 *   /data/subscribers/twitch.txt
 *   /data/subscribers/twitcasting.txt
 *   /data/subscribers/bilibili.txt
 *   /data/subscribers/twitter.txt
 *
 *   ファイルが存在しないプラットフォームは自動的に「データなし」扱い。
 *
 * ■ txtフォーマット（channel.txt と同じ形式）
 *   YYYY/MM/DD:数値
 *   数値の単位はプラットフォームごとに PLATFORMS の unit で設定。
 *
 *   例（万人単位）:
 *     2021/03/23:0.7
 *     2025/02/10:30.0
 *
 *   例（人単位）:
 *     2024/01/01:5200
 *     2025/01/01:8300
 *
 * ■ txtファイルパスを変えたい場合
 *   下の PLATFORMS[].path を変更してください。
 */

'use strict';

(function () {

  /* ===== プラットフォーム定義 ===== */
  const PLATFORMS = [
    {
      id:       'youtube-main',
      label:    'YouTube-main',
      path:     '/data/koinoyamaich.txt',
      color:    '#FF0000',
      unit:     '万人',       // グラフ・ツールチップに表示する単位
      isMan:    true,          // true = 万単位の小数値、false = 整数の人数
      milestones: [10, 20, 30], // 縦線を引く値（万単位 or 人単位で揃える）
      debutDate: '2021/03/23',
    },
    {
      id:       'youtube-sub',
      label:    'YouTube-sub',
      path:     '/data/koinoyamaisub.txt',
      color:    '#FF0000',
      unit:     '万人',
      isMan:    true,
      milestones: [0.5, 1.0, 2.0],
      debutDate: null,
    },
    {
      id:       'twitch',
      label:    'Twitch',
      path:     '/data/subscribers/twitch.txt',
      color:    '#9146FF',
      unit:     '人',
      isMan:    false,
      milestones: [1000, 5000, 10000],
      debutDate: null,
    },
  ];

  /* ===== 状態 ===== */
  const dataCache  = {};   // { platformId: [ {date, val}, ... ] }
  let activePlatform = 'youtube-main';
  let activeRange    = 'all';

  /* ===== テキスト解析 ===== */
  function parseTxt(text) {
    return text.trim().split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const [date, rawVal] = line.split(':');
        return { date: date.trim(), val: parseFloat(rawVal) };
      })
      .filter(d => d.date && !isNaN(d.val));
  }

  /* ===== txtファイルの取得 ===== */
  async function loadPlatform(platform) {
    if (dataCache[platform.id] !== undefined) return;
    try {
      const res = await fetch(platform.path, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      dataCache[platform.id] = parseTxt(text);
    } catch {
      dataCache[platform.id] = []; // データなし
    }
  }

  /* ===== 数値フォーマット ===== */
  function formatVal(val, platform) {
    if (platform.isMan) {
      return val.toFixed(1) + ' ' + platform.unit;
    }
    // 人単位：3桁区切り
    return val.toLocaleString() + ' ' + platform.unit;
  }

  function formatTabCount(data, platform) {
    if (!data || data.length === 0) return '--';
    const last = data[data.length - 1].val;
    if (platform.isMan) return last.toFixed(1) + '万';
    if (last >= 10000)  return (last / 10000).toFixed(1) + '万';
    return last.toLocaleString();
  }

  /* ===== タブのカウント表示を更新 ===== */
  function updateTabCount(platform) {
    const el = document.getElementById('sub-count-' + platform.id);
    if (!el) return;
    const data = dataCache[platform.id] || [];
    el.textContent = formatTabCount(data, platform);

    // データが空のタブは薄くする
    const tab = el.closest('.sub-tab');
    if (tab) {
      if (data.length === 0) {
        tab.classList.add('no-data');
      } else {
        tab.classList.remove('no-data');
      }
    }
  }

  /* ===== 記録カード更新 ===== */
  function updateRecords(platform) {
    const data = dataCache[platform.id] || [];

    const daysEl  = document.getElementById('sub-rec-days');
    const peakEl  = document.getElementById('sub-rec-peak');
    const peakUnit = document.getElementById('sub-rec-peak-unit');
    const countEl = document.getElementById('sub-rec-count');

    if (countEl) countEl.textContent = data.length || '--';

    if (!data.length) {
      if (daysEl)  daysEl.textContent  = '--';
      if (peakEl)  peakEl.textContent  = '--';
      return;
    }

    const peak = data.reduce((a, b) => b.val > a.val ? b : a);
    if (peakEl)  peakEl.textContent  = platform.isMan ? peak.val.toFixed(1) : peak.val.toLocaleString();
    if (peakUnit) peakUnit.textContent = platform.unit;

    if (daysEl) {
      if (platform.debutDate) {
        const start  = dateToMs(platform.debutDate);
        const peakMs = dateToMs(peak.date);
        const days   = Math.round((peakMs - start) / 86400_000);
        daysEl.textContent = days.toLocaleString();
      } else {
        daysEl.textContent = '--';
      }
    }
  }

  /* ===== 期間フィルター ===== */
  function dateToMs(str) {
    const [y, m, d] = str.split('/').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function filterByRange(data, range) {
    if (range === 'all') return data;
    if (!data.length) return data;
    // 現在時刻ではなくデータの最新日を基準にする
    // （最終更新から時間が経っていても直近の推移が見られるように）
    const latestMs = dateToMs(data[data.length - 1].date);
    const delta    = { '1y': 365, '6m': 180, '3m': 90 }[range] * 86400_000;
    return data.filter(d => dateToMs(d.date) >= latestMs - delta);
  }

  /* ===== Canvas グラフ描画 ===== */
  function drawChart(data, platform) {
    const canvas  = document.getElementById('sub-main-canvas');
    const noData  = document.getElementById('sub-no-data');
    if (!canvas) return;

    if (!data || data.length < 2) {
      canvas.style.display = 'none';
      if (noData) noData.style.display = '';
      return;
    }
    canvas.style.display = '';
    if (noData) noData.style.display = 'none';

    const dpr  = window.devicePixelRatio || 1;
    const W    = (canvas.parentElement.getBoundingClientRect().width || 300);
    const H    = 160;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const PAD  = { t: 14, r: 10, b: 26, l: platform.isMan ? 42 : 58 };
    const CW   = W - PAD.l - PAD.r;
    const CH   = H - PAD.t - PAD.b;

    const xs   = data.map(d => dateToMs(d.date));
    const ys   = data.map(d => d.val);
    const xMin = xs[0], xMax = xs[xs.length - 1];
    const yMax = roundUpNice(Math.max(...ys));
    const yMin = 0;

    const px = x => PAD.l + ((x - xMin) / (xMax - xMin || 1)) * CW;
    const py = y => PAD.t + CH - ((y - yMin) / (yMax - yMin)) * CH;
    const color = platform.color;

    /* グリッド & Y軸ラベル */
    ctx.strokeStyle  = '#868686';
    ctx.lineWidth    = 1;
    ctx.fillStyle    = '#585858';
    ctx.font         = '9px sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';

    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const v = Math.round(yMax * i / gridCount);
      const y = py(v);
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + CW, y); ctx.stroke();

      let lbl;
      if (platform.isMan) {
        lbl = v === 0 ? '0' : v + '万';
      } else {
        lbl = v >= 10000 ? (v / 10000).toFixed(1) + '万' : v.toLocaleString();
      }
      ctx.fillText(lbl, PAD.l - 4, y);
    }

    /* X軸ラベル */
    ctx.fillStyle    = '#5c5c5c';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    const step = Math.max(1, Math.floor(xs.length / 5));
    const shownX = new Set();
    for (let i = 0; i < xs.length; i += step) {
      const d   = new Date(xs[i]);
      const lbl = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const x   = px(xs[i]);
      if (!shownX.has(lbl)) { ctx.fillText(lbl, x, H - PAD.b + 4); shownX.add(lbl); }
    }
    // 末尾
    {
      const d   = new Date(xs[xs.length - 1]);
      const lbl = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!shownX.has(lbl)) ctx.fillText(lbl, px(xs[xs.length - 1]), H - PAD.b + 4);
    }

    /* グラデーション塗り */
    const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + CH);
    grad.addColorStop(0, color + '44');
    grad.addColorStop(1, color + '05');
    ctx.beginPath();
    ctx.moveTo(px(xs[0]), py(0));
    xs.forEach((x, i) => ctx.lineTo(px(x), py(ys[i])));
    ctx.lineTo(px(xs[xs.length - 1]), py(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    /* 折れ線 */
    ctx.beginPath();
    xs.forEach((x, i) => i === 0 ? ctx.moveTo(px(x), py(ys[i])) : ctx.lineTo(px(x), py(ys[i])));
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();

    /* 最新点 */
    const lx = px(xs[xs.length - 1]), ly = py(ys[ys.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    /* マイルストーン縦線 */
    platform.milestones.forEach(target => {
      const hit = data.find(d => d.val >= target);
      if (!hit) return;
      const mx = px(dateToMs(hit.date));
      if (mx < PAD.l || mx > PAD.l + CW) return;
      ctx.beginPath(); ctx.setLineDash([3, 3]);
      ctx.moveTo(mx, PAD.t); ctx.lineTo(mx, PAD.t + CH);
      ctx.strokeStyle = '#e6a817'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e6a817'; ctx.font = '8px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const lbl = platform.isMan ? target + '万' : target >= 10000 ? (target / 10000) + '万' : target.toLocaleString();
      ctx.fillText(lbl, mx, PAD.t - 1);
    });

    /* デビュー縦線 */
    if (platform.debutDate) {
      const dm = dateToMs(platform.debutDate);
      if (dm >= xMin && dm <= xMax) {
        const dx = px(dm);
        ctx.beginPath(); ctx.setLineDash([4, 3]);
        ctx.moveTo(dx, PAD.t); ctx.lineTo(dx, PAD.t + CH);
        ctx.strokeStyle = '#B11E7C88'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    /* ホバー用メタデータ保存 */
    canvas._chartMeta = { xs, ys, px, py, data, platform };
  }

  /* ===== ツールチップ ===== */
  function setupTooltip() {
    const canvas = document.getElementById('sub-main-canvas');
    const tip    = document.getElementById('sub-tooltip');
    const ttDate = document.getElementById('sub-tt-date');
    const ttVal  = document.getElementById('sub-tt-val');
    if (!canvas || !tip) return;

    function onMove(e) {
      const meta = canvas._chartMeta;
      if (!meta) return;
      const rect    = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const mouseX  = clientX - rect.left;

      let minDist = Infinity, nearest = null;
      meta.xs.forEach((x, i) => {
        const dist = Math.abs(meta.px(x) - mouseX);
        if (dist < minDist) { minDist = dist; nearest = i; }
      });

      if (nearest === null || minDist > 30) { tip.style.display = 'none'; return; }

      ttDate.textContent = meta.data[nearest].date;
      ttVal.textContent  = formatVal(meta.data[nearest].val, meta.platform);
      tip.style.display  = '';
      tip.style.left     = meta.px(meta.xs[nearest]) + 'px';
      tip.style.top      = meta.py(meta.ys[nearest]) + 'px';
    }

    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('touchmove',  onMove, { passive: true });
    canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    canvas.addEventListener('touchend',   () => { tip.style.display = 'none'; });
  }

  /* ===== Y軸スケール算出（nice number方式） ===== */
/* ===== 切りの良い最大値（余白なし） ===== */
function roundUpNice(v) {
  if (v <= 0) return 1;

  const exp  = Math.floor(Math.log10(v));
  const base = 10 ** exp;

  return Math.ceil(v / base) * base;
}

  /* ===== グラフ再描画 ===== */
  function redraw() {
    const platform = PLATFORMS.find(p => p.id === activePlatform);
    if (!platform) return;
    const full     = dataCache[platform.id] || [];
    const filtered = filterByRange(full, activeRange);
    updateRecords(platform);
    drawChart(filtered, platform);
  }

  /* ===== 全プラットフォームを並列ロード ===== */
  async function loadAll() {
    const badge = document.getElementById('sub-loading-badge');

    await Promise.all(PLATFORMS.map(async p => {
      await loadPlatform(p);
      updateTabCount(p);   // 読み込めたものから随時反映
    }));

    if (badge) badge.classList.add('hidden');
    redraw(); // 全部揃ったらグラフ再描画
  }

  /* ===== 初期化 ===== */
  function init() {
    /* タブクリック */
    document.querySelectorAll('.sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {

        const p = PLATFORMS.find(p => p.id === btn.dataset.platform);
        if (!p || (dataCache[p.id] && dataCache[p.id].length === 0)) return;

        // ← ここから状態変更
        document.querySelectorAll('.sub-tab')
          .forEach(b => b.classList.remove('is-active'));

        btn.classList.add('is-active');

        activePlatform = btn.dataset.platform;
        redraw();
      });
    });

    /* 期間ボタン */
    document.querySelectorAll('.sub-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-range-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeRange = btn.dataset.range;
        redraw();
      });
    });

    setupTooltip();

    /* リサイズ再描画 */
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(redraw, 150);
    });

    /* データ読み込み開始 */
    loadAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();