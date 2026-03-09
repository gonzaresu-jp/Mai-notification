<!-- まいちゃん愛してる！ -->
<!doctype html>
<html lang="ja">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <!-- =====================================================
         SEO: タイトル・概要
         ===================================================== -->
    <title>まいちゃん通知 | 恋乃夜まい 配信・活動通知サービス</title>
    <meta name="description" content="恋乃夜まい（koinoyamai）の配信・活動をリアルタイムで通知。YouTube・TwitCasting・Twitch・Twitter・Pixiv Fanboxなど複数プラットフォームに対応した非公式ファンサービスです。" />
    <meta name="keywords" content="恋乃夜まい,koinoyamai,まいちゃん,まいちゃん通知,配信通知,ライブ通知,YouTube通知,TwitCasting,Twitch,Vtuber,バーチャルYouTuber,ファンサイト" />

    <!-- canonical：重複URLペナルティ防止 -->
    <link rel="canonical" href="https://mai.honna-yuzuki.com/" />

    <!-- robots（デフォルト許可。必要に応じて noindex に変更） -->
    <meta name="robots" content="index, follow" />

    <!-- =====================================================
         OGP（Open Graph）
         ===================================================== -->
    <meta property="og:url"         content="https://mai.honna-yuzuki.com/" />
    <meta property="og:type"        content="website" />
    <meta property="og:title"       content="まいちゃん通知 | 恋乃夜まい 配信・活動通知サービス" />
    <meta property="og:description" content="恋乃夜まい（koinoyamai）の配信・活動をリアルタイムで通知。YouTube・TwitCasting・Twitch・Twitter・Pixiv Fanboxなど複数プラットフォームに対応した非公式ファンサービスです。" />
    <meta property="og:site_name"   content="まいちゃん通知" />
    <meta property="og:image"       content="https://mai.honna-yuzuki.com/social.jpg" />
    <meta property="og:image:alt"   content="まいちゃん通知 ロゴ" />
    <meta property="og:locale"      content="ja_JP" />

    <!-- =====================================================
         Twitter Card
         ===================================================== -->
    <meta name="twitter:card"        content="summary_large_image" />
    <meta name="twitter:site"        content="@Yuzuki_Mai_17" />
    <meta name="twitter:title"       content="まいちゃん通知 | 恋乃夜まい 配信・活動通知サービス" />
    <meta name="twitter:description" content="恋乃夜まい（koinoyamai）の配信・活動をリアルタイムで通知。YouTube・TwitCasting・Twitch・Twitterなど複数プラットフォーム対応。" />
    <meta name="twitter:image"       content="https://mai.honna-yuzuki.com/social.jpg" />
    <meta name="twitter:image:alt"   content="まいちゃん通知 ロゴ" />

    <!-- =====================================================
         iOS / PWA 対応
         ===================================================== -->
    <meta name="apple-mobile-web-app-capable"          content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title"            content="まいちゃん通知" />
    <meta name="mobile-web-app-capable"                content="yes" />

    <!-- =====================================================
         アイコン / manifest
         ===================================================== -->
    <link rel="icon"              href="./icon.webp" />
    <link rel="apple-touch-icon"              href="./icon-192.webp" />
    <link rel="apple-touch-icon" sizes="192x192" href="./icon-192.webp" />
    <link rel="apple-touch-icon" sizes="512x512" href="./icon-512.webp" />
    <link rel="manifest"          href="./manifest.json" />

    <!-- =====================================================
         構造化データ（JSON-LD）
         WebSite スキーマ：サイト名・URL・検索アクション
         ===================================================== -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "まいちゃん通知",
      "alternateName": "恋乃夜まい 通知ダッシュボード",
      "url": "https://mai.honna-yuzuki.com/",
      "description": "恋乃夜まい（koinoyamai）の配信・活動をリアルタイムで通知する非公式ファンサービス。",
      "inLanguage": "ja",
      "author": {
        "@type": "Person",
        "name": "honna-yuzuki"
      }
    }
    </script>

    <!-- =====================================================
         CSS
         ===================================================== -->
    <link rel="stylesheet" href="./style.v2.98.css" />
    <link rel="stylesheet" href="./top-card.v2.44.css" />

    <!-- =====================================================
         preconnect（実際に外部フェッチが発生するホストのみ）
         FontAwesome はセルフホスト済みなので不要
         ===================================================== -->
    <link rel="preconnect" href="https://elza.poitou-mora.ts.net" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <!-- api.honna-yuzuki.com など API ホストが別ドメインの場合はここに追加 -->

    <!-- =====================================================
         スクリプト
         ===================================================== -->
    <!-- iOS Helper を main.js より先に読み込む -->
    <script src="/ios-helper.js" defer></script>

    <!-- FontAwesome（セルフホスト） -->
    <link rel="stylesheet" href="/fontawesome-free-7.2.0-web/css/all.min.css" crossorigin="anonymous" />

    <!-- Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Kaisei+Tokumin&display=swap" rel="stylesheet" />

    <!-- google -->
    <meta name="google-site-verification" content="Cy8Wfrb-EEkhphBoNiZV2P6dFt9g501JONelux-P2jQ" />
