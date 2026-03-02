<!-- まいちゃん愛してる！ -->
<!doctype html>
<html lang="ja">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <title>まいちゃん通知ダッシュボード</title>

    <meta name="description" content="まいちゃんの配信や活動の通知を受け取れるサービスです。" />

    <meta property="og:url" content="https://mai.honna-yuzuki.com/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="まいちゃん通知ダッシュボード" />
    <meta property="og:description" content="まいちゃんの配信や活動の通知を受け取れるサービスです。" />
    <meta property="og:site_name" content="まいちゃん通知" />
    <meta property="og:image" content="https://mai.honna-yuzuki.com/social.jpg" />
    <meta property="og:locale" content="ja_JP" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@Yuzuki_Mai_17" /> 
    <meta name="twitter:image" content="https://mai.honna-yuzuki.com/social.jpg" />
    
    <!-- iOS対応のmeta情報 -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="まいちゃん通知" />

    <meta name="mobile-web-app-capable" content="yes">
    
    <!-- アイコン -->
    <link rel="icon" href="./icon.webp">
    <link rel="apple-touch-icon" href="./icon-192.webp" />
    <link rel="apple-touch-icon" sizes="192x192" href="./icon-192.webp" />
    <link rel="apple-touch-icon" sizes="512x512" href="./icon-512.webp" />
    
    <!-- manifest -->
    <link rel="manifest" href="./manifest.json" />
    
    <link rel="stylesheet" href="./style.v1.9.css" />
    <link rel="stylesheet" href="./top-card.v2.0.css" />
    <link rel="preconnect" href="https://elza.poitou-mora.ts.net">
    <!-- iOS Helper を main.js より先に読み込む -->
    <script src="/ios-helper.js" defer></script>
    <link
  rel="stylesheet"
  href="/fontawesome-free-7.2.0-web/css/all.min.css"
  crossorigin="anonymous"
/>
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Kaisei+Tokumin&display=swap" rel="stylesheet">
</head>
<body id="app-body" class="menu-transitions-disabled">
    <div id="header-slot">
        <?php include __DIR__ . '/header.html'; ?>
    </div>

    <!-- 左画像パネル -->
    <div class="left-mai">
        <div class="btn btn-flat open"><i class="fa-solid fa-angle-right" style="color: #040300;">    </i></div>
        <div class="mask">
            <img src="./left-mai.webp" alt="まいちゃん" fetchpriority="high" />
        
        </div>
        <main class="bg-blur">
            <!--
            <div class="stats-card">
                <h2>お知らせ</h2>
                <div class="stat-item">
                    <p>サーバーOSストレージの書き込み寿命(TBW)が残り21%になっていることが発覚したので、02/28(土)の深夜にOSストレージのクローンと換装作業をします。</p>
                </div>
            </div>
-->
           <div class="stats-card">
 <img src="./3dmai.webp" alt="" class="count-bg-mai" aria-hidden="true" />

  <div class="stats-carousel">
    <div class="stats-carousel-inner">

    <!-- ===== ページ1：既存カウント（まとめたまま） ===== -->
    <div class="stats-page count-page">
       <h2 style="margin-top:0;font-size:1.5rem;">カウント</h2>
      
      <div class="stats-grid">
        <div class="stat-item">
          <button type="button" class="stat-copy-btn" data-copy-target="days-since-debut" aria-label="デビューからをコピー">copy</button>
          <div class="label">デビューから</div>
          <div class="value" id="days-since-debut">0</div>
        </div>

        <div class="stat-item">
          <button type="button" class="stat-copy-btn" data-copy-target="days-to-birthday" aria-label="お誕生日までをコピー">copy</button>
          <div class="label">お誕生日まで</div>
          <div class="value" id="days-to-birthday">0</div>
        </div>

        <div class="stat-item">
          <button type="button" class="stat-copy-btn" data-copy-target="days-to-anniversary" aria-label="周年記念までをコピー">copy</button>
          <div class="label">周年記念まで</div>
          <div class="value" id="days-to-anniversary">0</div>
        </div>

        <div class="stat-item">
          <button type="button" class="stat-copy-btn" data-copy-target="days-to-meet" aria-label="推してからをコピー">copy</button>
          <div class="label">推してから</div>
          <div class="value" id="days-to-meet">0</div>
        </div>
      </div>
    </div>


    <!-- 週間予定表 -->
  <div class="stats-page">   <!-- ← これ追加 -->
    <div class="week-head">
    <button onclick="navigateWeek(-1)" class="week-arrow">
        <i class="fa-solid fa-angle-left" style="color: #ffffff;"></i>
    </button>

    <h2 class="week-title">スケジュール</h2>

    <button onclick="navigateWeek(1)" class="week-arrow">
        <i class="fa-solid fa-angle-right" style="color: #ffffff;"></i>
    </button>
    </div>
    <div class="week-content">
        <div id="weekly-schedule"></div>
        <div id="weekly-message"></div>
    </div>
  </div>
  
  <!-- ===== ページ3：チャンネル登録者数 ===== -->
