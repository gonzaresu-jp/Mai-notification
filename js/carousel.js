// carousel.js - カルーセル制御（高さ可変・スワイプ・ドット）

const carousel = document.querySelector('.stats-carousel');
const inner    = document.querySelector('.stats-carousel-inner');
const dotsWrap = document.querySelector('.carousel-dots');

let current  = 0;
let startX   = 0;
let startY   = 0;
let tracking = false;

const pages     = inner.querySelectorAll('.stats-page');
const maxPage   = pages.length - 1;
const threshold = 60;
const dots      = [];

/** スライド位置・高さ・ドットをまとめて更新 */
function update() {
  if (!inner || !carousel) return;

  inner.style.transform = `translateX(-${current * 100}%)`;

  const activePage = pages[current];
  if (activePage) {
    carousel.style.height = activePage.offsetHeight + 'px';
  }

  dots.forEach((d, i) => d.classList.toggle('active', i === current));

  // 矢印の端判定
  if (arrowPrev) arrowPrev.disabled = current === 0;
  if (arrowNext) arrowNext.disabled = current === maxPage;
}

/** ドットボタンと左右矢印を生成 */
let arrowPrev = null;
let arrowNext = null;

function initDots() {
  dotsWrap.innerHTML = '';
  dots.length = 0;

  // 左矢印
  arrowPrev = document.createElement('button');
  arrowPrev.type = 'button';
  arrowPrev.className = 'carousel-arrow carousel-arrow-prev';
  arrowPrev.setAttribute('aria-label', '前のスライドへ');
  arrowPrev.innerHTML = '<i class="fa-solid fa-angle-left" aria-hidden="true"></i>';
  arrowPrev.addEventListener('click', () => {
    if (current > 0) { current--; update(); }
  });
  dotsWrap.appendChild(arrowPrev);

  // ドット
  for (let i = 0; i <= maxPage; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `スライド ${i + 1}`);
    b.addEventListener('click', () => { current = i; update(); });
    dotsWrap.appendChild(b);
    dots.push(b);
  }

  // 右矢印
  arrowNext = document.createElement('button');
  arrowNext.type = 'button';
  arrowNext.className = 'carousel-arrow carousel-arrow-next';
  arrowNext.setAttribute('aria-label', '次のスライドへ');
  arrowNext.innerHTML = '<i class="fa-solid fa-angle-right" aria-hidden="true"></i>';
  arrowNext.addEventListener('click', () => {
    if (current < maxPage) { current++; update(); }
  });
  dotsWrap.appendChild(arrowNext);
}

// ===== ポインターイベント（スワイプ） =====
carousel.addEventListener('pointerdown', e => {
  startX   = e.clientX;
  startY   = e.clientY;
  tracking = true;
});

carousel.addEventListener('pointerup', e => {
  if (!tracking) return;
  tracking = false;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  if (Math.abs(dx) < Math.abs(dy)) return; // 縦スクロール優先
  if (Math.abs(dx) < threshold) return;

  if (dx < 0 && current < maxPage) current++;
  if (dx > 0 && current > 0) current--;

  update();
});

// 親パネルへの伝播遮断
['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']
  .forEach(type => {
    carousel.addEventListener(type, e => e.stopPropagation(), { passive: false });
  });

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
  initDots();
  setTimeout(update, 100); // レンダリング完了を待つ
});

window.addEventListener('load',   update);
window.addEventListener('resize', update);