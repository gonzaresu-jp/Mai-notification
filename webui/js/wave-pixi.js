
const app = new PIXI.Application({
  resizeTo: window,
  antialias: true,
  backgroundAlpha: 0
});
document.body.appendChild(app.view);

// ===== WebGL監視 =====
app.renderer.on('contextlost', () => console.warn('context lost'));
app.renderer.on('contextrestored', () => console.warn('context restored'));

// ===== テクスチャ =====
const texture = PIXI.Texture.from("./left-mai.webp");

// ===== ウェイトマップ =====
const weightImg = new Image();
weightImg.src = "./weight.jpg"; // 白黒画像

let weightData = null;
let weightW = 0;
let weightH = 0;

texture.baseTexture.on('loaded', checkInit);
weightImg.onload = loadWeight;

function loadWeight() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = weightImg.width;
  canvas.height = weightImg.height;

  ctx.drawImage(weightImg, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  weightData = imgData.data;

  weightW = canvas.width;
  weightH = canvas.height;

  checkInit();
}

function checkInit() {
  if (texture.baseTexture.valid && weightData) {
    init();
  }
}

function getWeight(x, y, plane) {
  const u = x / plane.width;
  const v = y / plane.height;

  const ix = Math.floor(u * weightW);
  const iy = Math.floor(v * weightH);

  if (ix < 0 || iy < 0 || ix >= weightW || iy >= weightH) return 0;

  const idx = (iy * weightW + ix) * 4;
  return weightData[idx] / 255; // Rチャンネル
}

function init() {
  const cols = 40;
  const rows = 40;
  const plane = new PIXI.SimplePlane(texture, cols, rows);

  plane.x = app.screen.width / 2 - plane.width / 2;
  plane.y = app.screen.height / 2 - plane.height / 2;

  plane.eventMode = 'static';
  plane.cursor = 'pointer';

  app.stage.addChild(plane);

  const vertices = plane.geometry.getBuffer('aVertexPosition').data;
  const base = new Float32Array(vertices);
  const velocity = new Float32Array(vertices.length);

  // --- マウス管理 ---
  let dragging = false;
  let dragPos = null;

  plane.on('pointerdown', (e) => {
    dragging = true;
    dragPos = e.getLocalPosition(plane);
  });
  plane.on('pointerup', () => dragging = false);
  plane.on('pointerupoutside', () => dragging = false);
  plane.on('pointermove', (e) => {
    if (dragging) dragPos = e.getLocalPosition(plane);
  });

  app.ticker.add(() => {
    for (let i = 0; i < vertices.length; i += 2) {
      const vx = vertices[i];
      const vy = vertices[i + 1];
      const w = getWeight(vx, vy, plane);

      // --- X方向はほぼ固定 ---
      const dx = base[i] - vx;
      velocity[i] += dx * (0.02 * (0.5 + w));
      velocity[i] *= 0.95;
      vertices[i] += velocity[i];

      // --- Y方向（マウスのみ） ---
      const dy = base[i + 1] - vy;
      velocity[i + 1] += dy * (0.02 * (0.5 + w)); // バネ
      velocity[i + 1] *= 0.92;                     // 減衰

      // マウス操作の影響
      if (dragging && dragPos) {
        const dxm = vx - dragPos.x;
        const dym = vy - dragPos.y;
        const dist = Math.sqrt(dxm*dxm + dym*dym);
        if (dist < 120 && dist > 0.0001) {
          const force = (120 - dist) / 120;
          velocity[i + 1] += (dym / dist) * force * 1.4 * w;
          velocity[i]     += (dxm / dist) * force * 0.5 * w;
        }
      }

      vertices[i + 1] += velocity[i + 1];
    }

    plane.geometry.getBuffer('aVertexPosition').update();
  });

  window.addEventListener('resize', () => {
    plane.x = app.screen.width / 2 - plane.width / 2;
    plane.y = app.screen.height / 2 - plane.height / 2;
  });
}