<div class="stats-page sub-page">

  <div class="sub-header">
    <h2 class="sub-title">登録者推移</h2>
    <span class="sub-loading-badge" id="sub-loading-badge">読込中…</span>
  </div>

  <!-- プラットフォームタブ（登録者数付き）-->
  <div class="sub-platform-tabs" id="sub-platform-tabs">

    <button class="sub-tab is-active" data-platform="youtube-main">
      <span class="sub-tab-icon"><i class="fa-brands fa-youtube"></i></span>
      <span class="sub-tab-body">
        <span class="sub-tab-name">YouTube(@koinoyamaich)</span>
        <span class="sub-tab-count" id="sub-count-youtube-main">--</span>
      </span>
    </button>

    <button class="sub-tab" data-platform="youtube-sub">
      <span class="sub-tab-icon"><i class="fa-brands fa-youtube"></i></span>
      <span class="sub-tab-body">
        <span class="sub-tab-name">YouTube(@koinoyamaisub)</span>
        <span class="sub-tab-count" id="sub-count-youtube-sub">--</span>
      </span>
    </button>

    <button class="sub-tab" data-platform="twitch">
      <span class="sub-tab-icon"><i class="fa-brands fa-twitch"></i></span>
      <span class="sub-tab-body">
        <span class="sub-tab-name">Twitch</span>
        <span class="sub-tab-count" id="sub-count-twitch">--</span>
      </span>
    </button>

  </div>

  <!-- グラフカード -->
  <div class="sub-graph-card">
    <div class="sub-range-row">
      <button class="sub-range-btn is-active" data-range="all">全期間</button>
      <button class="sub-range-btn" data-range="1y">1年</button>
      <button class="sub-range-btn" data-range="6m">6ヶ月</button>
      <button class="sub-range-btn" data-range="3m">3ヶ月</button>
    </div>
    <div class="sub-canvas-wrap">
      <canvas id="sub-main-canvas"></canvas>
      <div id="sub-tooltip" class="sub-tooltip" style="display:none;">
        <div class="sub-tooltip-date" id="sub-tt-date"></div>
        <div class="sub-tooltip-val" id="sub-tt-val"></div>
      </div>
      <div id="sub-no-data" class="sub-no-data" style="display:none;">データなし</div>
    </div>
    <div class="sub-milestones-legend">
      <span class="sub-ms-item"><span class="sub-ms-dot debut"></span>デビュー</span>
      <span class="sub-ms-item"><span class="sub-ms-dot milestone"></span>節目</span>
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

</div>
  

<!-- JavaScript読み込み -->
<script src="/js/weekly-schedule.v1.2.js?v=<?= @filemtime(__DIR__ . '/js/weekly-schedule.v1.2.js') ?: time(); ?>" defer></script>
<script>
document.addEventListener('DOMContentLoaded', () => {
    loadWeeklySchedule('weekly-schedule');
    enableAutoReload(5); // 5分ごとに自動更新
});
</script>

    </div>
  </div>
  
</div>
<div class="carousel-dots"></div>





    
            <div class="log-section">
                <h2 class="history fade">通知履歴</h2>
                
                <div class="controls">
                    <div class="controls-left">
                        <button id="btn-refresh" class="fade d2">更新</button>
                    </div>
                    <button id="btn-log-settings" class="fade d2" aria-expanded="false"     aria-controls="log-settings-container">表示設定</button>
                    <div id="log-settings-container" class="log-settings-container" aria-hidden="true">
                        <ul class="view-list">
                            <li>
                                <button id="filter-sync-notification" class="filter-button is-on"   >
                                    通知設定連動: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-twitcasting" class="filter-button is-on"     disabled>
                                    TwitCasting: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-youtube" class="filter-button is-on" disabled>
                                    YouTube: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-youtube-community" class="filter-button is-on"    disabled>
                                    YouTube Community: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-twitch" class="filter-button is-on" disabled>
                                    Twitch: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-bilibili" class="filter-button is-on" disabled>
                                    Bilibili: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-fanbox" class="filter-button is-on" disabled>
                                    Pixiv Fanbox: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-twitter-main" class="filter-button is-on"    disabled>
                                    Twitter(@koinoya_mai): ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-twitter-sub" class="filter-button is-on"     disabled>
                                    Twitter(@koinoyamai17): ON
                                </button>
                            </li>
                            <!--<li>
                                <button id="filter-gipt" class="filter-button is-on" disabled>
                                    Gipt: ON
                                </button>
                            </li>-->
                            <li>
                                <button id="filter-milestone" class="filter-button is-on"   disabled>
                                    記念日通知: ON
                                </button>
                            </li>
                        </ul>
                    </div>
    
                    <select id="limit" style="display:none;">
                        <option value="5">初期表示</option>
                        <option value="50">追加読み込み</option>
                    </select>
                </div>
                
                <div id="logs" class="log-container">
                    <?php include __DIR__ . '/history.html'; ?>

                </div>
                
                <button id="more-logs-button" style="display:none;">もっと見る</button>
                <div id="status" class="muted"></div>
            </div>
        </main>
    </div>
    <div id="footer-slot">
        <?php include __DIR__ . '/footer.html'; ?>
    </div>

    <script src="/js/carousel.js?v=<?= @filemtime(__DIR__ . '/js/carousel.js') ?: time(); ?>" defer></script>
    <script src="/js/mai-voice.js?v=<?= @filemtime(__DIR__ . '/js/mai-voice.js') ?: time(); ?>" defer></script>
    <script src="/js/count-days.js?v=<?= @filemtime(__DIR__ . '/js/count-days.js') ?: time(); ?>" defer></script>
    <script src="/js/panel.js?v=<?= @filemtime(__DIR__ . '/js/panel.js') ?: time(); ?>" defer></script>
    <script src="/js/ui-misc.js?v=<?= @filemtime(__DIR__ . '/js/ui-misc.js') ?: time(); ?>" defer></script>
    <script src="/js/subscribers.js?v=<?= @filemtime(__DIR__ . '/js/subscribers.js') ?: time(); ?>" defer></script>
    <script type="module" src="/js/main.js?v=<?= @filemtime(__DIR__ . '/js/main.js') ?: time(); ?>" defer></script>

</body>
</html>