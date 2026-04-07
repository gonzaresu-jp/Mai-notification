<!doctype html>
<html lang="ja">

<head>
    <?php
    $pageTitle = "Androidアプリをダウンロード";
    $pageDesc = "まいちゃん通知のAndroid版公式アプリのダウンロードページです。アプリ版ではさらに便利にプッシュ通知を受け取れます。";
    $extraHead = '
    <style type="text/css">
        dt {
            font-size: 24px;
        }

        .bg {
            background-color: #B11E7C;
            min-width: 3px;
        }

        img {
            max-width: 40vw;
        }

        #day {
            white-space: nowrap;
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

    <main class="download-page">
        <div class="card"><a href="../mai-notification.apk" target="_blank" rel="noopener noreferrer">
                <dl>
                    <dt class="header-left"><img src="/icon.webp" alt="まいちゃんロゴ" class="logo fade"
                            fetchpriority="high" /></dt>
                </dl>
                <dl>
                    <dt>Androidアプリをダウンロード</dt>
                </dl>
            </a>
        </div>

        <a href="../" style="text-decoration:none; color:inherit; display:block;">
            <div style="
        background-color:#FFF;
        min-height:60px;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:10px 20px; /* ←クリック範囲を広げる */
    ">
                <h3 style="margin:0;">通知ダッシュボードに戻る</h3>
            </div>
        </a>




    </main>

    <div id="footer-slot">
        <?php include __DIR__ . '/footer.php'; ?>
    </div>

    <!-- iOS Helper を main.js より先に読み込む -->
    <script src="/ios-helper.js" defer></script>
    <script type="module" src="/js/main.js?v=<?= @filemtime(__DIR__ . '/js/main.js') ?: time(); ?>" defer></script>
    <script src="/js/ui-misc.js?v=<?= @filemtime(__DIR__ . '/js/ui-misc.js') ?: time(); ?>" defer></script>
</body>

</html>