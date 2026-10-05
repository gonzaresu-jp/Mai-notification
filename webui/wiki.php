<?php
// まいちゃんwiki（仮公開）— 検索エンジンに表示されないよう常に noindex
$pageTitle = "恋乃夜まい wiki";
$pageDesc = "恋乃夜まいのプロフィール・性格・活動年表・語録をまとめた非公式wiki（仮公開）。配信アーカイブの字幕と要約から自動的に集めています。";
$robotsNoindex = true;
$extraHead = '<link rel="stylesheet" href="/css/wiki.css?v=' . @filemtime(__DIR__ . '/css/wiki.css') . '" />';
include __DIR__ . '/head.php';
?>

<body id="app-body">
    <div id="header-slot">
        <?php include __DIR__ . '/header.php'; ?>
    </div>

    <main class="wk-main">
        <h1 class="wk-title">恋乃夜まい <span>wiki</span></h1>
        <p class="wk-note">
            このページは<strong>仮公開</strong>です。検索エンジンには表示されず、URLを知っている人だけが閲覧できます。
            内容は配信アーカイブの字幕・要約・公開情報から自動的に集めています。
        </p>

        <div class="wk-stats" id="wk-stats" hidden></div>

        <nav class="wk-tabs" id="wk-tabs" aria-label="セクション">
            <button type="button" class="wk-tab is-active" data-tab="profile">プロフィール</button>
            <button type="button" class="wk-tab" data-tab="personality">性格・口調</button>
            <button type="button" class="wk-tab" data-tab="quotes">語録</button>
            <button type="button" class="wk-tab" data-tab="timeline">活動年表</button>
            <button type="button" class="wk-tab" data-tab="topics">最近の話題</button>
        </nav>

        <div class="wk-loading" id="wk-loading">読み込み中…</div>

        <section class="wk-panel" id="wk-profile" hidden></section>
        <section class="wk-panel" id="wk-personality" hidden></section>
        <section class="wk-panel" id="wk-quotes" hidden></section>
        <section class="wk-panel" id="wk-timeline" hidden></section>
        <section class="wk-panel" id="wk-topics" hidden></section>

        <p class="wk-footer-note">
            出典: 配信アーカイブの字幕・要約（<a href="/archive/">配信アーカイブ検索</a>）・公開プロフィール。<br>
            本ページはファンによる自動整理であり、公式情報ではありません。
        </p>
    </main>

    <div id="footer-slot">
        <?php include __DIR__ . '/footer.php'; ?>
    </div>

    <script src="/js/wiki.js?v=<?= @filemtime(__DIR__ . '/js/wiki.js') ?: time(); ?>" defer></script>
</body>

</html>
