<?php require __DIR__ . "/updatelogs.php"; ?>
<!doctype html>
<html lang="ja">

<head>
    <?php
    $pageTitle = "アップデート履歴";
    $pageDesc = "まいちゃん通知の更新ログ・アップデート履歴です。";
    $extraHead = '<link rel="stylesheet" href="/css/logs.css?v=' . @filemtime(__DIR__ . '/css/logs.css') . '>';
    include __DIR__ . "/head.php";
    ?>
</head>

<body id="app-body">
    <div id="header-slot">
        <?php include __DIR__ . "/header.php"; ?>
    </div>

    <main>
        <h2 class="history fade">Update logs</h2>

        <?php
        // --- コード成長グラフ（lines 値をインラインSVGで描画・ライブラリ不要）---
        $chartPts = [];
        foreach ($updateLogs as $log) {
            if (isset($log["lines"])) {
                $n = (int) preg_replace('/[^0-9]/', '', (string) $log["lines"]);
                if ($n > 0) {
                    // X軸を実日付の時間軸にするためタイムスタンプを持たせる
                    $ts = strtotime($log["date"]);
                    if ($ts) {
                        $chartPts[] = ["date" => $log["date"], "n" => $n, "disp" => $log["lines"], "ts" => $ts];
                    }
                }
            }
        }
        $chartPts = array_reverse($chartPts); // 古い→新しい（左→右）
        ?>
        <?php if (count($chartPts) >= 2): ?>
            <?php
            $cMin = min(array_column($chartPts, "n"));
            $cMax = max(array_column($chartPts, "n"));
            $cCount = count($chartPts);
            $W = 820; $H = 280;
            $padL = 74; $padR = 20; $padT = 18; $padB = 34;
            $iw = $W - $padL - $padR; $ih = $H - $padT - $padB;
            // X軸は実日付の時間軸（更新間隔が一定でないため、日付の経過に比例して配置）
            $t0 = (int) $chartPts[0]["ts"];
            $tN = (int) $chartPts[$cCount - 1]["ts"];
            $tSpan = max(1, $tN - $t0);
            $xOf = function ($p) use ($padL, $iw, $t0, $tSpan) {
                return $padL + $iw * (((int) $p["ts"] - $t0) / $tSpan);
            };
            $rng = max(1, $cMax - $cMin);
            // 下限を滑らかに（最小値の下に少し余白を作る）
            $yMin = max(0, $cMin - $rng * 0.10);
            $yMax = $cMax + $rng * 0.08;
            $yOf = function ($n) use ($padT, $ih, $yMin, $yMax) {
                return $padT + $ih * (1 - ($n - $yMin) / max(1, $yMax - $yMin));
            };
            $linePts = [];
            foreach ($chartPts as $p) { $linePts[] = round($xOf($p), 1) . "," . round($yOf($p["n"]), 1); }
            $polyline = implode(" ", $linePts);
            $baseY = round($padT + $ih, 1);
            $areaPath = "M " . $linePts[0] . " L " . implode(" L ", array_slice($linePts, 1)) . " L " . round($xOf($chartPts[$cCount - 1]), 1) . "," . $baseY . " L " . round($xOf($chartPts[0]), 1) . "," . $baseY . " Z";
            // Y軸ラベル用の値（下端/中間/上端）
            $yVals = [$yMin + ($yMax - $yMin) * 0, $yMin + ($yMax - $yMin) * 0.5, $yMax];
            ?>
            <div class="card log-card history-chart-card">
                <div class="log-date" style="font-size:18px;"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> コード成長（行数の推移）</div>
                <div class="log-bg"></div>
                <svg viewBox="0 0 <?= $W ?> <?= $H ?>" style="width:100%;height:auto;display:block;" role="img" aria-label="コード行数の推移グラフ">
                    <defs>
                        <linearGradient id="lineFillGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#B11E7C" stop-opacity=".28"/>
                            <stop offset="100%" stop-color="#B11E7C" stop-opacity=".02"/>
                        </linearGradient>
                    </defs>
                    <?php foreach ($yVals as $yi => $yv): ?>
                        <?php $yLine = round($yOf($yv), 1); ?>
                        <line x1="<?= $padL ?>" y1="<?= $yLine ?>" x2="<?= $W - $padR ?>" y2="<?= $yLine ?>" stroke="#eee" stroke-width="1"/>
                        <text x="<?= $padL - 8 ?>" y="<?= $yLine + 4 ?>" text-anchor="end" font-size="12" fill="#999"><?= number_format((int) round($yv)) ?></text>
                    <?php endforeach; ?>
                    <path d="<?= $areaPath ?>" fill="url(#lineFillGrad)"/>
                    <polyline points="<?= $polyline ?>" fill="none" stroke="#B11E7C" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
                    <?php foreach ($chartPts as $p): ?>
                        <circle cx="<?= round($xOf($p), 1) ?>" cy="<?= round($yOf($p["n"]), 1) ?>" r="4" fill="#fff" stroke="#B11E7C" stroke-width="2">
                            <title><?= htmlspecialchars($p["date"]) ?> — <?= htmlspecialchars($p["disp"]) ?> lines</title>
                        </circle>
                    <?php endforeach; ?>
                    <text x="<?= $padL ?>" y="<?= $H - 10 ?>" font-size="12" fill="#888"><?= htmlspecialchars($chartPts[0]["date"]) ?></text>
                    <text x="<?= $W - $padR ?>" y="<?= $H - 10 ?>" text-anchor="end" font-size="12" fill="#888"><?= htmlspecialchars($chartPts[$cCount - 1]["date"]) ?></text>
                </svg>
            </div>
        <?php endif; ?>

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
    <script src="/js/logs-load-more.js?v=<?= @filemtime(__DIR__ . '/js/logs-load-more.js') ?: time(); ?>"></script>
</body>

</html>
