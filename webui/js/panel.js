// panel.js - 左パネルの開閉・スワイプ・画像比率による幅計算

(() => {
  // ===== パネル幅の動的計算 =====
  const maskImg = document.querySelector('.left-mai .mask img');
  if (maskImg) {
    function updatePanelWidth() {
      const nw = maskImg.naturalWidth;
      const nh = maskImg.naturalHeight;
      if (!nw || !nh) return;
      // requestAnimationFrame で書き込みを次フレームに束ねて強制リフロー回避
      requestAnimationFrame(() => {
        const widthPx = window.innerHeight * (nw / nh);
        document.documentElement.style.setProperty('--panel-width', `${widthPx - 100}px`);
      });
    }

    if (maskImg.complete && maskImg.naturalWidth) {
      updatePanelWidth();
    } else {
      maskImg.addEventListener('load', updatePanelWidth);
    }
    // resize: また前回値をキャッシュして必要なときだけ反映
    let _rafId = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(_rafId);
      _rafId = requestAnimationFrame(updatePanelWidth);
    });
  }

  // ===== パネル開閉 =====
  const root = document.querySelector('.left-mai');
  if (!root) return;

  const btn = root.querySelector('button.open');
  const imgbtn = root.querySelector('.mask');

  const toggle = e => {
    // カルーセル内のクリックは無視
    if (e.target.closest('.stats-carousel') || e.target.closest('.carousel-dots')) return;
    e.preventDefault();
    root.classList.toggle('is-open');
  };

  btn?.addEventListener('click', toggle, { passive: false });
  imgbtn?.addEventListener('click', toggle, { passive: false });

  // ===== 横スワイプ =====
  let startX = 0;
  let startY = 0;
  let tracking = false;
  const THRESHOLD = 50;

  const onStart = e => {

    if (e.target.closest('.stats-carousel')) return;

    const p = e.touches?.[0] ?? e;
    startX = p.clientX;
    startY = p.clientY;
    tracking = true;
  };

  const onEnd = e => {

    if (e.target.closest('.stats-carousel')) return;

    if (!tracking) return;
    tracking = false;

    const p = e.changedTouches?.[0] ?? e;
    const dx = p.clientX - startX;
    const dy = p.clientY - startY;

    if (Math.abs(dx) < Math.abs(dy)) return;

    if (dx > THRESHOLD) root.classList.add('is-open');
    else if (dx < -THRESHOLD) root.classList.remove('is-open');
  };

  root.addEventListener('touchstart', onStart, { passive: true });
  root.addEventListener('touchend', onEnd, { passive: true });
  root.addEventListener('mousedown', onStart);
  window.addEventListener('mouseup', onEnd);
})();
