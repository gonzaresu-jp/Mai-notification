<?php
// まいちゃんwiki（仮公開）— 検索エンジンに表示されないよう常に noindex
// ピクシブ百科事典形式の記事（本文は手書き・出典準拠）。レイアウト: 目次＋スクロール
$pageTitle = "恋乃夜まい wiki";
$pageDesc = "恋乃夜まい（こいのやまい）とは — プロフィール・概要・人物を解説する非公式wiki（仮公開）。ぶいカノ所属のバーチャルYouTuber。";
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

        <p class="wk-lead">
            <strong>恋乃夜まい</strong>（こいのやまい）は、<strong>ぶいカノ（Vkano）</strong>所属のバーチャルYouTuber。
            2021年3月21日に初配信を行い、ASMRを中心に雑談・歌枠・ゲームなど幅広い配信を行う。
            「恋の魔女として生まれた異世界の元お姫様」という設定を持ち、リスナー（ファン）は「だーりん」と呼ばれる。
        </p>

        <p class="wk-note">
            このページは<strong>仮公開</strong>です。検索エンジンには表示されず、URLを知っている人だけが閲覧できます。
            記事本文は手作成（最終更新: 2026年10月6日）。出典はページ末尾を参照。
        </p>

        <div class="wk-layout">
            <nav class="wk-toc" aria-label="目次">
                <div class="wk-toc-title">目次</div>
                <ol class="wk-toc-list">
                    <li><a href="#profile">プロフィール</a></li>
                    <li><a href="#debut">自己紹介動画</a></li>
                    <li><a href="#overview">概要</a></li>
                    <li><a href="#person">人物</a></li>
                    <li><a href="#links">外部リンク</a></li>
                    <li><a href="#sources">出典</a></li>
                </ol>
            </nav>

            <div class="wk-content wk-article">

                <section class="wk-section" id="profile">
                    <h2>プロフィール</h2>
                    <table class="wk-infobox">
                        <tbody>
                            <tr><th>名前</th><td>恋乃夜まい（こいのやまい）</td></tr>
                            <tr><th>誕生日</th><td>1月7日</td></tr>
                            <tr><th>身長</th><td>162cm</td></tr>
                            <tr><th>年齢</th><td>240,000歳（建前では200,000歳）<span class="wk-ref">※</span></td></tr>
                            <tr><th>初配信</th><td>2021年3月21日</td></tr>
                            <tr><th>所属</th><td>ぶいカノ（Vkano）Gen 0<br><small>旧・プロプロプロダクション2期生 → めるれっとを経て2025年7月に現所属へ</small></td></tr>
                            <tr><th>ファンネーム</th><td>恋びと同盟</td></tr>
                            <tr><th>推しマーク</th><td>💗🥄</td></tr>
                            <tr><th>リスナーの呼称</th><td>だーりん</td></tr>
                            <tr><th>一人称</th><td>まい</td></tr>
                            <tr><th>キャラクターデザイン</th><td>MAIRO</td></tr>
                            <tr><th>モーションデザイン</th><td>はちゃち</td></tr>
                            <tr><th>配信タグ</th><td>#まいかわゆゆ ／ #恋乃夜まい ／ #まいのアトリエ（ファンアート）</td></tr>
                            <tr><th>登録者数</th><td>約29.8万人（2026年10月時点）</td></tr>
                            <tr><th>主な活動</th><td>ASMR・雑談・歌枠・ゲーム</td></tr>
                        </tbody>
                    </table>
                    <p class="wk-src-note"><span class="wk-ref">※</span> 設定上の年齢。本人の配信でも「24万歳の恋の魔女」と語っている。</p>
                </section>

                <section class="wk-section" id="debut">
                    <h2>自己紹介動画</h2>
                    <div class="wk-video-list">
                        <a class="wk-video-card" href="https://www.youtube.com/watch?v=IJ4rZr5XCto" target="_blank" rel="noopener">
                            <img src="https://i.ytimg.com/vi/IJ4rZr5XCto/mqdefault.jpg" alt="" width="160" height="90" loading="lazy" decoding="async" />
                            <div class="wk-video-body">
                                <b>【自己紹介】はじめまして！恋乃夜まいです♡【新人Vtuber】</b>
                                <span>2021年3月19日公開・デビュー前の自己紹介動画</span>
                            </div>
                        </a>
                        <a class="wk-video-card" href="https://www.youtube.com/watch?v=9_NKkfrQODc" target="_blank" rel="noopener">
                            <img src="https://i.ytimg.com/vi/9_NKkfrQODc/mqdefault.jpg" alt="" width="160" height="90" loading="lazy" decoding="async" />
                            <div class="wk-video-body">
                                <b>【初配信】はじめまして！恋乃夜まいです♡【新人Vtuber】</b>
                                <span>2021年3月21日・初配信アーカイブ</span>
                            </div>
                        </a>
                    </div>
                </section>

                <section class="wk-section" id="overview">
                    <h2>概要</h2>

                    <p>恋乃夜まいは、「恋の魔女として生まれた異世界の元お姫様」という設定のバーチャルYouTuberである。魔力の暴走から逃れて魔法の存在しない地球へやってきたが、その身体は「ドキドキ」を食べないと生きていけないという設定で、決め台詞は「君のドキドキ…食べさせてくれない？」。異世界の元お姫様という出自に似合わず、口調はやわらかく甘えたものになっている。</p>

                    <p>容姿は黒のロングヘアーにパープルのツートンメッシュ、左目近くに泣きぼくろ、右耳に大きめのピアスが特徴。メタ的な存在でもあり、自らを「人の手で創られた存在」と認識しており、キャラクターデザインを手がけたMAIRO氏を「ママ」、モーションデザイン担当のはちゃち氏を「パパ」と呼ぶ。ファンアートは「#まいのアトリエ」タグで投稿されており、pixivでのイラスト文化も盛んだ。</p>

                    <p>配信の中心はASMRである。初配信から1週間ほどでASMR枠を開始し、初期は3Dio、2021年9月にはKU100を導入して高音質な囁き配信を続けている。アーカイブの収録本数ではASMRが全カテゴリ中最多で、全体の約4割を占める。ほかに雑談・歌枠・ゲーム（ホラー系や『ゼルダの伝説』シリーズなど）をこなし、晩酌しながらの雑談や午後の時間帯の「ごごまい」など、番組性のある枠も定期的に行っている。</p>

                    <p>経歴をたどると、2021年3月19日に自己紹介動画を公開し、3月21日に初配信を行った。登録者は初配信後1か月足らずで10万人に達し、デビュー1か月後の5月には中国語の勉強枠を経てbilibiliへ進出、中国人ファンの獲得にも成功している。2022年にはVTuber Fes Japan 2022のアンバサダーに就任し、同年5月に始動した「恋乃夜まい3D化支援プロジェクト！」は目標300万円に対し約800万円を集め、2023年6月に3Dモデルが披露された。新衣装の公開時はトレンド入りするなど、話題性も高い。</p>

                    <p>所属は、デビュー時のプロプロプロダクション2期生から、2023年3月のグループ再編でめるれっとへ、2025年7月の事務所リブランドを経て現在はぶいカノ（Vkano）のGen 0として活動している。2026年10月時点で登録者は約29.8万人で、収録されたアーカイブは約730本・総配信時間は2,000時間以上に及ぶ。</p>
                </section>

                <section class="wk-section" id="person">
                    <h2>人物</h2>

                    <p>どこか艶を含んだ声質が特徴で、物腰は穏やか。配信中に怒った姿はほとんどなく、相手を素直に褒めたり、嬉しさや恥ずかしさをそのまま言葉にしたりする率直な性格。好奇心旺盛で、新しく覚えた言葉や流行を取り入れるのが好き。一方で、自身の配信で語るところでは強めの嫉妬心や束縛願望を持ち合わせており、いわゆる「メンヘラ」な面も持ち味として扱われている。大きな挑戦になると緊張のあまり落ち着けなくなることも本人が明かしている。</p>

                    <p>一人称は「まい」、リスナーのことを「だーりん」と呼び、挨拶は「こんまい！」。語尾は「〜だよ」「〜だね」「〜なの」などやわらかく、相槌は「ふふ」「えへへ」などの可愛い擬音を使う。喜んだり照れたりすると「きゅん」という感嘆を漏らすこともある。ASMRや囁きの配信では低めの声でゆっくり喋る。日本語・中国語・英語を扱えるマルチバイリンガルであり、中国語はデビュー直後の勉強枠から自ら身につけたものである。</p>

                    <p>人間関係では、咲夜あずさ・猟奇ちゃきとは事務所加入以前からの知り合いであることを明かしている。アーカイブ上のコラボ回数でも白瀬あおい（8本）・猟奇ちゃき（7本）・憩居ももあ（5本）が上位にあり、旧2期生・めるれっと時代の同僚との交流が長く続いていることがわかる。2期生5人でのユニット「Kissh」や、咲夜あずさ・猟奇ちゃき・白瀬あおいとの「めすぱふぇ」なども結成している。また、コミュ力のある妹や、喋り方が似ている母がいることも語っている。</p>
                </section>

                <section class="wk-section" id="links">
                    <h2>外部リンク</h2>
                    <div class="wk-card">
                        <ul>
                            <li><a href="https://vkano.jp/talent/koinoyamai" target="_blank" rel="noopener">ぶいカノ 公式プロフィール</a></li>
                            <li><a href="https://www.youtube.com/@koinoyamaich" target="_blank" rel="noopener">YouTube @koinoyamaich</a></li>
                            <li><a href="https://twitter.com/koinoya_mai" target="_blank" rel="noopener">X（旧Twitter）@koinoya_mai</a></li>
                            <li><a href="https://www.twitch.tv/koinoya_mai" target="_blank" rel="noopener">Twitch</a> ／ <a href="https://twitcasting.tv/c:koinoya_mai" target="_blank" rel="noopener">TwitCasting</a></li>
                            <li><a href="https://www.fanbox.cc/@koinoya-mai" target="_blank" rel="noopener">Pixiv Fanbox</a></li>
                            <li><a href="https://space.bilibili.com/1900434152" target="_blank" rel="noopener">bilibili</a></li>
                            <li><a href="/archive/" target="_blank" rel="noopener">配信アーカイブ検索</a>（本サイト・字幕・コメントの全文検索）</li>
                        </ul>
                    </div>
                </section>

                <section class="wk-section" id="sources">
                    <h2>出典</h2>
                    <div class="wk-card">
                        <ul>
                            <li><a href="https://dic.pixiv.net/a/%E6%81%8B%E4%B9%83%E5%A4%9C%E3%81%BE%E3%81%84" target="_blank" rel="noopener">ピクシブ百科事典「恋乃夜まい」</a>（CC BY-SA 3.0）— プロフィール属性・経歴の事実関係を参考</li>
                            <li><a href="https://vkano.jp/talent/koinoyamai" target="_blank" rel="noopener">ぶいカノ公式プロフィール</a> — 誕生日・身長・設定・決め台詞</li>
                            <li>本サイトの配信アーカイブ（動画カタログ・登録者数の日次記録・字幕統計）— 初配信日・収録本数・コラボ回数・登録者数</li>
                        </ul>
                        <p class="wk-src-note">
                            本ページはファンによる非公式の整理であり、公式情報ではありません。
                            統計値は記載時点のもので、それ以降に変動している可能性があります。
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
