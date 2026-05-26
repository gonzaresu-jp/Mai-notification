<?php
$pageTitle = "メディアアーカイブ";
$pageDesc = "保存されたTwitterメディア（画像・動画）のアーカイブ";
$extraHead = '
<style>
/* ==========================================
   Twitter メディアアーカイブ ページ
   ========================================== */

.media-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px 40px;
}

.media-page-title {
  text-align: center;
  font-size: 1.4rem;
  font-weight: 800;
  color: #fff;
  margin: 20px 0 10px;
  text-shadow: 0 1px 4px rgba(177, 30, 124, 0.15);
}

/* 統計バー */
.media-stats {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.media-stat-card {
  background: rgba(255,255,255,0.85);
  border-radius: 12px;
  padding: 10px 18px;
  text-align: center;
  min-width: 90px;
  border: 1px solid rgba(255,255,255,0.9);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.media-stat-value {
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--color-primary, #B11E7C);
  font-variant-numeric: tabular-nums;
}

.media-stat-label {
  font-size: 0.65rem;
  color: #777;
  font-weight: 600;
  margin-top: 2px;
}

/* フィルタータブ */
.media-filter-tabs {
  display: flex;
  gap: 4px;
  justify-content: center;
  margin-bottom: 16px;
}

.media-filter-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 18px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  background: rgba(255,255,255,0.6);
  color: #666;
  transition: all 0.2s ease;
  border: 1px solid rgba(177, 30, 124, 0.15);
}

.media-filter-btn.is-active {
  background: var(--color-primary, #B11E7C);
  color: #fff;
  box-shadow: 0 3px 10px rgba(177, 30, 124, 0.35);
  border-color: transparent;
}

.media-filter-btn:hover:not(.is-active) {
  background: rgba(255,255,255,0.9);
  color: var(--color-primary, #B11E7C);
}

/* グリッド */
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

/* カード */
.media-card {
  background: rgba(255,255,255,0.88);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.9);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
  animation: fadeIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.media-card:hover {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 8px 24px rgba(177, 30, 124, 0.18);
}

.media-card-thumb {
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: #222;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ぼかし背景 */
.media-card-thumb::before {
  content: "";
  position: absolute;
  inset: -10px;
  background-image: var(--bg-url);
  background-size: cover;
  background-position: center;
  filter: blur(12px) brightness(0.6);
  opacity: 0.6;
  z-index: 0;
}

.media-card-thumb img,
.media-card-thumb video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  position: relative;
  z-index: 1;
  transition: transform 0.3s ease;
}

.media-card:hover .media-card-thumb img,
.media-card:hover .media-card-thumb video {
  transform: scale(1.05);
}

/* 動画バッジ */
.media-card-thumb .video-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0,0,0,0.65);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 6px;
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  gap: 4px;
}

.media-card-info {
  padding: 8px 10px;
}

.media-card-text {
  font-size: 0.7rem;
  color: #444;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.media-card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  font-size: 0.6rem;
  color: #999;
}

.media-card-date {
  font-weight: 600;
}

.media-card-size {
  font-variant-numeric: tabular-nums;
}

/* ライトボックス */
.media-lightbox {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 99999;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.media-lightbox.is-open {
  display: flex;
}

.media-lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.media-lightbox-close:hover {
  background: rgba(255,255,255,0.3);
}

.media-lightbox-content {
  max-width: 90vw;
  max-height: 85vh;
  position: relative;
}

.media-lightbox-content img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
}

.media-lightbox-content video {
  max-width: 90vw;
  max-height: 85vh;
  border-radius: 8px;
}

.media-lightbox-info {
  position: absolute;
  bottom: -40px;
  left: 0;
  right: 0;
  text-align: center;
  color: rgba(255,255,255,0.7);
  font-size: 0.75rem;
}

.media-lightbox-actions {
  position: absolute;
  bottom: -40px;
  right: 0;
  display: flex;
  gap: 8px;
}

.media-lightbox-actions a {
  color: rgba(255,255,255,0.7);
  font-size: 0.75rem;
  text-decoration: none;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255,255,255,0.1);
  transition: background 0.15s;
}

.media-lightbox-actions a:hover {
  background: rgba(255,255,255,0.25);
  color: #fff;
}

