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
                <li>
                    <strong>登録者推移データの自動更新</strong>
                    <span class="note">現在は手動更新している登録者数データを自動取得・日次反映し、グラフを常に最新の状態にする。</span>
                </li>
                <li>
                    <strong>配信アーカイブのカテゴリ自動分類</strong>
                    <span class="note">手動でのカテゴリ付与は実装済み。次段階としてLLMによる自動提案・自動付与を検討。</span>
                </li>
                <li>
                    <strong>他配信プラットフォームのアーカイブ対応とデータ分析</strong>
                    <span class="note">Twitch・TwitCasting等のアーカイブ追加と横断分析。字幕・アーカイブ保存にコストがかかるため、資金状況を見ながら段階的に検討。</span>
                </li>
                <li>
                    <strong>LLM処理の精度・速度向上</strong>
                    <span class="note">感情判定・流行語抽出・配信判定などの分析モデルの見直しと、より高速・高精度なモデル投入を検討。</span>
                </li>
                <li>
                    <strong>まいちゃんの状態予測</strong>
                    <span class="note">投稿時刻・曜日・感情ラベルなどの統計から、体調や配信意欲の傾向を予測表示する機能を構想中。</span>
                </li>
                <li>
                    <strong>字幕生成の精度向上</strong>
                    <span class="note">ASMR・コラボ配信など自動字幕の誤認識が生じやすいケースで精度が上がる方式を検討。</span>
                </li>
            </ul>

            <h2>既知の問題</h2>
            <ul class="plan-list">
                <li>
                    <strong>登録者推移グラフの更新遅延</strong>
                    <span class="note">チャンネル登録者推移のグラフが今日までの最新データになっていない問題を調査中です（「登録者推移データの自動更新」で解消予定）。</span>
                </li>
                <li>
                    <strong>PubSubHubbub障害でYTの通知が届かなくなる</strong>
                    <span class="note">YouTubeの配信枠（待機所）・配信開始の検知はpubsubhubbub（Webhook購読）に依存しており、このサービスが障害になると通知が届かなくなる問題を調査中です。対策として、RSSフィード＋videos APIによる定期ポーリング（配信枠を取得する仕組みは実装済み）を併用し、PubSubHubbubより先に枠を検知してまだ通知していない場合はこちらから通知する仕組みへの変更を検討しています。配信開始（ライブ開始）の通知も同様に対応予定です。</span>
                </li>
                <li>
                    <strong><s>YTコミュニティやbilibiliの検出</s></strong>
                    <span class="note"><s>これらのプラットフォームの検出ができていない問題を調査中でしたが、通知への対応を実装しました。</s></span>
                </li>
                <li>
                    <strong><s>Fanboxの誤検知</s></strong>
                    <span class="note"><s>公式バナーを新規投稿として検知してしまう問題を修正しました。</s></span>
                </li>
                <li>
                    <strong><s>Twitterリポストの誤処理</s></strong>
                    <span class="note"><s>リポストに対してスケジュールを追加してしまう問題を修正しました。</s></span>
                </li>
                <li>
                    <strong><s>AIスケジュール追加の制限</s></strong>
                    <span class="note"><s>YouTube以外のプラットフォームでもタイトル・URLが付与されるよう対応しました（Twitch・TwitCasting等）。</s></span>
                </li>
                <li>
                    <strong><s>記念日通知の重複</s></strong>
                    <span class="note"><s>記念日通知が重複して送信されてしまう不具合を修正しました。</s></span>
                </li>
                <li>
                    <strong><s>リンク先カスタム設定</s></strong>
                    <span class="note"><s>リンク先カスタム設定の動作確認が完了し、クローム用のカスタムスキームにも対応しました。</s></span>
                </li>
                <li>
                    <strong><s>ヒートマップのスクロール不具合</s></strong>
                    <span class="note"><s>スマートフォン環境でヒートマップのスクロールが正常に動作しない問題を修正しました。</s></span>
                </li>
                <li>
                    <strong><s>プロセスステータス</s></strong>
                    <span class="note"><s>プロセスステータスの表示が不完全な問題を修正しました。</s></span>
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