</head>
<body id="app-body" class="menu-transitions-disabled">

    <!-- ✅ div → header（セマンティック改善） -->
    <section id="header-slot">
        <?php include __DIR__ . '/header.html'; ?>
    </section>

    <!-- 左画像パネル -->
    <div class="left-mai">
        <button class="btn btn-flat open" type="button" aria-label="パネルを開く" aria-expanded="false" aria-controls="left-mai-main">
            <i class="fa-solid fa-angle-right" style="color: #040300;" aria-hidden="true"></i>
        </button>
        <div class="mask">
            <img src="./left-mai.webp" alt="まいちゃん" fetchpriority="high" />
        </div>

        <main id="left-mai-main">

            <!-- ✅ stats-card に role="region" + aria-label -->
            <div class="stats-card bg-blur" role="region" aria-label="統計情報">
                <img src="./3dmai.webp" alt="" class="count-bg-mai" aria-hidden="true" />

                <!-- ✅ カルーセルに role="region" + aria-label、ドットに role="tablist" -->
                <div class="stats-carousel" role="region" aria-label="情報カルーセル" aria-roledescription="carousel">
                    <div class="stats-carousel-inner">

                        <!-- ===== ページ1：カウント ===== -->
                        <!-- ✅ role="tabpanel" + aria-label でスクリーンリーダー対応 -->
                        <div class="stats-page count-page" role="tabpanel" aria-label="カウント" aria-roledescription="スライド">
                            <h2 style="margin-top:0;font-size:1.5rem;">カウント</h2>

                            <div class="stats-grid">
                                <div class="stat-item">
                                    <button type="button" class="stat-copy-btn" data-copy-target="days-since-debut" aria-label="デビューからの日数をコピー"><i class="fa-regular fa-clipboard"></i></button>
                                    <div class="label">デビューから</div>
                                    <div class="value" id="days-since-debut" aria-live="polite" aria-atomic="true">0</div>
                                </div>

                                <div class="stat-item">
                                    <button type="button" class="stat-copy-btn" data-copy-target="days-to-birthday" aria-label="お誕生日までの日数をコピー"><i class="fa-regular fa-clipboard"></i></button>
                                    <div class="label">お誕生日まで</div>
                                    <div class="value" id="days-to-birthday" aria-live="polite" aria-atomic="true">0</div>
                                </div>

                                <div class="stat-item">
                                    <button type="button" class="stat-copy-btn" data-copy-target="days-to-anniversary" aria-label="周年記念までの日数をコピー"><i class="fa-regular fa-clipboard"></i></button>
                                    <div class="label">周年記念まで</div>
                                    <div class="value" id="days-to-anniversary" aria-live="polite" aria-atomic="true">0</div>
                                </div>

                                <div class="stat-item">
                                    <button type="button" class="stat-copy-btn" data-copy-target="days-to-meet" aria-label="推してからの日数をコピー"><i class="fa-regular fa-clipboard"></i></button>
                                    <div class="label">推してから</div>
                                    <div class="value" id="days-to-meet" aria-live="polite" aria-atomic="true">0</div>
                                </div>
                            </div>
                        </div>

                        <!-- ===== ページ2：週間予定表 ===== -->
                        <div class="stats-page" role="tabpanel" aria-label="スケジュール" aria-roledescription="スライド">
                            <div class="week-head">
                                <!-- ✅ aria-label を追加（アイコンのみのボタン対応） -->
                                <button onclick="navigateWeek(-1)" class="week-arrow" type="button" aria-label="前の週へ">
                                    <i class="fa-solid fa-angle-left" style="color: #040300;" aria-hidden="true"></i>
                                </button>

                                <h2 class="week-title">スケジュール</h2>

                                <button onclick="navigateWeek(1)" class="week-arrow" type="button" aria-label="次の週へ">
                                    <i class="fa-solid fa-angle-right" style="color: #040300;" aria-hidden="true"></i>
                                </button>
                            </div>
                            <div class="week-content">
                                <button id="week-add-user-schedule" class="week-add-btn" type="button" aria-label="予定を追加">+</button>
                                <div id="weekly-schedule" aria-live="polite" aria-atomic="false"></div>
                                <div id="weekly-message" role="status" aria-live="polite"></div>
                            </div>
                        </div>

                        <!-- ===== ページ3：チャンネル登録者数 ===== -->
                        <div class="stats-page sub-page" role="tabpanel" aria-label="登録者推移" aria-roledescription="スライド">

                            <div class="sub-header">
                                <h2 class="sub-title">登録者推移</h2>
                                <!-- ✅ role="status" で読み込み状態をスクリーンリーダーに伝える -->
                                <span class="sub-loading-badge" id="sub-loading-badge" role="status" aria-live="polite">読込中…</span>
                            </div>

                            <!-- ✅ プラットフォームタブに role="tablist" -->
                            <div class="sub-platform-tabs" id="sub-platform-tabs" role="tablist" aria-label="プラットフォーム選択">

                                <button class="sub-tab is-active" data-platform="youtube-main"
                                    role="tab" aria-selected="true" aria-controls="sub-graph-card">
                                    <span class="sub-tab-icon"><i class="fa-brands fa-youtube" aria-hidden="true"></i></span>
                                    <span class="sub-tab-body">
                                        <span class="sub-tab-name">YouTube(@koinoyamaich)</span>
                                        <span class="sub-tab-count" id="sub-count-youtube-main" aria-label="登録者数">--</span>
                                    </span>
                                </button>

                                <button class="sub-tab" data-platform="youtube-sub"
                                    role="tab" aria-selected="false" aria-controls="sub-graph-card">
                                    <span class="sub-tab-icon"><i class="fa-brands fa-youtube" aria-hidden="true"></i></span>
                                    <span class="sub-tab-body">
                                        <span class="sub-tab-name">YouTube(@koinoyamaisub)</span>
                                        <span class="sub-tab-count" id="sub-count-youtube-sub" aria-label="登録者数">--</span>
                                    </span>
                                </button>

                                <button class="sub-tab" data-platform="twitch"
                                    role="tab" aria-selected="false" aria-controls="sub-graph-card">
                                    <span class="sub-tab-icon"><i class="fa-brands fa-twitch" aria-hidden="true"></i></span>
                                    <span class="sub-tab-body">
                                        <span class="sub-tab-name">Twitch</span>
                                        <span class="sub-tab-count" id="sub-count-twitch" aria-label="フォロワー数">--</span>
                                    </span>
                                </button>

                            </div>

                            <!-- グラフカード -->
                            <div class="sub-graph-card" id="sub-graph-card" role="tabpanel">
                                <div class="sub-range-row" role="group" aria-label="表示期間">
                                    <button class="sub-range-btn is-active" data-range="all" aria-pressed="true">全期間</button>
                                    <button class="sub-range-btn" data-range="1y" aria-pressed="false">1年</button>
                                    <button class="sub-range-btn" data-range="6m" aria-pressed="false">6ヶ月</button>
                                    <button class="sub-range-btn" data-range="3m" aria-pressed="false">3ヶ月</button>
                                </div>
                                <div class="sub-canvas-wrap">
                                    <!-- ✅ canvas に role="img" + aria-label -->
                                    <canvas id="sub-main-canvas" role="img" aria-label="登録者数推移グラフ"></canvas>
                                    <div id="sub-tooltip" class="sub-tooltip" style="display:none;" role="tooltip">
                                        <div class="sub-tooltip-date" id="sub-tt-date"></div>
                                        <div class="sub-tooltip-val" id="sub-tt-val"></div>
                                    </div>
                                    <!-- ✅ aria-live でデータなし状態を通知 -->
                                    <div id="sub-no-data" class="sub-no-data" style="display:none;" role="status" aria-live="polite">データなし</div>
                                </div>
                                <div class="sub-milestones-legend" aria-label="凡例">
                                    <span class="sub-ms-item"><span class="sub-ms-dot debut" aria-hidden="true"></span>デビュー</span>
                                    <span class="sub-ms-item"><span class="sub-ms-dot milestone" aria-hidden="true"></span>節目</span>
                                </div>
                            </div>

                            <!-- 記録カード -->
                            <div class="sub-records">
                                <div class="sub-rec-card">
                                    <div class="sub-rec-label">ピーク</div>
                                    <div class="sub-rec-value" id="sub-rec-peak">--</div>
                                    <div class="sub-rec-unit" id="sub-rec-peak-unit">万人</div>
                                </div>
                                <div class="sub-rec-card">
                                    <div class="sub-rec-label">計測データ数</div>
                                    <div class="sub-rec-value" id="sub-rec-count">--</div>
                                    <div class="sub-rec-unit">件</div>
                                </div>
                            </div>

                        </div><!-- /.sub-page -->

                    </div><!-- /.stats-carousel-inner -->
                </div><!-- /.stats-carousel -->
            </div><!-- /.stats-card -->
            <!-- ✅ カルーセルドットに role="tablist" -->
            <div class="carousel-dots" role="tablist" aria-label="スライド切り替え"></div>
            <!-- JavaScript読み込み -->
            <script src="/js/weekly-schedule.js?v=<?= @filemtime(__DIR__ . '/js/weekly-schedule.js') ?: time(); ?>" defer></script>
            <script>
            document.addEventListener('DOMContentLoaded', () => {
                loadWeeklySchedule('weekly-schedule');
                enableAutoReload(5);
            });
            </script>

            <!-- ✅ section + aria-labelledby（セマンティック改善） -->
            <section class="log-section" aria-labelledby="log-heading">
                <h2 class="history fade" id="log-heading">通知履歴</h2>

                <!-- ✅ role="toolbar" でボタン群の意味を明示 -->
                <div class="controls" role="toolbar" aria-label="ログ操作">
                    <div class="controls-left">
                        <button id="btn-refresh" class="fade d2" type="button"><i class="fa-solid fa-arrow-rotate-right"></i></button>
                    </div>
                    <button id="btn-log-settings" class="fade d2" type="button"
                        aria-expanded="false" aria-controls="log-settings-container"><i class="fa-solid fa-filter"></i></button>

                        <div id="log-settings-container" class="log-settings-container" aria-hidden="true">
                            <ul class="view-list" role="list">

                                <!-- 通知設定連動（これだけ is-synced クラスで他を制御） -->
                                <li>
                                    <label class="filter-toggle-row" for="filter-sync-notification">
                                        <span class="filter-label">通知設定連動</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-sync-notification" checked
                                                aria-label="通知設定連動" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-twitcasting">
                                        <span class="filter-label">TwitCasting</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-twitcasting" checked disabled
                                                aria-label="TwitCasting フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-youtube">
                                        <span class="filter-label">YouTube</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-youtube" checked disabled
                                                aria-label="YouTube フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-youtube-community">
                                        <span class="filter-label">YouTube Community</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-youtube-community" checked disabled
                                                aria-label="YouTube Community フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-twitch">
                                        <span class="filter-label">Twitch</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-twitch" checked disabled
                                                aria-label="Twitch フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-bilibili">
                                        <span class="filter-label">Bilibili</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-bilibili" checked disabled
                                                aria-label="Bilibili フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-fanbox">
                                        <span class="filter-label">Pixiv Fanbox</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-fanbox" checked disabled
                                                aria-label="Pixiv Fanbox フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-twitter-main">
                                        <span class="filter-label">Twitter(@koinoya_mai)</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-twitter-main" checked disabled
                                                aria-label="Twitter メイン フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-twitter-sub">
                                        <span class="filter-label">Twitter(@koinoyamai17)</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-twitter-sub" checked disabled
                                                aria-label="Twitter サブ フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                                <li>
                                    <label class="filter-toggle-row" for="filter-milestone">
                                        <span class="filter-label">記念日通知</span>
                                        <span class="filter-switch">
                                            <input type="checkbox" id="filter-milestone" checked disabled
                                                aria-label="記念日通知 フィルター" role="switch" aria-checked="true">
                                            <span class="slider"></span>
                                        </span>
                                    </label>
                                </li>

                            </ul>
                        </div>

                    <!-- ✅ display:none の select はそのまま保持（JSから参照されるため） -->
                    <select id="limit" style="display:none;" aria-hidden="true" tabindex="-1">
                        <option value="5">初期表示</option>
                        <option value="50">追加読み込み</option>
                    </select>
                </div>

                <div id="logs" class="log-container" aria-live="polite" aria-atomic="false">
                    <?php include __DIR__ . '/history.html'; ?>
                </div>

                <button id="more-logs-button" style="display:none;" type="button" aria-label="さらに通知履歴を読み込む">もっと見る</button>
                <!-- ✅ role="status" + aria-live で読み込み状態をスクリーンリーダーに通知 -->
                <div id="status" class="muted" role="status" aria-live="polite"></div>
            </section>

        </main>
    </div>

    <!-- ✅ div → footer（セマンティック改善） -->
    <section id="footer-slot">
        <?php include __DIR__ . '/footer.html'; ?>
    </section>

    <script src="/js/carousel.js?v=<?= @filemtime(__DIR__ . '/js/carousel.js') ?: time(); ?>" defer></script>
    <script src="/js/mai-voice.js?v=<?= @filemtime(__DIR__ . '/js/mai-voice.js') ?: time(); ?>" defer></script>
    <script src="/js/count-days.js?v=<?= @filemtime(__DIR__ . '/js/count-days.js') ?: time(); ?>" defer></script>
    <script src="/js/panel.js?v=<?= @filemtime(__DIR__ . '/js/panel.js') ?: time(); ?>" defer></script>
    <script src="/js/ui-misc.js?v=<?= @filemtime(__DIR__ . '/js/ui-misc.js') ?: time(); ?>" defer></script>
    <script src="/js/subscribers.js?v=<?= @filemtime(__DIR__ . '/js/subscribers.js') ?: time(); ?>" defer></script>
    <script type="module" src="/js/main.js?v=<?= @filemtime(__DIR__ . '/js/main.js') ?: time(); ?>" defer></script>
    <script src="/js/auth-settings-bridge.js?v=<?= @filemtime(__DIR__ . '/js/auth-settings-bridge.js') ?: time(); ?>" defer></script>

</body>
</html>