/* もっと読み込むボタン */
.media-load-more {
  display: block;
  margin: 20px auto 0;
  padding: 10px 28px;
  border: none;
  border-radius: 20px;
  background: var(--color-primary, #B11E7C);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(177, 30, 124, 0.3);
  transition: transform 0.15s, box-shadow 0.15s;
}

.media-load-more:hover {
  transform: scale(1.04);
  box-shadow: 0 6px 18px rgba(177, 30, 124, 0.4);
}

.media-load-more:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* スケルトン */
.media-skeleton {
  background: linear-gradient(90deg, #f0e8ec 25%, #f8f0f5 50%, #f0e8ec 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: 12px;
  aspect-ratio: 16 / 9;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 空メッセージ */
.media-empty {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 0.9rem;
}

.media-empty i {
  font-size: 2rem;
  margin-bottom: 10px;
  color: #ddd;
  display: block;
}

/* レスポンシブ */
@media (max-width: 600px) {
  .media-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .media-card-info {
    padding: 6px 8px;
  }

  .media-card-text {
    font-size: 0.62rem;
    -webkit-line-clamp: 1;
  }

  .media-stat-card {
    padding: 8px 12px;
    min-width: 70px;
  }
}
</style>
';
include __DIR__ . '/head.php';
?>
</head>

<body id="app-body">
  <div id="header-slot">
    <?php include __DIR__ . '/header.php'; ?>
  </div>

  <main>
    <div class="media-page">
      <h1 class="media-page-title"><i class="fa-brands fa-x-twitter"></i> メディアアーカイブ</h1>

      <!-- 統計 -->
      <div class="media-stats" id="media-stats">
        <div class="media-stat-card">
          <div class="media-stat-value" id="stat-total">-</div>
          <div class="media-stat-label">総メディア数</div>
        </div>
        <div class="media-stat-card">
          <div class="media-stat-value" id="stat-images">-</div>
          <div class="media-stat-label">画像</div>
        </div>
        <div class="media-stat-card">
          <div class="media-stat-value" id="stat-videos">-</div>
          <div class="media-stat-label">動画</div>
        </div>
        <div class="media-stat-card">
          <div class="media-stat-value" id="stat-size">-</div>
          <div class="media-stat-label">合計サイズ</div>
        </div>
      </div>

      <!-- フィルター -->
      <div class="media-filter-tabs">
        <button class="media-filter-btn is-active" data-filter="all">すべて</button>
        <button class="media-filter-btn" data-filter="image"><i class="fa-solid fa-image"></i> 画像</button>
        <button class="media-filter-btn" data-filter="video"><i class="fa-solid fa-video"></i> 動画</button>
      </div>

      <!-- グリッド -->
      <div class="media-grid" id="media-grid"></div>

      <!-- もっと読み込む -->
      <button class="media-load-more" id="media-load-more" style="display:none;">もっと読み込む</button>
    </div>
  </main>

  <!-- ライトボックス -->
  <div class="media-lightbox" id="media-lightbox">
    <button class="media-lightbox-close" id="lightbox-close"><i class="fa-solid fa-xmark"></i></button>
    <div class="media-lightbox-content" id="lightbox-content"></div>
  </div>

  <div id="footer-slot">
    <?php include __DIR__ . '/footer.php'; ?>
  </div>

  <script src="/ios-helper.js" defer></script>
  <script type="module" src="/dist/main.bundle.min.js?v=<?= @filemtime(__DIR__ . '/dist/main.bundle.min.js') ?: time(); ?>" defer></script>
  <script src="/dist/ui-misc.min.js?v=<?= @filemtime(__DIR__ . '/dist/ui-misc.min.js') ?: time(); ?>" defer></script>

  <script>
    (function () {
      const PAGE_SIZE = 30;
      let currentFilter = null; // null = all
      let currentOffset = 0;
      let isLoading = false;
      let hasMore = true;

      const grid = document.getElementById('media-grid');
      const loadMoreBtn = document.getElementById('media-load-more');
      const lightbox = document.getElementById('media-lightbox');
      const lightboxContent = document.getElementById('lightbox-content');
      const lightboxClose = document.getElementById('lightbox-close');

      function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
      }

      function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (!isFinite(d.getTime())) return '';
        
        // 日本時間 (JST) でフォーマット
        return new Intl.DateTimeFormat('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
          timeZone: 'Asia/Tokyo'
        }).format(d);
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
      }

      function updateStats(stats) {
        document.getElementById('stat-total').textContent = (stats.total || 0).toLocaleString();
        document.getElementById('stat-images').textContent = (stats.images || 0).toLocaleString();
        document.getElementById('stat-videos').textContent = (stats.videos || 0).toLocaleString();
        document.getElementById('stat-size').textContent = formatSize(stats.total_size || 0);
      }

      function renderCard(item) {
        const isVideo = item.media_type === 'video';
        const card = document.createElement('div');
        card.className = 'media-card';
        card.dataset.id = item.id;
        card.dataset.type = item.media_type;
        card.dataset.fileUrl = item.file_url;
        card.dataset.tweetUrl = item.tweet_url;

        const thumbHtml = isVideo
          ? `<video src="${item.file_url}" preload="metadata" muted></video>
             <div class="video-badge"><i class="fa-solid fa-play"></i> 動画</div>`
          : `<img src="${item.file_url}" alt="" loading="lazy">`;

        card.innerHTML = `
          <div class="media-card-thumb" style="--bg-url: url('${item.file_url}')">${thumbHtml}</div>
          <div class="media-card-info">
            <div class="media-card-text">${escapeHtml(item.tweet_text || '')}</div>
            <div class="media-card-meta">
              <span class="media-card-date">${formatDate(item.tweet_date || item.created_at)}</span>
              <span class="media-card-size">${formatSize(item.file_size)}</span>
            </div>
          </div>
        `;

        card.addEventListener('click', () => openLightbox(item));
        return card;
      }

      function showSkeleton() {
        grid.innerHTML = '';
        for (let i = 0; i < 6; i++) {
          const sk = document.createElement('div');
          sk.className = 'media-skeleton';
          grid.appendChild(sk);
        }
      }

      async function loadMedia(reset = false) {
        if (isLoading) return;
        isLoading = true;

        if (reset) {
          currentOffset = 0;
          hasMore = true;
          showSkeleton();
        }

        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = '読み込み中...';

        try {
          let url = `/api/twitter-media?limit=${PAGE_SIZE}&offset=${currentOffset}`;
          if (currentFilter) url += `&type=${currentFilter}`;

          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          if (reset) {
            grid.innerHTML = '';
            updateStats(data.stats || {});
          }

          const items = data.media || [];
          if (items.length === 0 && currentOffset === 0) {
            grid.innerHTML = `
              <div class="media-empty" style="grid-column: 1 / -1;">
                <i class="fa-regular fa-image"></i>
                <div>まだメディアがありません</div>
              </div>`;
            loadMoreBtn.style.display = 'none';
            return;
          }

          items.forEach(item => {
            grid.appendChild(renderCard(item));
          });

          currentOffset += items.length;
          hasMore = items.length >= PAGE_SIZE;
          loadMoreBtn.style.display = hasMore ? 'block' : 'none';
          loadMoreBtn.textContent = 'もっと読み込む';
          loadMoreBtn.disabled = false;
        } catch (err) {
          console.error('Media load error:', err);
          if (currentOffset === 0) {
            grid.innerHTML = `
              <div class="media-empty" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <div>読み込みに失敗しました</div>
              </div>`;
          }
          loadMoreBtn.style.display = 'none';
        } finally {
          isLoading = false;
        }
      }

      // Zoom/pan state (image only, not video)
      let zoomState = null;
      let zoomMediaEl = null;

      function resetZoomState() {
        zoomState = null;
        zoomMediaEl = null;
      }

      function setupZoomPan(mediaEl) {
        if (!mediaEl || mediaEl.tagName === 'VIDEO') return;
        zoomMediaEl = mediaEl;
        mediaEl.style.transformOrigin = '0 0';
        mediaEl.style.willChange = 'transform';
        zoomState = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, vx: 0, vy: 0, history: [], momentumRaf: 0 };

        function apply() {
          if (!zoomState || !mediaEl) return;
          mediaEl.style.transform = zoomState.scale > 1
            ? `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`
            : '';
        }

        function runMomentum() {
          if (!zoomState || (Math.abs(zoomState.vx) < 0.5 && Math.abs(zoomState.vy) < 0.5)) return;
          zoomState.vx *= 0.92;
          zoomState.vy *= 0.92;
          zoomState.x += zoomState.vx;
          zoomState.y += zoomState.vy;
          apply();
          zoomState.momentumRaf = requestAnimationFrame(runMomentum);
        }

        function stopMomentum() {
          if (zoomState?.momentumRaf) {
            cancelAnimationFrame(zoomState.momentumRaf);
            zoomState.momentumRaf = 0;
          }
          zoomState.vx = 0; zoomState.vy = 0;
        }

        function onWheel(e) {
          if (!zoomState) return;
          e.preventDefault();
          stopMomentum();
          const rect = mediaEl.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const prev = zoomState.scale;
          const next = Math.max(1, Math.min(20, prev * Math.pow(1.08, -e.deltaY / 100)));
          if (next === 1) {
            zoomState.scale = 1; zoomState.x = 0; zoomState.y = 0;
          } else {
            const r = next / prev;
            zoomState.scale = next;
            zoomState.x = mx * (1 - r) + zoomState.x;
            zoomState.y = my * (1 - r) + zoomState.y;
          }
          apply();
        }

        function onDown(e) {
          if (!zoomState || e.button !== 0 || zoomState.scale <= 1) return;
          stopMomentum();
          zoomState.dragging = true;
          zoomState.startX = e.clientX - zoomState.x;
          zoomState.startY = e.clientY - zoomState.y;
          zoomState.history = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
          mediaEl.style.cursor = 'grabbing';
          e.preventDefault();
        }

        function onMove(e) {
          if (!zoomState?.dragging) return;
          zoomState.x = e.clientX - zoomState.startX;
          zoomState.y = e.clientY - zoomState.startY;
          zoomState.history.push({ t: performance.now(), x: e.clientX, y: e.clientY });
          if (zoomState.history.length > 10) zoomState.history.shift();
          apply();
        }

        function onUp() {
          if (!zoomState) return;
          zoomState.dragging = false;
          if (mediaEl) mediaEl.style.cursor = zoomState.scale > 1 ? 'grab' : '';
          const h = zoomState.history;
          if (h.length >= 2) {
            const recent = h.slice(-5);
            const first = recent[0], last = recent[recent.length - 1];
            const dt = last.t - first.t;
            if (dt > 0 && dt < 150) {
              zoomState.vx = (last.x - first.x) / dt * 16 * 0.5;
              zoomState.vy = (last.y - first.y) / dt * 16 * 0.5;
              zoomState.momentumRaf = requestAnimationFrame(runMomentum);
            }
          }
          zoomState.history = [];
        }

        function onDbl(e) {
          if (!zoomState) return;
          e.preventDefault();
          stopMomentum();
          if (zoomState.scale > 1) {
            zoomState.scale = 1; zoomState.x = 0; zoomState.y = 0;
          } else {
            zoomState.scale = 3; zoomState.x = 0; zoomState.y = 0;
          }
          if (mediaEl) mediaEl.style.cursor = zoomState.scale > 1 ? 'grab' : '';
          apply();
        }

        // --- Touch handling (mobile) ---
        let touchId = null;
        let pinchDist = 0;

        function onTouchStart(e) {
          if (!zoomState) return;
          if (e.touches.length === 1 && zoomState.scale > 1) {
            touchId = e.touches[0].identifier;
            const t = e.touches[0];
            stopMomentum();
            zoomState.dragging = true;
            zoomState.startX = t.clientX - zoomState.x;
            zoomState.startY = t.clientY - zoomState.y;
            zoomState.history = [{ t: performance.now(), x: t.clientX, y: t.clientY }];
          } else if (e.touches.length === 2) {
            stopMomentum();
            touchId = null;
            const t0 = e.touches[0], t1 = e.touches[1];
            pinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
            zoomState.pinchCx = (t0.clientX + t1.clientX) / 2;
            zoomState.pinchCy = (t0.clientY + t1.clientY) / 2;
            zoomState.pinchS = zoomState.scale;
            zoomState.pinchX = zoomState.x;
            zoomState.pinchY = zoomState.y;
          }
        }

        function onTouchMove(e) {
          if (!zoomState) return;
          if (e.touches.length === 1 && zoomState.dragging && touchId !== null) {
            e.preventDefault();
            const t = e.touches[0];
            zoomState.x = t.clientX - zoomState.startX;
            zoomState.y = t.clientY - zoomState.startY;
            zoomState.history.push({ t: performance.now(), x: t.clientX, y: t.clientY });
            if (zoomState.history.length > 10) zoomState.history.shift();
            apply();
          } else if (e.touches.length === 2) {
            e.preventDefault();
            const t0 = e.touches[0], t1 = e.touches[1];
            const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
            const cx = (t0.clientX + t1.clientX) / 2;
            const cy = (t0.clientY + t1.clientY) / 2;
            const ratio = d / pinchDist;
            const next = Math.max(1, Math.min(20, zoomState.pinchS * ratio));
            if (next === 1) {
              zoomState.scale = 1; zoomState.x = 0; zoomState.y = 0;
            } else {
              const r = next / zoomState.scale;
              zoomState.scale = next;
              const rect = mediaEl.getBoundingClientRect();
              const mx = cx - rect.left;
              const my = cy - rect.top;
              zoomState.x = mx * (1 - r) + zoomState.x;
              zoomState.y = my * (1 - r) + zoomState.y;
            }
          }
        }

        function onTouchEnd(e) {
          if (!zoomState) return;
          const remaining = e.touches.length;
          if (remaining === 0 && zoomState.dragging) {
            zoomState.dragging = false;
            const h = zoomState.history;
            if (h.length >= 2) {
              const recent = h.slice(-5);
              const first = recent[0], last = recent[recent.length - 1];
              const dt = last.t - first.t;
              if (dt > 0 && dt < 150) {
                zoomState.vx = (last.x - first.x) / dt * 16 * 0.5;
                zoomState.vy = (last.y - first.y) / dt * 16 * 0.5;
                zoomState.momentumRaf = requestAnimationFrame(runMomentum);
              }
            }
            zoomState.history = [];
            touchId = null;
          } else if (remaining < 2) {
            pinchDist = 0;
          }
        }

        mediaEl.addEventListener('wheel', onWheel, { passive: false });
        mediaEl.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        mediaEl.addEventListener('dblclick', onDbl);
        mediaEl.addEventListener('touchstart', onTouchStart, { passive: false });
        mediaEl.addEventListener('touchmove', onTouchMove, { passive: false });
        mediaEl.addEventListener('touchend', onTouchEnd);
        mediaEl.addEventListener('touchcancel', onTouchEnd);
      }

      function openLightbox(item) {
        const isVideo = item.media_type === 'video';
        let html = '';
        if (isVideo) {
          html = `<video src="${item.file_url}" controls autoplay style="max-width:90vw;max-height:85vh;"></video>`;
        } else {
          html = `<img src="${item.file_url}" alt="" style="max-width:90vw;max-height:85vh;object-fit:contain;">`;
        }
        html += `
          <div class="media-lightbox-actions">
            <a href="${item.tweet_url}" target="_blank" rel="noopener"><i class="fa-brands fa-x-twitter"></i> ツイートを見る</a>
            <a href="${item.file_url}" download><i class="fa-solid fa-download"></i> ダウンロード</a>
          </div>
        `;
        lightboxContent.innerHTML = html;
        resetZoomState();
        lightbox.classList.add('is-open');
        setupZoomPan(lightboxContent.querySelector('img, video'));
      }

      function closeLightbox() {
        lightbox.classList.remove('is-open');
        // 動画を停止
        const video = lightboxContent.querySelector('video');
        if (video) video.pause();
        if (zoomMediaEl) zoomMediaEl.removeAttribute('style');
        lightboxContent.innerHTML = '';
        if (zoomState?.momentumRaf) cancelAnimationFrame(zoomState.momentumRaf);
        resetZoomState();
      }

      // イベント
      lightboxClose.addEventListener('click', closeLightbox);
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
      });

      loadMoreBtn.addEventListener('click', () => loadMedia(false));

      // フィルタータブ
      document.querySelectorAll('.media-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.media-filter-btn').forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const filter = btn.dataset.filter;
          currentFilter = filter === 'all' ? null : filter;
          loadMedia(true);
        });
      });

      // 初期読み込み
      loadMedia(true);
    })();
  </script>
</body>
</html>
