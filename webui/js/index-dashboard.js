
                document.addEventListener('DOMContentLoaded', () => {
                    loadWeeklySchedule('weekly-schedule');
                    loadNotificationHeatmap('notification-heatmap');
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
            