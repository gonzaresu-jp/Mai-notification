<!doctype html>
<html lang="ja">

<head>
    <?php
    $pageTitle = "このサービスについて";
    $pageDesc = "まいちゃん通知（恋乃夜まい非公式通知サービス）の概要や開発履歴、利用規約などの情報について説明しています。";
  $extraHead = '
  <style type="text/css">
    .service-intro {
      font-size: 1rem;
      background: rgba(250, 250, 250, 0.85);
      color: #000;
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 20px;
      line-height: 1.7;
    }

    .intro-text {
      font-size: 24px;
      font-weight: bold;
    }

    .platform-list {
      margin: 16px 0;
      padding-left: 1.2em;
    }

    .platform-list li {
      margin-bottom: 8px;
    }

    .note {
      display: block;
      font-size: 1em;
      color: #444;
      margin-top: 4px;
    }

    .latency {
      margin-top: 24px;
    }

    .latency h3 {
      font-size: 1.1em;
      margin-bottom: 8px;
    }

    .latency ul {
      padding-left: 1.2em;
    }

    .future {
      margin-top: 16px;
      font-style: italic;
    }

    .link {
      margin-top: 20px;
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
    <section class="service-intro">
      <p class="intro-text">
        このサービスは、まいちゃんに関する通知を確実に受け取ることを目的として開発しました。
        対応している通知プラットフォームは以下の通りです。
      </p>
      <hr>
      <ul class="platform-list">
        <li>ツイキャス</li>
        <li>YouTube（配信・動画・<s>コミュニティ投稿</s>）</li>
        <li>Twitter
          <span class="note">※ファンクラブ限定アカウントは通知のみ行い、内容は表示しません。</span>
        </li>
        <li>Pixiv Fanbox（ファンクラブ）</li>
      </ul>

      <p class="settings-text">
        各プラットフォームの通知は個別に有効・無効を設定できます。
      </p>

      <div class="latency">
        <h3>通知遅延について</h3>
        <ul>
          <li>ツイキャス / YouTube（配信・動画）：ほぼ無遅延</li>
          <li>Twitter：約1分</li>
          <li>YouTubeコミュニティ投稿（停止中）/ Pixiv Fanbox：約3分</li>
        </ul>
      </div>

      <p class="future">
        今後、bilibili や Twitch での配信があれば対応予定です。
      </p>

      <p class="link">
        使用方法は
        <a href="https://github.com/gonzaresu-jp/Mai-notification" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        を参照してください。
      </p>
    </section>
    <a href="/" style="text-decoration:none; color:inherit; display:block;">
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

</body>

</html>