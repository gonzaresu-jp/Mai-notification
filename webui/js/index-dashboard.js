
                document.addEventListener('DOMContentLoaded', () => {
                    loadWeeklySchedule('weekly-schedule');
                    // ヒートマップ(53週×7日のセル)は「ヒートマップ」タブを開いた時に初回だけ描画する
                    // （index-history-tabs.js）。初期表示の DOM 量とレイアウト計算を削減。
                    enableAutoReload(5);

                    // システムステータス情報取得
                    updateIndexSystemStatus();
                });

                async function updateIndexSystemStatus() {
                    const dot = document.getElementById('index-system-status-dot');
                    const text = document.getElementById('index-system-status-text');
                    if (!dot || !text) return;

                    try {
                        const res = await fetch('/api/scraper-status');
                        if (!res.ok) throw new Error();
                        const data = await res.json();
                        const items = data.items || [];

                        if (items.length === 0) {
                            dot.className = 'status-dot';
                            text.textContent = 'データなし';
                            return;
                        }

                        // running でも last_run が3分以上前なら待機中（正常）とみなす
                        const effectiveItems = items.map(i => {
                            if (i.status !== 'running') return i;
                            const staleSec = (Date.now() - new Date(i.last_run).getTime()) / 1000;
                            return staleSec > 180 ? { ...i, status: 'success' } : i;
                        });

                        const hasError = effectiveItems.some(i => i.status === 'error');
                        const isRunning = effectiveItems.some(i => i.status === 'running');

                        dot.className = 'status-dot';
                        if (hasError) {
                            dot.classList.add('error');
                            text.textContent = '一部異常あり';
                            text.style.color = '#f44336';
                        } else if (isRunning) {
                            dot.classList.add('running');
                            text.textContent = '巡回実行中';
                            text.style.color = '#2196f3';
                        } else {
                            dot.classList.add('ok');
                            text.textContent = 'システム正常';
                            text.style.color = '#4caf50';
                        }
                    } catch (e) {
                        text.textContent = '取得失敗';
                    }
                }
            
// Android アプリ(v1.2〜)のみ: カウント／スケジュールの見出しに「ホーム画面に追加」ボタンを出す
(function () {
    function setup() {
        var app = window.MaiApp;
        if (!app || typeof app.requestPinWidget !== 'function') return;
        [['.count-page h2', 'count', 'カウント'], ['.week-title', 'schedule', 'スケジュール']].forEach(function (d) {
            var h = document.querySelector(d[0]);
            if (!h || h.querySelector('.pin-widget-btn')) return;
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'pin-widget-btn';
            b.setAttribute('aria-label', d[2] + 'ウィジェットをホーム画面に追加');
            b.innerHTML = '<i class="fa-solid fa-thumbtack" aria-hidden="true"></i> ホームに追加';
            b.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                var ok = false;
                try { ok = app.requestPinWidget(d[1]); } catch (err) { ok = false; }
                if (!ok) alert('お使いのホームアプリはこの方法に対応していません。\nホーム画面を長押し →「ウィジェット」→「まいちゃん通知」から追加できます。');
            });
            h.appendChild(b);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
})();
