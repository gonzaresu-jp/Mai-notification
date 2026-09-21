<?php
// status.php
$extraHead = '<link rel="stylesheet" href="/css/status.css?v=' . @filemtime(__DIR__ . '/css/status.css') . '>';
include __DIR__ . '/head.php';
?>
<title>システム稼働状況 - まいちゃん通知</title>


<body id="app-body">
    <?php include __DIR__ . '/header.php'; ?>

    <div class="status-container">
        <div class="status-header">
            <h1>システム稼働状況</h1>
            <p>バックグラウンドプロセスとサーバーリソースの健康状態をリアルタイムで表示します。</p>
            <button class="status-refresh-btn" onclick="loadAll()">
                <i class="fa-solid fa-rotate"></i> 更新
            </button>
        </div>

        <!-- サーバーリソース -->
        <div class="resource-section">
            <div class="resource-section-title"><i class="fa-solid fa-server" style="margin-right:6px"></i>サーバーリソース</div>
            <div id="resource-grid" class="resource-grid">
                <div style="color:rgba(255,255,255,0.4)">Loading...</div>
            </div>
        </div>

        <div class="section-divider"></div>

        <!-- スクレイパー状況 -->
        <div class="scraper-section-title"><i class="fa-solid fa-circle-nodes" style="margin-right:6px"></i>プロセスステータス</div>
        <div id="status-grid" class="status-grid">
            <div class="status-loading">Loading systems health...</div>
        </div>
    </div>

    <?php include __DIR__ . '/footer.php'; ?>

    <script>
        function timeAgo(date) {
            if (!date) return 'Never';
            const seconds = Math.floor((new Date() - new Date(date)) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + ' years ago';
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + ' months ago';
            interval = seconds / 86400;
            if (interval > 1) return Math.floor(interval) + ' days ago';
            interval = seconds / 3600;
            if (interval > 1) return Math.floor(interval) + ' hours ago';
            interval = seconds / 60;
            if (interval > 1) return Math.floor(interval) + ' minutes ago';
            return Math.floor(seconds) + ' seconds ago';
        }

        function fmtBytes(bytes) {
            if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
            if (bytes >= 1048576)    return (bytes / 1048576).toFixed(0) + ' MB';
            return (bytes / 1024).toFixed(0) + ' KB';
        }

        function fmtUptime(sec) {
            const d = Math.floor(sec / 86400);
            const h = Math.floor((sec % 86400) / 3600);
            const m = Math.floor((sec % 3600) / 60);
            if (d > 0) return d + 'd ' + h + 'h';
            if (h > 0) return h + 'h ' + m + 'm';
            return m + 'm';
        }

        function barClass(pct, baseClass) {
            if (pct >= 90) return 'crit';
            if (pct >= 70) return 'warn';
            return baseClass;
        }

        async function loadSystemInfo() {
            const grid = document.getElementById('resource-grid');
            try {
                const res  = await fetch('/api/system-info');
                const d    = await res.json();
                const cpu  = d.cpu || {};
                const mem  = d.memory || {};
                const proc = d.process || {};
                const dOs  = d.os || {};

                const cpuPct  = cpu.usagePercent  ?? 0;
                const memPct  = mem.usagePercent  ?? 0;
                const procPct = mem.total ? Math.round(proc.rss / mem.total * 100) : 0;

                grid.innerHTML = `
                    <!-- CPU Card -->
                    <div class="resource-card">
                        <div class="resource-card-top">
                            <div class="resource-label"><i class="fa-solid fa-microchip"></i>CPU 使用率</div>
                            <div class="resource-value">${cpuPct}<span style="font-size:0.85rem;font-weight:400;color:rgba(255,255,255,0.5)">%</span></div>
                        </div>
                        <div class="resource-bar-wrap">
                            <div class="resource-bar cpu ${barClass(cpuPct, 'cpu')}" style="width:${cpuPct}%"></div>
                        </div>
                        <div class="resource-sub">
                            <span>${cpu.count ?? '?'} vCPU &mdash; ${(cpu.model || '').split('@')[0].trim()}</span>
                        </div>
                        <!-- Load Average -->
                        <div class="loadavg-row">
                            <div class="loadavg-item">
                                <div class="lv">${cpu.loadavg?.['1m'] ?? '-'}</div>
                                <div class="lt">1m avg</div>
                            </div>
                            <div class="loadavg-item">
                                <div class="lv">${cpu.loadavg?.['5m'] ?? '-'}</div>
                                <div class="lt">5m avg</div>
                            </div>
                            <div class="loadavg-item">
                                <div class="lv">${cpu.loadavg?.['15m'] ?? '-'}</div>
                                <div class="lt">15m avg</div>
                            </div>
                        </div>
                    </div>

                    <!-- Memory Card -->
                    <div class="resource-card">
                        <div class="resource-card-top">
                            <div class="resource-label"><i class="fa-solid fa-memory"></i>メモリ</div>
                            <div class="resource-value">${memPct}<span style="font-size:0.85rem;font-weight:400;color:rgba(255,255,255,0.5)">%</span></div>
                        </div>
                        <div class="resource-bar-wrap">
                            <div class="resource-bar mem ${barClass(memPct, 'mem')}" style="width:${memPct}%"></div>
                        </div>
                        <div class="resource-sub">
                            <span>使用: ${fmtBytes(mem.used ?? 0)}</span>
                            <span>合計: ${fmtBytes(mem.total ?? 0)}</span>
                        </div>
                    </div>

                    <!-- Process Card -->
                    <div class="resource-card">
                        <div class="resource-card-top">
                            <div class="resource-label"><i class="fa-brands fa-node-js"></i>Node.jsプロセス</div>
                            <div class="resource-value">${fmtBytes(proc.rss ?? 0)}</div>
                        </div>
                        <div class="resource-bar-wrap">
                            <div class="resource-bar proc ${barClass(procPct, 'proc')}" style="width:${Math.min(procPct * 5, 100)}%"></div>
                        </div>
                        <div class="resource-sub">
                            <span>Heap: ${fmtBytes(proc.heapUsed ?? 0)} / ${fmtBytes(proc.heapTotal ?? 0)}</span>
                            <span>起動: ${fmtUptime(proc.uptimeSec ?? 0)}</span>
                        </div>
                    </div>

                    <!-- OS Uptime Card -->
                    <div class="resource-card">
                        <div class="resource-card-top">
                            <div class="resource-label"><i class="fa-solid fa-clock-rotate-left"></i>OS 稼働時間</div>
                            <div class="resource-value" style="font-size:1.1rem">${fmtUptime(dOs.uptimeSec ?? 0)}</div>
                        </div>
                        <div class="resource-sub" style="margin-top:4px">
                            <span>${dOs.hostname ?? ''}</span>
                            <span>${dOs.platform ?? ''}</span>
                        </div>
                    </div>
                `;
            } catch (e) {
                grid.innerHTML = '<div style="color:rgba(255,255,255,0.35);font-size:0.85rem">リソース情報を取得できませんでした</div>';
            }
        }

        async function loadStatus() {
            const grid = document.getElementById('status-grid');
            try {
                const res = await fetch('/api/scraper-status');
                const data = await res.json();
                const items = data.items || [];

                if (items.length === 0) {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.4)">No statistics reported yet. Processes might be starting...</div>';
                    return;
                }

                grid.innerHTML = items.map(item => {
                    const lastRunMs = item.last_run ? new Date(item.last_run).getTime() : 0;
                    const staleSec  = (Date.now() - lastRunMs) / 1000;
                    const isStaleRunning = item.status === 'running' && staleSec > 180;

                    const effectiveStatus = isStaleRunning ? 'success' : (item.status || 'unknown');
                    const statusClass = effectiveStatus === 'success' ? 'ok' : effectiveStatus;
                    const statusText  = effectiveStatus === 'success' ? 'Healthy'
                                      : effectiveStatus === 'running' ? 'Active'
                                      : effectiveStatus === 'error'   ? 'Critical'
                                      : 'Unknown';

                    return `
                        <div class="status-card">
                            <div class="status-card-top">
                                <div class="status-name">${item.name || item.id}</div>
                                <div class="status-badge ${statusClass}">${statusText}</div>
                            </div>
                            <div class="status-info">
                                最終実行: ${timeAgo(item.last_run)}
                            </div>
                            <div class="status-time">
                                ID: ${item.id} <br>
                                更新: ${new Date(item.updated_at).toLocaleString('ja-JP')}
                            </div>
                            ${item.message ? `<div class="status-error-msg">${item.message}</div>` : ''}
                        </div>
                    `;
                }).join('');

            } catch (e) {
                grid.innerHTML = '<div style="color:#f44336">Failed to load status. Please try again.</div>';
            }
        }

        async function loadAll() {
            const btn = document.querySelector('.status-refresh-btn');
            if (btn) btn.disabled = true;
            await Promise.all([loadSystemInfo(), loadStatus()]);
            if (btn) btn.disabled = false;
        }

        document.addEventListener('DOMContentLoaded', loadAll);
        // 30秒ごとに自動更新
        setInterval(loadAll, 30000);
    </script>
    <script src="/ios-helper.js" defer></script>
    <script type="module" src="/dist/main.bundle.min.js?v=<?= @filemtime(__DIR__ . '/dist/main.bundle.min.js') ?: time(); ?>" defer></script>
</body>

</html>