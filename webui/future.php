<!doctype html>
<html lang="ja">

<head>
    <?php
    $pageTitle = "今後の開発予定";
    $pageDesc = "まいちゃん通知の今後の開発予定、新機能追加、既知の問題に対する修正などをまとめています。";
    $extraHead = '
    <style type="text/css">
        .future-intro {
            font-size: 1rem;
            background: rgba(250, 250, 250, 0.85);
            color: #000;
            border-radius: 12px;
            padding: 32px;
            margin-bottom: 20px;
            line-height: 1.7;
        }

        .future-intro h2 {
            font-size: 1.4rem;
            color: var(--color-primary, #b48cff);
            margin-top: 32px;
            margin-bottom: 16px;
            border-bottom: 2px solid var(--color-primary, #b48cff);
            padding-bottom: 6px;
            font-weight: bold;
        }

        .future-intro h2:first-child {
            margin-top: 0;
        }

        .plan-list {
            margin: 16px 0;
            padding-left: 0;
            list-style: none;
        }

        .plan-list li {
            margin-bottom: 20px;
            padding-left: 1.2em;
            position: relative;
        }

        .plan-list li::before {
            content: "・";
            position: absolute;
            left: 0;
            color: var(--color-primary, #b48cff);
            font-weight: bold;
        }

        .plan-list li strong {
            display: inline-block;
            margin-bottom: 6px;
            font-size: 1.1rem;
        }

        .note {
            display: block;
            font-size: 0.95em;
            color: #444;
            margin-top: 4px;
            line-height: 1.5;
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
        <section class="future-intro">
            <h2>新機能追加予定</h2>
            <ul class="plan-list">
            </ul>

            <h2>既知の問題</h2>
            <ul class="plan-list">
                <li>
                    <strong>YTコミュニティやbilibiliの検出</strong>
                    <span class="note">これらのプラットフォームの検出ができていない問題を調査中です。</span>
                </li>
                <li>
                    <strong><s>Fanboxの誤検知</s></strong>
                    <span class="note"><s>公式バナーを新規投稿として検知してしまう問題を修正予定です。</s></span>
                </li>
                <li>
                    <strong><s>Twitterリポストの誤処理</s></strong>
                    <span class="note"><s>リポストに対してスケジュールを追加してしまう問題の対応を進めています。</s></span>
                </li>
                <li>
                    <strong>AIスケジュール追加の制限</strong>
                    <span class="note">YouTube以外のプラットフォームで、タイトル・URL・サムネイルの追加ができない問題の改善を予定しています。</span>
                </li>
                <li>
                    <strong>記念日通知の重複</strong>
                    <span class="note">記念日通知が重複して送信されてしまう不具合の修正を進めています。</span>
                </li>
                <li>
                    <strong>登録者推移グラフの更新遅延</strong>
                    <span class="note">チャンネル登録者推移のグラフが今日までの最新データになっていない問題を調査中です。</span>
                </li>
                <li>
                    <strong>リンク先カスタム設定</strong>
                    <span class="note">リンク先カスタム設定の動作確認と修正を進めています。</span>
                </li>
                <li>
                    <strong><s>ヒートマップのスクロール不具合</s></strong>
                    <span class="note"><s>スマートフォン環境でヒートマップのスクロールが正常に動作しない問題の対応を予定しています。</s></span>
                </li>
                <li>
                    <strong><s>プロセスステータス</s></strong>
                    <span class="note"><s>プロセスステータスの表示が不完全な問題の改善を進めています。</s></span>
                </li>
            </ul>
        </section>

        <a href="/" style="text-decoration:none; color:inherit; display:block;">
            <div style="
                background-color:#FFF;
                min-height:60px;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:10px 20px;
                border-radius: 12px;
            ">
                <h3 style="margin:0;">通知ダッシュボードに戻る</h3>
            </div>
        </a>
    </main>

    <div id="footer-slot">
        <?php include __DIR__ . '/footer.php'; ?>
    </div>

    <!-- iOS Helper -->
    <script src="/ios-helper.js" defer></script>
    <script type="module" src="/dist/main.bundle.min.js?v=<?= @filemtime(__DIR__ . '/dist/main.bundle.min.js') ?: time(); ?>" defer></script>

</body>

</html>