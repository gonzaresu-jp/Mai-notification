
    (function () {
      function init() {
        const sec = document.querySelector('.log-section');
        if (!sec) return;
        const rList = document.getElementById('histtab-list');
        const rHeat = document.getElementById('histtab-heat');
        let heatmapLoaded = false;
        // add/remove で冪等に（classList.toggleの第2引数forceは古いWebViewで無視されるため使わない。
        // click と change の二重発火でも結果が反転しない）
        const apply = () => {
          if (rHeat && rHeat.checked) {
            sec.classList.add('hist-heat');
            // 詳細統計はヒートマップタブを開いた時に初回だけ取得。
            // 表示直後に幅が確定してから描画（非表示中はcanvas幅0のため）
            if (!heatmapLoaded && typeof loadNotificationHeatmap === 'function') {
              heatmapLoaded = true;
              loadNotificationHeatmap('notification-heatmap');
            }
            if (typeof loadNotificationStats === 'function') {
              requestAnimationFrame(() => loadNotificationStats('notification-stats'));
            }
          } else {
            sec.classList.remove('hist-heat');
          }
        };
        [rList, rHeat].forEach(r => { if (r) r.addEventListener('change', apply); });
        // ラベルタップでも確実に切替（一部WebViewのlabel→radio不具合対策）
        const tabs = sec.querySelectorAll('.hist-tab');
        tabs.forEach(label => {
          label.addEventListener('click', () => {
            const r = document.getElementById(label.getAttribute('for'));
            if (r) { r.checked = true; apply(); }
          });
        });
        apply();
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    })();
    