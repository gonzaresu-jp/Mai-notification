
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

      // Android WebViewはbackdrop-filterのGPU合成が不安定で画像が隠れることがあるため無効化
      try {
        const isAndroid = !!(window.MaiApp && typeof window.MaiApp.isAndroidApp === 'function' && window.MaiApp.isAndroidApp());
        if (lightbox && isAndroid) lightbox.classList.add('no-blur');
      } catch {}

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
          : `<img src="${item.file_url}" alt="${escapeHtml((item.tweet_text || '恋乃夜まい メディア').slice(0, 80))}" loading="lazy">`;

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
        // Android WebViewでvh単位が0として計算される既知の不具合があるため、
        // window.innerHeight/innerWidthから直接pxを計算して指定する
        const maxW = Math.round(window.innerWidth * 0.9);
        const maxH = Math.round(window.innerHeight * 0.85);
        lightboxContent.style.maxWidth = maxW + 'px';
        lightboxContent.style.maxHeight = maxH + 'px';
        let html = '';
        if (isVideo) {
          html = `<video src="${item.file_url}" controls autoplay style="max-width:${maxW}px;max-height:${maxH}px;"></video>`;
        } else {
          html = `<img src="${item.file_url}" alt="${escapeHtml((item.tweet_text || '恋乃夜まい メディア').slice(0, 80))}" style="max-width:${maxW}px;max-height:${maxH}px;object-fit:contain;">`;
        }
        html += `
          <div class="media-lightbox-actions">
            <a href="${item.tweet_url}" target="_blank" rel="noopener"><i class="fa-brands fa-x-twitter"></i> ツイートを見る</a>
            <a href="${item.file_url}" download><i class="fa-solid fa-download"></i> ダウンロード</a>
          </div>
        `;
        lightboxContent.innerHTML = html;
        if (!isVideo) {
          const img = lightboxContent.querySelector('img');
          if (img) {
            img.addEventListener('error', () => {
              lightboxContent.innerHTML = `<div class="lightbox-error">画像を読み込めませんでした<br><a href="${item.file_url}" target="_blank" rel="noopener">別タブで開く</a></div>`;
            }, { once: true });
          }
        }
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
  