// panel.js - 左パネルの開閉・スワイプ・画像比率による幅計算

(() => {
  // ===== パネル幅の動的計算 =====
  const maskImg = document.querySelector('.left-mai .mask img');
  if (maskImg) {
    function updatePanelWidth() {
      if (!maskImg.naturalWidth || !maskImg.naturalHeight) return;
      const widthPx = window.innerHeight * (maskImg.naturalWidth / maskImg.naturalHeight);
      document.documentElement.style.setProperty('--panel-width', `${widthPx - 100}px`);
    }

    if (maskImg.complete) {
      updatePanelWidth();
    } else {
      maskImg.addEventListener('load', updatePanelWidth);
    }
    window.addEventListener('resize', updatePanelWidth);
  }

  // ===== パネル開閉 =====
  const root   = document.querySelector('.left-mai');
  if (!root) return;

  const btn    = root.querySelector('div.open');
  const imgbtn = root.querySelector('.mask');

  const toggle = e => {
    // カルーセル内のクリックは無視
    if (e.target.closest('.stats-carousel') || e.target.closest('.carousel-dots')) return;
    e.preventDefault();
    root.classList.toggle('is-open');
  };

  btn?.addEventListener('click',  toggle, { passive: false });
  imgbtn?.addEventListener('click', toggle, { passive: false });

  // ===== 横スワイプ =====
  let startX   = 0;
  let startY   = 0;
  let tracking = false;
  const THRESHOLD = 50;

  const onStart = e => {
    const p = e.touches?.[0] ?? e;
    startX   = p.clientX;
    startY   = p.clientY;
    tracking = true;
  };

  const onEnd = e => {
    if (!tracking) return;
    tracking = false;

    const p  = e.changedTouches?.[0] ?? e;
    const dx = p.clientX - startX;
    const dy = p.clientY - startY;

    if (Math.abs(dx) < Math.abs(dy)) return; // 縦スクロール優先

    if      (dx >  THRESHOLD) root.classList.add('is-open');
    else if (dx < -THRESHOLD) root.classList.remove('is-open');
  };

  root.addEventListener('touchstart', onStart, { passive: true });
  root.addEventListener('touchend',   onEnd,   { passive: true });
  root.addEventListener('mousedown',  onStart);
  window.addEventListener('mouseup',  onEnd);
})();
