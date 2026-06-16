<?php
$updateLogs = [
    [
        "date" => "2026-06-14",
        "details" => [
            "add" => [
		"Windowsアプリをリリース",
                "スケジュールに時間帯（朝/昼/夕方/夜/深夜）を追加。時刻未定の配信告知も「夜ごろ」等で予定登録できるように（events.time_period 列追加）",
                "管理画面のイベント編集に時間帯セレクトを追加。時間帯選択時は開始日だけ入力すればOK",
                "通知ポップアップにサムネイル画像を追加（Twitter/YouTube/TwitCasting/Twitch）。Windows/Androidアプリで配信サムネが表示されるように",
                "メモリ消費削減: Puppeteerブラウザのアイドル時自動クローズを実装",
            ],
            "fix" => [
		"肥大化していたメインのバックグラウンドシステムを分散、最適化",
                "Twitter監視が正しく実行されずエラーが検知されない不具合を修正（await漏れ・多重起動防止）",
                "スケジュールの日時タイムゾーンずれを修正（JST固定・保存形式をナイーブJSTに統一）",
                "管理画面でイベントが全て「未定」表示になる不具合を修正（confirmed判定の型不一致）",
                "自動追加されたスケジュールが必ず「未定」になる不具合を修正（具体時刻ありは確定扱い）",
                "週間予定のサムネイル描画とイベントURL/サムネのXSS対策（http(s)検証・エスケープ）",
                "メモリ消費削減: TwitCastingのプライベートライブ判定(Chrome起動)を5秒毎→既定60秒毎に間引き",
            ],
        ],
        "lines" => "28,217",
    ],
    [
        "date" => "2026-05-27",
        "details" => [
            "change" => [
                "weekly/twitcasting.js をスタブから本実装に差し替え（TwitCasting API v2 Basic認証）",
                "twitcasting.js の未宣言変数 (NOTIFY_TOKEN, NOTIFY_ENDPOINT等) を修正、クラッシュ原因を除去",
                "pm2 restart で env 変更が反映されない問題: scripts/restart.sh + npm scripts 追加",
                "既存 healthcheck.sh が Worker もチェックするよう拡張",
            ],
            "fix" => [
                "weekly/twitcasting.js が過去動画全件を events テーブルに登録していた問題を修正（配信中のみに制限）",
                "twitcasting.js の retryAsync: ERR_NETWORK_CHANGED もリトライ対象に追加",
            ],
            "add" => [
                "TwitCasting 配信開始時に events テーブルへ自動登録 (syncEventToSchedule)",
                "Twitch 配信開始時に events テーブルへ自動登録（サムネイル・タイトル付き）",
                "Worker に GET /api/health 死活監視エンドポイント追加",
                "API に GET /api/health 死活監視エンドポイント追加",
                "/etc/nginx/nginx.conf に /api/worker-health → worker(3002) の proxy 追加",
                "scripts/health-check.js: 全プロセスのヘルスチェックCLI",
            ],
        ],
        "lines" => "26,780",
    ],
    [
        "date" => "2026-05-26",
        "details" => [
            "change" => [
                "server.js を3847行→118行にリファクタリング、routes/ + services/ に分割",
                "全5スクレイパーに onRecovery コールバック追加（エラー回復時にステータス自動復帰）",
                "TwitCasting retryAsync が ERR_NETWORK_CHANGED を一時エラーとしてリトライするよう修正",
                "TwitCasting OAuthルート（未使用）を削除、twitcasting.js のデッドコード除去",
            ],
            "fix" => [
                "リファクタリング時に脱落していた /api/get-user-data, /api/send-test を復元",
                "全スクレイパーでエラー→成功時にステータスがerrorのまま張り付く不具合を修正",
                "TwitCasting: 401認証エラー修正（Bearer→Basic認証に変更）",
                "サーバー高負荷問題の原因特定・修正（OOM Killer / detached frame / トークン期限切れ）",
            ],
            "add" => [
                "Twitter: XスクレイパーをFirefox→Chromeに移行",
            ],
        ],
    ],
    ["date" => "2026-05-24", "details" => ["add" => ["通知履歴に画像追加"]]],
    [
        "date" => "2026-05-15",
        "details" => ["fix" => ["セキュリティ更新"]],
    ],
    [
        "date" => "2026-05-08",
        "details" => ["add" => ["Twitter画像用のメディアアーカイブ追加"]],
    ],
    [
        "date" => "2026-05-04",
        "details" => ["fix" => ["Googleのセッションの有効期限を7日から1年に延長"]],
    ],
    [
        "date" => "2026-05-03",
        "details" => ["fix" => ["Fanbox,bilibili,YoutubeCommunityの通知取得方法を改善"]],
    ],
    ["date" => "2026-04-19", "details" => [""], "lines" => "20,432"],
    [
        "date" => "2026-04-11",
        "details" => ["fix" => [
            "バックエンドでのメモリ消費量削減",
            "使用するAIにメモリ圧縮技術を適用",
        ]],
    ],
    [
        "date" => "2026-04-07",
        "details" => [
            "add" => [
                "プラットフォーム毎のカスタムリンク機能（URLテンプレート）を実装",
                "通知履歴に「リンク設定」パネルを追加し、カスタムスキーム（youtube://等）に対応",
                "ヒートマップと通知履歴にスケルトンローディング画面を追加",
                "フッターの各プラットフォームアイコンにホバー時の名称表示を追加",
                "システムの稼働状況を追加",
            ],
            "fix" => [
                "履歴の「もっと見る」で正常に20件以上取得できない不具合を修正",
                "ヒートマップの時刻表示を日本時間（JST）に修正",
                "スマホ表示時、通知履歴のスクロール位置がずれる問題を修正",
            ],
        ],
        "lines" => "19,603",
    ],
    [
        "date" => "2026-04-05",
        "details" => [
            "fix" => ["通知受信システムの最適化"],
            "add" => ["スケジュールにローカルAI(Gemma4)を導入"],
        ],
        "lines" => "19,730",
    ],
    [
        "date" => "2026-03-29",
        "details" => ["fix" => ["セキュリティ強化"]],
        "lines" => "19,207",
    ],
    [
        "date" => "2026-03-28",
        "details" => ["fix" => ["DB周りの最適化"]],
        "lines" => "19,179",
    ],
    [
        "date" => "2026-03-12",
        "details" => ["add" => ["Androidアプリをリリース"]],
        "lines" => "17,772",
    ],
    [
        "date" => "2026-03-10",
        "details" => [
            "fix" => [
                "スケジュールUI変更",
                "新規スケジュール追加時に必ず未定表示になる問題を修正",
                "管理者画面で全てのスケジュールが未定になる問題を修正",
                "YT自動スケジュール追加の時に既存の10分以内のスケジュールを削除するよう変更",
                "YT自動スケジュール追加を2週間のみに制限",
                "バックエンドでのセキュリティ強化",
            ],
            "add" => [
                "スケジュールにまいちゃんのメモを追加",
            ],
        ],
    ],
    [
        "date" => "2026-03-07",
        "details" => ["fix" => ["Androidアプリ実装準備のためのCSS最適化"]],
    ],
    [
        "date" => "2026-03-06",
        "details" => ["fix" => [
            "Safariでの表示、スクロール問題を修正",
            "UI改善",
        ]],
    ],
    [
        "date" => "2026-03-03",
        "details" => ["add" => [
            "複数デバイスでの利便性向上のため、Googleアカウントによるログイン機能を追加",
            "Googleアカウント別でスケジュール追加が可能になる",
        ]],
        "lines" => "15,684",
    ],
    [
        "date" => "2026-03-02",
        "details" => [
            "fix" => [
                "管理者通知パネルのUIを大幅に改善",
                "通知ダッシュボードのUI改善",
            ],
            "add" => [
                "クリックで喋る3Dまいちゃん追加",
                "スケジュールにまいちゃんの一言追加",
                "チャンネル登録者数推移の情報を追加",
                "デビューと推し日数に年月表記追加",
            ],
        ],
        "lines" => "14,000+",
    ],
    [
        "date" => "2026-02-25",
        "details" => ["fix" => [
            "スケジュール通知がadminとして通知や履歴を残す問題を修正",
            "youtubeのAPIを大量に使用する不具合を修正",
        ]],
    ],
    [
        "date" => "2026-02-24",
        "details" => ["add" => ["bilibli通知(現状配信のみ)追加", "スケジュール通知追加"]],
    ],
    [
        "date" => "2026-02-07",
        "details" => ["add" => [
            "週間予定表の編集ページ追加",
            "予定表の自動追加(現時点でYTのみ)",
            "rss対応",
        ]],
        "lines" => "12,312",
    ],
    ["date" => "2026-02-06", "details" => ["add" => ["週間予定表を追加"]]],
    [
        "date" => "2026-02-05",
        "details" => ["add" => [
            "YouTubeのコミュニティ投稿の通知取得方法を変更、通知可能に",
        ]],
    ],
    [
        "date" => "2026-02-03",
        "details" => ["fix" => [
            "Twitchの複数通知バグの修正のためステータスのメモリ保存からストレージへの保存に変更",
        ]],
    ],
    [
        "date" => "2026-02-01",
        "details" => [
            "add" => [
                "通知するプラットフォームにTwitchを追加",
                "管理者通知送信フォームに予約通知追加",
            ],
            "fix" => ["管理者用ログインページからのリダイレクトを修正"],
        ],
    ],
    [
        "date" => "2026-01-16",
        "details" => ["fix" => ["phpを導入し、一部htmlをphpに変更"]],
        "lines" => "10,393",
    ],
    [
        "date" => "2026-01-15",
        "details" => ["fix" => [
            "通知履歴最初の5件をhistory.htmlとして生成しておくことにより初期ロードが爆速化",
            "API統合により速度向上",
        ]],
    ],
    [
        "date" => "2026-01-14",
        "details" => ["fix" => [
            "Node.jsをv20.18.1→v24.13.0に更新",
            "初期ロード時ハンバーガーメニューが即時開けないように1s遅延",
            "初期状態でGiptもTrueになるように変更",
            "速度向上のためスマホでは使われないFontAwesomeを読み込まないように変更",
            "画像ファイルの最適化",
        ]],
    ],
    [
        "date" => "2026-01-13",
        "details" => ["fix" => [
            "html,css,jsはキャッシュせず画像ファイルのみキャッシュするようにservice-worker.jsを変更",
        ]],
    ],
    [
        "date" => "2026-01-08",
        "details" => ["add" => ["Gipt稼働", "左からまいちゃんが出現する追加"]],
    ],
    [
        "date" => "2026-01-07",
        "details" => ["fix" => [
            "PCでのプッシュ通知外部リンク先を新しいタブで開くように変更",
            "メニューよりfooterが前面に出ていたのを修正",
        ]],
    ],
    [
        "date" => "2026-01-06",
        "details" => [
            "fix" => [
                "各ページheaderとfooterの統一",
                "Gipt機能停止",
            ],
            "add" => [
                "メニューバーのスクロール",
                "Update logsの追加",
            ],
        ],
    ],
    ["date" => "2025-12-21", "details" => ["add" => ["Gipt追加"]]],
    [
        "date" => "2025-11-29",
        "details" => ["fix" => ["YTコミュニティ以外、全てのプラットフォームで動作確認済み"]],
    ],
    ["date" => "2025-11-26", "details" => ["add" => ["リリース", "推し日数追加"]]],
    [
        "date" => "2025-11-25",
        "details" => ["add" => [
            "横スワイプメニュー開閉",
            "通知履歴プラットフォーム毎表示切り替え",
        ]],
    ],
    [
        "date" => "2025-11-17",
        "details" => ["add" => ["テスト運用開始"]],
        "lines" => "5,600+",
    ],
    [
        "date" => "2025-11-09",
        "details" => ["add" => ["開発開始"]],
        "image" => "/start.png",
    ],
]; ?>
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
