<?php require __DIR__ . "/updatelogs.php"; ?>
<!doctype html>
<html lang="ja">

<head>
    <?php
    $pageTitle = "アップデート履歴";
    $pageDesc = "まいちゃん通知の更新ログ・アップデート履歴です。";
    $extraHead = '
    <style type="text/css">
        .log-date {
            font-size: 24px;
            font-weight: bold;
            padding: 15px;
            display: flex;
            align-items: center;
            white-space: nowrap;
            min-width: 140px;
        }

        .log-bg {
            background-color: #B11E7C;
            min-width: 4px;
            border-radius: 4px;
            margin: 15px 0;
        }

        .log-content {
            padding: 15px 20px;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .log-content ul {
            margin: 0;
            padding-left: 20px;
            line-height: 1.7;
        }

        .log-content li {
            margin-bottom: 8px;
        }

        .log-content li:last-child {
            margin-bottom: 0;
        }

        .log-image {
            max-width: 40vw;
            border-radius: 6px;
            margin-top: 15px;
            display: block;
        }

        .hidden-log {
            display: none !important;
        }

        .log-lines-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background-color: #f9f9f9;
            color: #555;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
            border: 1px solid #eee;
            align-self: flex-start;
            margin-bottom: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .log-lines-badge i {
            color: var(--color-primary);
            font-size: 0.75rem;
        }

        .log-category {
            margin: 4px 0;
        }

        .log-cat-badge {
            display: inline-block;
            font-size: 0.75rem;
            font-weight: bold;
            padding: 2px 10px;
            border-radius: 12px;
            margin-bottom: 4px;
        }

        .log-cat-badge.fix {
            background-color: #ffe0e0;
            color: #c0392b;
        }

        .log-cat-badge.add {
            background-color: #d5f5e3;
            color: #27ae60;
        }

        .log-category ul {
            margin-top: 0;
        }
    </style>
    ';
    include __DIR__ . "/head.php";
    ?>
</head>

<body id="app-body">
    <div id="header-slot">
        <?php include __DIR__ . "/header.php"; ?>
    </div>

    <main>
        <h2 class="history fade">Update logs</h2>

        <?php foreach ($updateLogs as $index => $log): ?>
            <div class="card log-card <?= $index >= 10 ? "hidden-log" : "" ?>">
                <div class="log-date"><?= htmlspecialchars(
                    $log["date"],
                ) ?></div>
                <div class="log-bg"></div>
                <?php if (isset($log["lines"])): ?>
                    <div class="log-lines-badge">
                        <i class="fa-solid fa-code"></i>
                        <span><?= htmlspecialchars(
                            $log["lines"],
                        ) ?> lines</span>
                    </div>
                <?php endif; ?>
                <?php
                $hasFix = isset($log["details"]["fix"]);
                $hasAdd = isset($log["details"]["add"]);
                $isCategorized = $hasFix || $hasAdd;
                ?>
                <?php if ($isCategorized): ?>
                    <?php if ($hasFix): ?>
                        <div class="log-category">
                            <span class="log-cat-badge fix">修正</span>
                            <ul>
                                <?php foreach ($log["details"]["fix"] as $detail): ?>
                                    <li><?= htmlspecialchars($detail) ?></li>
                                <?php endforeach; ?>
                            </ul>
                        </div>
                    <?php endif; ?>
                    <?php if ($hasAdd): ?>
                        <div class="log-category">
                            <span class="log-cat-badge add">追加</span>
                            <ul>
                                <?php foreach ($log["details"]["add"] as $detail): ?>
                                    <li><?= htmlspecialchars($detail) ?></li>
                                <?php endforeach; ?>
                            </ul>
                        </div>
                    <?php endif; ?>
                <?php else: ?>
                    <ul>
                        <?php foreach ($log["details"] as $detail): ?>
                            <li><?= htmlspecialchars($detail) ?></li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
                <?php if (isset($log["image"])): ?>
                    <img src="<?= htmlspecialchars(
                        $log["image"],
                    ) ?>" class="log-image" alt="Update view">
                <?php endif; ?>
            </div>
            </div>
        <?php endforeach; ?>

        <?php if (count($updateLogs) > 10): ?>
            <button id="load-more-btn" class="load-more-btn">もっと見る</button>
        <?php endif; ?>

        <a href="../" style="text-decoration:none; color:inherit; display:block;">
            <div style="
        background-color:#FFF;
        min-height:60px;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:10px 20px;
    ">
                <h3 style="margin:0;">通知ダッシュボードに戻る</h3>
            </div>
        </a>

    </main>

    <div id="footer-slot">
        <?php include __DIR__ . "/footer.php"; ?>
    </div>

    <script src="/ios-helper.js" defer></script>
    <script type="module" src="/dist/main.bundle.min.js?v=<?= @filemtime(
        __DIR__ . "/dist/main.bundle.min.js",
    ) ?:
        time() ?>" defer></script>
    <script src="/dist/ui-misc.min.js?v=<?= @filemtime(
        __DIR__ . "/dist/ui-misc.min.js",
    ) ?:
        time() ?>" defer></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const loadMoreBtn = document.getElementById('load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', () => {
                    const hiddenLogs = document.querySelectorAll('.hidden-log');
                    let count = 0;
                    hiddenLogs.forEach(log => {
                        if (count < 10) {
                            log.classList.remove('hidden-log');
                            count++;
                        }
                    });

                    if (document.querySelectorAll('.hidden-log').length === 0) {
                        loadMoreBtn.style.display = 'none';
                    }
                });
            }
        });
    </script>
</body>

</html>
