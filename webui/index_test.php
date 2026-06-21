<!-- まいちゃん愛してる！ -->
<!doctype html>
<html lang="ja">

<head>
    <?php
    $topCardCss = './top-card.min.css?v=' . (@filemtime(__DIR__ . '/top-card.min.css') ?: time());
    $extraHead = '<link rel="preload" href="' . $topCardCss . '" as="style" onload="this.onload=null;this.rel=\'stylesheet\'" />'
        . '<noscript><link rel="stylesheet" href="' . $topCardCss . '" /></noscript>';
    $extraHead .= "\n<style>\n.media-card-thumb {\n  width: 100%;\n  aspect-ratio: 16 / 10;\n  overflow: hidden;\n  background: #222;\n  position: relative;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.media-card-thumb::before {\n  content: \"\";\n  position: absolute;\n  inset: -10px;\n  background-image: var(--bg-url);\n  background-size: cover;\n  background-position: center;\n  filter: blur(12px) brightness(0.6);\n  opacity: 0.6;\n  z-index: 0;\n}\n.media-card-thumb img, .media-card-thumb video {\n  max-width: 100%;\n  max-height: 100%;\n  object-fit: contain;\n  display: block;\n  position: relative;\n  z-index: 1;\n  transition: transform 0.3s ease;\n}\n.media-card-thumb:hover img, .media-card-thumb:hover video {\n  transform: scale(1.05);\n}\n.video-badge {\n  position: absolute;\n  top: 6px;\n  right: 6px;\n  background: rgba(0,0,0,0.65);\n  color: #fff;\n  font-size: 0.6rem;\n  font-weight: 700;\n  padding: 3px 7px;\n  border-radius: 6px;\n  backdrop-filter: blur(3px);\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n</style>\n";

    include __DIR__ . '/head.php';
    ?>


    <link rel="manifest" href="./manifest.json" />
    <link rel="stylesheet" href="./heatmap.min.css?v=<?= @filemtime(__DIR__ . '/heatmap.min.css') ?: time(); ?>" />

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
         preconnect（実際に外部フェッチが発生するホストのみ）
         ===================================================== -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <!-- api.honna-yuzuki.com など API ホストが別ドメインの場合はここに追加 -->

    <!-- =====================================================
         スクリプト
         ===================================================== -->
    <!-- iOS Helper を main.js より先に読み込む -->
    <script src="/ios-helper.js" defer></script>

    <!-- Fonts: display=swap でブロッディング軽減 -->
    <link href="https://fonts.googleapis.com/css2?family=Kaisei+Tokumin&display=swap" rel="stylesheet" />

    <!-- google -->
    <meta name="google-site-verification" content="Cy8Wfrb-EEkhphBoNiZV2P6dFt9g501JONelux-P2jQ" />

    <!-- ▼▼ テスト用追加スタイル（index_test.php専用・本番CSSは変更しない） ▼▼ -->
    <style>
      /* お誕生日＋周年記念の結合セル。PCでは display:contents で従来の4セル2×2を維持 */
      .count-page .stat-pair { display: contents; }
      @media (max-width: 768px) {
        /* スマホ: ペアを1枚のカードに結合（左右分割＋仕切り線） */
        .count-page .stat-pair {
          display: flex;
          background-color: #f4f0f8;
          border: 1px solid rgba(177, 30, 124, 0.12);
          border-radius: 10px;
          overflow: hidden;
        }
        .count-page .stat-pair .stat-half {
          flex: 1 1 0; min-width: 0; background: transparent; border: none; border-radius: 0;
          padding: .85rem 1rem; animation: none;
        }
        .count-page .stat-pair .stat-half + .stat-half { border-left: 1px solid rgba(177, 30, 124, 0.18); }
        .count-page .stat-pair .stat-half .value { font-size: clamp(1.15rem, 5.5vw, 1.6rem); }
        .count-page .stat-pair .stat-half .label { font-size: .8rem; }
        /* 結合セル内のコピー位置を右上に保つ */
        .count-page .stat-pair .stat-half .stat-copy-btn { top: 6px; right: 6px; }
      }

      /* 次の予定ウィジェット */
      #next-event { display: none; margin: 0 0 14px; padding: 13px 16px; border-radius: 12px;
        background: linear-gradient(135deg, #fff, #fbeef6); border: 1px solid rgba(177,30,124,.18);
        box-shadow: 0 3px 12px rgba(177,30,124,.12); }
      #next-event.show { display: block; }
      #next-event .ne-badge { display:inline-block; background: var(--color-primary,#B11E7C); color:#fff;
        border-radius: 999px; padding: 2px 12px; font-size: .72rem; font-weight: 700; }
      #next-event .ne-title { font-size: 1.05rem; font-weight: 800; margin: 7px 0 2px; }
      #next-event .ne-when { font-size: .95rem; color: var(--color-secondary,#7F2534); font-weight: 700; }
      #next-event .ne-plat { font-size: .75rem; color: #9a7; margin-left: 6px; }
      #next-event a.ne-link { display: inline-block; margin-top: 8px; font-size: .82rem; color: var(--color-primary,#B11E7C); text-decoration: none; }
    </style>
    <!-- ▲▲ テスト用追加スタイル ▲▲ -->
