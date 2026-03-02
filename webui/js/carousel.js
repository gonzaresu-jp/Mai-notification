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
}

/** ドットボタンを生成 */
function initDots() {
  dotsWrap.innerHTML = '';
  dots.length = 0;

  for (let i = 0; i <= maxPage; i++) {
    const b = document.createElement('button');
    b.addEventListener('click', () => { current = i; update(); });
    dotsWrap.appendChild(b);
    dots.push(b);
  }
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
