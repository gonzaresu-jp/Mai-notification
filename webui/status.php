<?php
// status.php
include __DIR__ . '/head.php';
?>
<title>システム稼働状況 - まいちゃん通知</title>
<style>
    .status-container {
        max-width: 900px;
        margin: 0px auto;
        padding: 20px;
        background-color: #ffffff4a;
        backdrop-filter: blur(10px);
    }

    .status-header {
        margin-bottom: 30px;
        text-align: center;
    }

    .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
    }

    .status-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 20px;
        backdrop-filter: blur(10px);
        transition: transform 0.2s, background 0.2s;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .status-card:hover {
        background: rgba(255, 255, 255, 0.08);
        transform: translateY(-2px);
    }

    .status-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .status-name {
        font-weight: 600;
        font-size: 1.1rem;
        color: #fff;
    }

    .status-badge {
        font-size: 0.75rem;
        padding: 4px 10px;
        border-radius: 12px;
        font-weight: 700;
        text-transform: uppercase;
    }

    .status-badge.ok {
        background: #4caf50;
        color: #fff;
    }

    .status-badge.error {
        background: #f44336;
        color: #fff;
    }

    .status-badge.running {
        background: #2196f3;
        color: #fff;
    }

    .status-badge.unknown {
        background: #999;
        color: #fff;
    }

    .status-info {
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.6);
    }

    .status-time {
        font-size: 0.8rem;
        color: rgba(255, 255, 255, 0.4);
    }

    .status-error-msg {
        font-size: 0.85rem;
        color: #ff8a80;
        background: rgba(244, 67, 54, 0.1);
        padding: 8px;
        border-radius: 8px;
        margin-top: 5px;
        word-break: break-all;
    }

    .status-refresh-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        padding: 8px 16px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }

    .status-refresh-btn:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .status-refresh-btn i {
        font-size: 0.8rem;
    }

    @media (max-width: 600px) {
        .status-container {
            margin: 20px auto;
            padding: 15px;
        }

        .status-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<body id="app-body">
    <?php include __DIR__ . '/header.php'; ?>

    <div class="status-container">
        <div class="status-header">
            <h1>システム稼働状況</h1>
            <p>バックグラウンドプロセスの健康状態をリアルタイムで表示します。</p>
            <button class="status-refresh-btn" onclick="loadStatus()">
                <i class="fa-solid fa-rotate"></i> 更新
            </button>
        </div>

        <div id="status-grid" class="status-grid">
            <!-- JSで動的に挿入 -->
            <div class="status-loading">Loading systems health...</div>
        </div>
    </div>

    <?php include __DIR__ . '/footer.php'; ?>

    <script>
        function timeAgo(date) {
            if (!date) return 'Never';
            const seconds = Math.floor((new Date() - new Date(date)) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + " years ago";
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + " months ago";
            interval = seconds / 86400;
            if (interval > 1) return Math.floor(interval) + " days ago";
            interval = seconds / 3600;
            if (interval > 1) return Math.floor(interval) + " hours ago";
            interval = seconds / 60;
            if (interval > 1) return Math.floor(interval) + " minutes ago";
            return Math.floor(seconds) + " seconds ago";
        }

        async function loadStatus() {
            const grid = document.getElementById('status-grid');
            const btn = document.querySelector('.status-refresh-btn');
            if (btn) btn.disabled = true;

            try {
                const res = await fetch('/api/scraper-status');
                const data = await res.json();
                const items = data.items || [];

                if (items.length === 0) {
                    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.4);">No statistics reported yet. Processes might be starting...</div>';
                    return;
                }

                grid.innerHTML = items.map(item => {
                    const statusClass = item.status === 'success' ? 'ok' : (item.status || 'unknown');
                    const statusText = item.status === 'success' ? 'Healthy' : (item.status === 'running' ? 'Active' : (item.status === 'error' ? 'Critical' : 'Unknown'));

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
                grid.innerHTML = '<div style="color: #f44336;">Failed to load status. Please try again.</div>';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        document.addEventListener('DOMContentLoaded', loadStatus);
        // 30秒ごとに自動更新
        setInterval(loadStatus, 30000);
    </script>
</body>

</html>