</head>

<body id="app-body" class="menu-transitions-disabled">

    <!-- ✅ div → header（セマンティック改善） -->
    <section id="header-slot">
        <?php include __DIR__ . '/header.php'; ?>
    </section>

    <!-- SEO用 H1（デザインを損なわないよう視覚的に非表示、または整合性を保つ） -->
    <h1
        style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0;">
        恋乃夜まい 活動通知サービス（Koinoya Mai Notification）</h1>

    <!-- 左画像パネル -->
    <div class="left-mai">
        <button class="btn btn-flat open" type="button" aria-label="パネルを開く" aria-expanded="false"
            aria-controls="left-mai-main">
            <i class="fa-solid fa-angle-right" aria-hidden="true"></i>
        </button>
        <div class="mask">
            <img src="./left-mai.webp" alt="まいちゃん" fetchpriority="high" width="473" height="1024" />
        </div>

        <main id="left-mai-main">
            <!-- ===== 二カ国時計 ===== -->
            <!--
            <div class="dual-clock" id="dual-clock" aria-live="off" aria-label="現在時刻">
                <div class="clock-item">
                    <span class="clock-flag">🇯🇵</span>
                    <div class="clock-body">
                        <span class="clock-label">JST</span>
                        <span class="clock-time" id="clock-jst">--:--:--</span>
                    </div>
                </div>
                <div class="clock-divider" aria-hidden="true"></div>
                <div class="clock-item">
                    <span class="clock-flag">🇺🇸</span>
                    <div class="clock-body">
                        <span class="clock-label" id="clock-us-label">New York</span>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="clock-time" id="clock-us">--:--:--</span>
                            <div id="us-weather-container" style="display:none; align-items:center; gap:6px; opacity:0; transition:opacity 0.3s ease;">
                                <span id="us-weather-text" style="font-size:0.95rem; font-weight:600; color:rgba(255,255,255,0.9);"></span>
                                <span id="us-weather-temp" style="font-size:1.15rem; font-weight:600; color:#fff; font-family:'Roboto Mono', 'Courier New', monospace; text-shadow:0 0 8px rgba(180, 140, 255, 0.4);"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .dual-clock {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0;
                    margin: 10px 12px 14px;
                    padding: 12px 20px;
                    background: rgba(255, 255, 255, 0.07);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 14px;
                    backdrop-filter: blur(8px);
                }

                .clock-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex: 1;
                    justify-content: center;
                }

                .clock-flag {
                    font-size: 1.7rem;
                    line-height: 1;
                }

                .clock-body {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 2px;
                }

                .clock-label {
                    font-size: 0.65rem;
                    font-weight: 700;
                    letter-spacing: 0.1em;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                }

                .clock-time {
                    font-family: 'Roboto Mono', 'Courier New', monospace;
                    font-size: 1.3rem;
                    font-weight: 600;
                    color: #fff;
                    letter-spacing: 0.05em;
                    text-shadow: 0 0 12px rgba(180, 140, 255, 0.5);
                }

                .clock-divider {
                    width: 1px;
                    height: 40px;
                    background: rgba(255, 255, 255, 0.15);
                    margin: 0 14px;
                }
            </style>
            <script>
                (function () {
                    const fmtJST = new Intl.DateTimeFormat('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                        hour12: false
                    });
                    const fmtUS = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'America/New_York',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                        hour12: false,
                        timeZoneName: 'short'
                    });
                    function tick() {
                        const now = new Date();
                        const jstEl = document.getElementById('clock-jst');
                        const usEl = document.getElementById('clock-us');
                        const usLbl = document.getElementById('clock-us-label');
                        if (!jstEl) return;

                        jstEl.textContent = fmtJST.format(now);

                        const parts = fmtUS.formatToParts(now);
                        const h = parts.find(p => p.type === 'hour')?.value ?? '--';
                        const m = parts.find(p => p.type === 'minute')?.value ?? '--';
                        const s = parts.find(p => p.type === 'second')?.value ?? '--';
                        const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'ET';
                        usEl.textContent = `${h}:${m}:${s}`;
                        // ラベルは "New York" 固定
                    }
                    tick();
                    setInterval(tick, 1000);

                    function translateWeatherWords(desc) {
                        if (!desc) return '';
                        const d = desc.toLowerCase();
                        if (d.includes('snow')) return '雪';
                        if (d.includes('thunder')) return '雷雨';
                        if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return '雨';
                        if (d.includes('fog')) return '霧';
                        if (d.includes('partly cloudy')) return '晴れ時々曇り';
                        if (d.includes('mostly cloudy') || d.includes('cloudy') || d.includes('overcast')) return '曇り';
                        if (d.includes('clear') || d.includes('fair') || d.includes('sun')) return '晴れ';
                        return desc;
                    }

                    async function fetchUSWeather() {
                        const container = document.getElementById('us-weather-container');
                        const textEl = document.getElementById('us-weather-text');
                        const tempEl = document.getElementById('us-weather-temp');
                        if (!container || !textEl || !tempEl) return;

                        try {
                            const res = await fetch('https://api.weather.gov/stations/KNYC/observations/latest', {
                                headers: {
                                    'Accept': 'application/geo+json',
                                    'User-Agent': 'KoinoyamaiNotificationApp/1.0'
                                }
                            });
                            if (!res.ok) throw new Error('Network response was not ok');
                            
                            const data = await res.json();
                            const props = data?.properties;
                            if (props) {
                                let tempC = props.temperature?.value;
                                let desc = props.textDescription || '';

                                if (desc && tempC !== null && tempC !== undefined) {
                                    textEl.textContent = translateWeatherWords(desc);
                                    textEl.title = desc; // 原文をホバーで確認可能に
                                    
                                    tempEl.textContent = `${Math.round(tempC)}°C`;
                                    
                                    container.style.display = 'flex';
                                    setTimeout(() => { container.style.opacity = '1'; }, 10);
                                }
                            }
                        } catch (e) {
                            console.error('Failed to fetch NWS weather:', e);
                        }
                    }
                    
                    fetchUSWeather();
                    // 10分ごとに更新
                    setInterval(fetchUSWeather, 10 * 60 * 1000);
                })();
            </script>
            -->

            <!-- ✅ stats-card に role="region" + aria-label -->
            <div class="stats-card bg-blur" role="region" aria-label="統計情報">

                <img src="./3dmai.webp" alt="" class="count-bg-mai" aria-hidden="true" width="384" height="512"
                    loading="lazy" />

                <!-- ▼ 次の予定ウィジェット（予定が無ければ枠ごと非表示） ▼ -->
                <div id="next-event" aria-live="polite">
                    <span class="ne-badge">次の予定</span>
                    <div class="ne-title" id="ne-title">—</div>
                    <div><span class="ne-when" id="ne-when">—</span><span class="ne-plat" id="ne-plat"></span></div>
                    <a class="ne-link" id="ne-link" href="#" target="_blank" rel="noopener" style="display:none;">▶ 開く</a>
                </div>
                <!-- ▲ 次の予定ウィジェット ▲ -->

                <!-- ✅ カルーセルに role="region" + aria-label、ドットに role="tablist" -->
                <div class="stats-carousel" role="region" aria-label="情報カルーセル" aria-roledescription="carousel">
                    <div class="stats-carousel-viewport">
                        <div class="stats-carousel-inner">

                            <!-- ===== ページ1：カウント ===== -->
                            <!-- ✅ role="tabpanel" + aria-label でスクリーンリーダー対応 -->
                            <div class="stats-page count-page" role="tabpanel" aria-label="カウント"
                                aria-roledescription="スライド">
                                <h2 class="marker">カウント</h2>

                                <div class="stats-grid">
                                    <div class="stat-item">
                                        <button type="button" class="stat-copy-btn" data-copy-target="days-since-debut"
                                            aria-label="デビューからの日数をコピー"><i class="fa-regular fa-clipboard"></i></button>
                                        <div class="label">デビューから</div>
                                        <div class="value" id="days-since-debut" aria-live="polite" aria-atomic="true">0
                                        </div>
                                    </div>

                                    <!-- ▼ お誕生日＋周年記念をペアに（スマホで1セル結合・PCは従来通り） ▼ -->
                                    <div class="stat-pair">
                                        <div class="stat-item stat-half">
                                            <button type="button" class="stat-copy-btn" data-copy-target="days-to-birthday"
                                                aria-label="お誕生日までの日数をコピー"><i class="fa-regular fa-clipboard"></i></button>
                                            <div class="label">お誕生日まで</div>
                                            <div class="value" id="days-to-birthday" aria-live="polite" aria-atomic="true">0
                                            </div>
                                        </div>

                                        <div class="stat-item stat-half">
                                            <button type="button" class="stat-copy-btn"
                                                data-copy-target="days-to-anniversary" aria-label="周年記念までの日数をコピー"><i
                                                    class="fa-regular fa-clipboard"></i></button>
                                            <div class="label">周年記念まで</div>
                                            <div class="value" id="days-to-anniversary" aria-live="polite"
                                                aria-atomic="true">0</div>
                                        </div>
                                    </div>
                                    <!-- ▲ ペアここまで ▲ -->

                                    <div class="stat-item">
                                        <button type="button" class="stat-copy-btn" data-copy-target="days-to-meet"
                                            aria-label="推してからの日数をコピー"><i class="fa-regular fa-clipboard"></i></button>
                                        <div class="label">推してから</div>
                                        <div class="value" id="days-to-meet" aria-live="polite" aria-atomic="true">0
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- ===== ページ2：週間予定表 ===== -->
                            <div class="stats-page" role="tabpanel" aria-label="スケジュール" aria-roledescription="スライド">
                                <h2 class="week-title marker">スケジュール</h2>
                                <div class="week-head">
                                    <!-- ✅ aria-label を追加（アイコンのみのボタン対応） -->
                                    <button onclick="navigateSchedule(-1)" class="week-arrow" type="button"
                                        aria-label="前の週/月へ">
                                        <i class="fa-solid fa-angle-left" style="color: #040300;"
                                            aria-hidden="true"></i>
                                    </button>

                                    <div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:center;">
                                        <div class="view-mode-tabs" role="group" aria-label="表示切り替え">
                                            <button class="view-mode-btn is-active" id="view-btn-week" type="button"
                                                onclick="switchViewMode('week')">週間</button>
                                            <button class="view-mode-btn" id="view-btn-month" type="button"
                                                onclick="switchViewMode('month')">月間</button>
                                        </div>
                                    </div>

                                    <button onclick="navigateSchedule(1)" class="week-arrow" type="button"
                                        aria-label="次の週/月へ">
                                        <i class="fa-solid fa-angle-right" style="color: #040300;"
                                            aria-hidden="true"></i>
                                    </button>
                                </div>

                                <div id="schedule-month-label" class="schedule-month-label" style="display:none;"></div>
                                <div class="week-content">
                                    <button id="week-add-user-schedule" class="week-add-btn" type="button"
                                        aria-label="予定を追加">+</button>
                                    <div id="weekly-schedule" aria-live="polite" aria-atomic="false"></div>
                                    <div id="weekly-message" role="status" aria-live="polite"></div>
                                </div>
                            </div>

                            <!-- ===== ページ3：チャンネル登録者数 ===== -->
                            <div class="stats-page sub-page" role="tabpanel" aria-label="登録者推移"
                                aria-roledescription="スライド">

                                <div class="sub-header">
                                    <h2 class="sub-title marker">登録者推移</h2>
                                    <!-- ✅ role="status" で読み込み状態をスクリーンリーダーに伝える -->
                                    <span class="sub-loading-badge" id="sub-loading-badge" role="status"
                                        aria-live="polite">読込中…</span>
                                </div>

                                <!-- ✅ プラットフォームタブに role="tablist" -->
                                <div class="sub-platform-tabs" id="sub-platform-tabs" role="tablist"
                                    aria-label="プラットフォーム選択">

                                    <button class="sub-tab is-active" data-platform="youtube-main" role="tab"
                                        aria-selected="true" aria-controls="sub-graph-card">
                                        <span class="sub-tab-icon"><i class="fa-brands fa-youtube"
                                                aria-hidden="true"></i></span>
                                        <span class="sub-tab-body">
                                            <span class="sub-tab-name">YouTube(@koinoyamaich)</span>
                                            <span class="sub-tab-count" id="sub-count-youtube-main"
                                                aria-label="登録者数">--</span>
                                        </span>
                                    </button>

                                    <button class="sub-tab" data-platform="youtube-sub" role="tab" aria-selected="false"
                                        aria-controls="sub-graph-card">
                                        <span class="sub-tab-icon"><i class="fa-brands fa-youtube"
                                                aria-hidden="true"></i></span>
                                        <span class="sub-tab-body">
                                            <span class="sub-tab-name">YouTube(@koinoyamaisub)</span>
                                            <span class="sub-tab-count" id="sub-count-youtube-sub"
                                                aria-label="登録者数">--</span>
                                        </span>
                                    </button>

                                    <button class="sub-tab" data-platform="twitch" role="tab" aria-selected="false"
                                        aria-controls="sub-graph-card">
                                        <span class="sub-tab-icon"><i class="fa-brands fa-twitch"
                                                aria-hidden="true"></i></span>
                                        <span class="sub-tab-body">
                                            <span class="sub-tab-name">Twitch</span>
                                            <span class="sub-tab-count" id="sub-count-twitch"
                                                aria-label="フォロワー数">--</span>
                                        </span>
                                    </button>

                                </div>

                                <!-- グラフカード -->
                                <div class="sub-graph-card" id="sub-graph-card" role="tabpanel">
                                    <div class="sub-range-row" role="group" aria-label="表示期間">
                                        <button class="sub-range-btn is-active" data-range="all"
                                            aria-pressed="true">全期間</button>
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
                                        <div id="sub-no-data" class="sub-no-data" style="display:none;" role="status"
                                            aria-live="polite">データなし</div>
                                    </div>
                                    <div class="sub-milestones-legend" aria-label="凡例">
                                        <span class="sub-ms-item"><span class="sub-ms-dot debut"
                                                aria-hidden="true"></span>デビュー</span>
                                        <span class="sub-ms-item"><span class="sub-ms-dot milestone"
                                                aria-hidden="true"></span>節目</span>
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
                    </div><!-- /.stats-carousel-view -->
                </div><!-- /.stats-carousel -->
            </div><!-- /.stats-card -->
            <!-- ✅ カルーセルドットに role="group" -->
            <div class="carousel-dots" role="group" aria-label="スライド切り替え"></div>
            <!-- JavaScript読み込み -->
            <script src="./dist/weekly-schedule.min.js?v=<?= @filemtime(__DIR__ . '/dist/weekly-schedule.min.js') ?: time(); ?>" defer></script>
            <script>
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
            </script>

            <!-- ✅ section + aria-labelledby（セマンティック改善） -->
            <section class="log-section" aria-labelledby="log-heading">
                <h2 class="history fade" id="log-heading">通知履歴</h2>
                <div id="notification-heatmap" class="heatmap-wrapper fade d3" role="region" aria-label="通知貢献グラフ"></div>

                <!-- ✅ role="toolbar" でボタン群の意味を明示 -->
                <div class="controls" role="toolbar" aria-label="ログ操作">
                    <div class="controls-left">
                        <button id="btn-refresh" class="fade d2 toolbar-btn" type="button" aria-label="履歴を更新"><i
                                class="fa-solid fa-arrow-rotate-right"></i></button>
                    </div>
                    <div class="controls-right">
                        <button id="btn-link-settings" class="fade d2 toolbar-btn" type="button" aria-expanded="false"
                            aria-controls="link-settings-container" aria-label="リンク先カスタム設定を開く"><i
                                class="fa-solid fa-link"></i></button>
                        <button id="btn-log-settings" class="fade d2 toolbar-btn" type="button" aria-expanded="false"
                            aria-controls="log-settings-container" aria-label="ログ設定を開く"><i
                                class="fa-solid fa-filter"></i></button>
                    </div>

                    <div id="log-settings-container" class="log-settings-container" aria-hidden="true">
                        <ul class="view-list" role="list">

                            <!-- 通知設定連動（これだけ is-synced クラスで他を制御） -->
                            <li>
                                <label class="filter-toggle-row" for="filter-sync-notification">
                                    <span class="filter-label">通知設定連動</span>
                                    <span class="filter-switch">
                                        <input type="checkbox" id="filter-sync-notification" checked aria-label="通知設定連動"
                                            role="switch" aria-checked="true">
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

                    <!-- リンク設定コンテナ -->
                    <div id="link-settings-container" class="log-settings-container" aria-hidden="true"
                        style="min-width: 260px;">
                        <h3
                            style="font-size: 0.9rem; margin-bottom: 10px; border-bottom: 1px solid var(--color-primary); padding-bottom: 4px;">
                            リンク先カスタム設定</h3>
                        <p style="font-size: 0.75rem; color: #666; margin-bottom: 12px; line-height: 1.4;">
                            通知のリンク先を独自の形式に変換できます。<br>
                            <code>{url}</code> は元のURLに置換されます。<br>
                            例: <code>vnd.youtube://{url}</code>
                        </p>
                        <ul class="view-list" role="list" style="gap: 12px;">
                            <li>
                                <label class="link-setting-item">
                                    <span class="filter-label">YouTube</span>
                                    <input type="text" id="link-youtube" class="link-template-input"
                                        placeholder="元のURLを使用" aria-label="YouTube リンクテンプレート">
                                </label>
                            </li>
                            <li>
                                <label class="link-setting-item">
                                    <span class="filter-label">TwitCasting</span>
                                    <input type="text" id="link-twitcasting" class="link-template-input"
                                        placeholder="元のURLを使用" aria-label="TwitCasting リンクテンプレート">
                                </label>
                            </li>
                            <li>
                                <label class="link-setting-item">
                                    <span class="filter-label">Twitch</span>
                                    <input type="text" id="link-twitch" class="link-template-input"
                                        placeholder="元のURLを使用" aria-label="Twitch リンクテンプレート">
                                </label>
                            </li>
                            <li>
                                <label class="link-setting-item">
                                    <span class="filter-label">Twitter</span>
                                    <input type="text" id="link-twitter" class="link-template-input"
                                        placeholder="元のURLを使用" aria-label="Twitter リンクテンプレート">
                                </label>
                            </li>
                            <li>
                                <label class="link-setting-item">
                                    <span class="filter-label">その他</span>
                                    <input type="text" id="link-other" class="link-template-input"
                                        placeholder="元のURLを使用" aria-label="その他プラットフォーム リンクテンプレート">
                                </label>
                            </li>
                            <li style="margin-top: 8px; text-align: right;">
                                <button id="btn-save-links" class="load-more-btn"
                                    style="margin: 0; padding: 6px 16px; font-size: 0.85rem; width: 100%;">設定を保存</button>
                            </li>
                        </ul>
                    </div>

                    <!-- ✅ display:none の select はそのまま保持（JSから参照されるため） -->
                    <select id="limit" style="display:none;" aria-hidden="true" tabindex="-1">
                        <option value="5">初期表示</option>
                        <option value="50">追加読み込み</option>
                    </select>
                </div>

                <!-- Lightbox -->
                <div class="media-lightbox" id="media-lightbox">
                    <button class="media-lightbox-close" id="lightbox-close"><i class="fa-solid fa-xmark"></i></button>
                    <div class="media-lightbox-content" id="lightbox-content"></div>
                </div>

                <div id="logs" class="log-container" aria-live="polite" aria-atomic="false">
                    <p class="status-message info-message">履歴を読み込んでいます...</p>
                </div>

                <button id="more-logs-button" class="load-more-btn" type="button"
                    aria-label="さらに通知履歴を読み込む">もっと見る</button>
                <!-- ✅ role="status" + aria-live で読み込み状態をスクリーンリーダーに通知 -->
                <div id="status" class="muted" role="status" aria-live="polite"></div>
            </section>

        </main>
    </div>

    <!-- ✅ div → footer（セマンティック改善） -->
    <section id="footer-slot">
        <?php include __DIR__ . '/footer.php'; ?>
    </section>

    <script src="./dist/carousel.min.js?v=<?= @filemtime(__DIR__ . '/dist/carousel.min.js') ?: time(); ?>" defer></script>
    <script src="./dist/mai-voice.min.js?v=<?= @filemtime(__DIR__ . '/dist/mai-voice.min.js') ?: time(); ?>" defer></script>
    <script src="./dist/count-days.min.js?v=<?= @filemtime(__DIR__ . '/dist/count-days.min.js') ?: time(); ?>" defer></script>
    <script src="./dist/panel.min.js?v=<?= @filemtime(__DIR__ . '/dist/panel.min.js') ?: time(); ?>" defer></script>
    <script src="./dist/ui-misc.min.js?v=<?= @filemtime(__DIR__ . '/dist/ui-misc.min.js') ?: time(); ?>" defer></script>
    <script src="./dist/subscribers.min.js?v=<?= @filemtime(__DIR__ . '/dist/subscribers.min.js') ?: time(); ?>" defer></script>
    <script type="module" src="./dist/main.bundle.min.js?v=<?= @filemtime(__DIR__ . '/dist/main.bundle.min.js') ?: time(); ?>" defer></script>
    <script src="./dist/auth-settings-bridge.min.js?v=<?= @filemtime(__DIR__ . '/dist/auth-settings-bridge.min.js') ?: time(); ?>" defer></script>
    <script src="./dist/heatmap.min.js?v=<?= @filemtime(__DIR__ . '/dist/heatmap.min.js') ?: time(); ?>" defer></script>

    <!-- ▼ 次の予定（直近の未来予定をAPIから取得、無ければ枠を出さない）▼ -->
    <script>
    (function () {
      const PERIOD = { MORNING:'朝', NOON:'昼', EVENING:'夕方', NIGHT:'夜', LATE_NIGHT:'深夜' };
      const pad = n => String(n).padStart(2, '0');
      function nowNaiveJst() { const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
      function fmtWhen(ev) {
        const dt = new Date(String(ev.start_time||'').replace(' ', 'T'));
        const dstr = Number.isFinite(dt.getTime())
          ? dt.toLocaleDateString('ja-JP', { month:'long', day:'numeric', weekday:'short' })
          : (ev.start_time||'');
        if (ev.time_period && PERIOD[ev.time_period]) return `${dstr} ${PERIOD[ev.time_period]}ごろ`;
        const t = Number.isFinite(dt.getTime()) ? dt.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', hour12:false }) : '';
        return t ? `${dstr} ${t}` : dstr;
      }
      async function loadNext() {
        try {
          const from = encodeURIComponent(nowNaiveJst());
          const r = await fetch(`/api/events?from=${from}&status=scheduled&limit=10`);
          if (!r.ok) return;
          const j = await r.json();
          const items = (j.items||[]).filter(e => e.start_time && e.event_type!=='memo' && e.status!=='cancelled');
          if (!items.length) return; // 予定なし → 枠は出さない
          const ev = items[0];
          document.getElementById('ne-title').textContent = ev.title || '配信予定';
          document.getElementById('ne-when').textContent = fmtWhen(ev);
          document.getElementById('ne-plat').textContent = ev.platform ? `/ ${ev.platform}` : '';
          const link = document.getElementById('ne-link');
          if (ev.url) { link.href = ev.url; link.style.display = 'inline-block'; }
          document.getElementById('next-event').classList.add('show');
        } catch (e) { /* 失敗時は枠を出さない */ }
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadNext);
      else loadNext();
    })();
    </script>
    <!-- ▲ 次の予定 ▲ -->

</body>

</html>