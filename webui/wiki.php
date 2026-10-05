<?php
// まいちゃんwiki（仮公開）— 検索エンジンに表示されないよう常に noindex
// レイアウト: 左に目次（固定）＋右にセクションを上から順に読み進める構成
$pageTitle = "恋乃夜まい wiki";
$pageDesc = "恋乃夜まいのプロフィール・活動内容・ゲーム実況・コラボ・活動年表・キャラクターをまとめた非公式wiki（仮公開）。配信アーカイブの字幕と要約から自動的に集めています。";
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
            内容は配信アーカイブ（字幕・要約・動画カタログ）と公開情報から自動的に集めています。
        </p>

        <div class="wk-layout">
            <nav class="wk-toc" aria-label="目次">
                <div class="wk-toc-title">目次</div>
                <ol class="wk-toc-list">
                    <li><a href="#overview">概要</a></li>
                    <li><a href="#activity">活動内容</a></li>
                    <li><a href="#games">ゲーム実況</a></li>
                    <li><a href="#collabs">コラボ</a></li>
                    <li><a href="#works">代表作</a></li>
                    <li><a href="#timeline">活動年表</a></li>
                    <li><a href="#recent">最近の配信</a></li>
                    <li><a href="#character">キャラクター</a></li>
                    <li><a href="#quotes">語録・口調</a></li>
                    <li><a href="#sources">出典・リンク</a></li>
                </ol>
            </nav>

            <div class="wk-content">
                <div class="wk-loading" id="wk-loading">読み込み中…</div>

                <section class="wk-section" id="overview">
                    <h2>概要</h2>
                    <div class="wk-stats" id="wk-stats" hidden></div>
                    <div id="wk-overview"></div>
                </section>

                <section class="wk-section" id="activity">
                    <h2>活動内容</h2>
                    <div id="wk-activity"></div>
                </section>

                <section class="wk-section" id="games">
                    <h2>ゲーム実況</h2>
                    <div id="wk-games"></div>
                </section>

                <section class="wk-section" id="collabs">
                    <h2>コラボ</h2>
                    <div id="wk-collabs"></div>
                </section>

                <section class="wk-section" id="works">
                    <h2>代表作</h2>
                    <div id="wk-works"></div>
                </section>

                <section class="wk-section" id="timeline">
                    <h2>活動年表</h2>
                    <div id="wk-timeline"></div>
                </section>

                <section class="wk-section" id="recent">
                    <h2>最近の配信</h2>
                    <div id="wk-recent"></div>
                </section>

                <section class="wk-section" id="character">
                    <h2>キャラクター</h2>
                    <div id="wk-character"></div>
                </section>

                <section class="wk-section" id="quotes">
                    <h2>語録・口調</h2>
                    <div id="wk-quotes"></div>
                </section>

                <section class="wk-section" id="sources">
                    <h2>出典・リンク</h2>
                    <div class="wk-card">
                        <ul>
                            <li><a href="/archive/" target="_blank" rel="noopener">配信アーカイブ検索</a>（字幕・コメント・チャットの全文検索）</li>
                            <li><a href="https://www.youtube.com/@koinoyamaich" target="_blank" rel="noopener">YouTube @koinoyamaich</a></li>
                            <li><a href="https://twitter.com/koinoya_mai" target="_blank" rel="noopener">X（旧Twitter）@koinoya_mai</a></li>
                            <li><a href="https://twitcasting.tv/c:koinoya_mai" target="_blank" rel="noopener">TwitCasting</a> ／ <a href="https://www.twitch.tv/koinoya_mai" target="_blank" rel="noopener">Twitch</a></li>
                        </ul>
                        <p class="wk-src-note">
                            本ページはファンによる自動整理であり、公式情報ではありません。数値はアーカイブ収録分の集計で、
                            統計の基準時点により変動します。内容の誤りはお楽しみください。
                        </p>
                    </div>
                </section>
            </div>
        </div>
    </main>

    <div id="footer-slot">
        <?php include __DIR__ . '/footer.php'; ?>
    </div>

    <script src="/js/wiki.js?v=<?= @filemtime(__DIR__ . '/js/wiki.js') ?: time(); ?>" defer></script>
</body>

</html>
