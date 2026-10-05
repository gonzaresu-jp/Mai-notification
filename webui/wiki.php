<?php
// まいちゃんwiki（仮公開）— 検索エンジンに表示されないよう常に noindex
// ピクシブ百科事典形式の記事（本文は手書き・出典準拠・脚注方式）。レイアウト: 目次＋スクロール
$pageTitle = "恋乃夜まい wiki";
$pageDesc = "恋乃夜まい（こいのやまい）とは — プロフィール・概要・経歴・人物を出典付きで解説する非公式wiki（仮公開）。ぶいカノ所属のバーチャルYouTuber。";
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
            <strong>恋乃夜まい</strong>（こいのやまい）は、<strong><a href="https://vkano.jp/" target="_blank" rel="noopener">ぶいカノ（Vkano）</a></strong>の<strong>0期生 兼 コンテンツプロデューサー</strong>であるバーチャルYouTuber<a class="wk-cite" href="#src-2">[2]</a>。
            2021年3月21日に初配信を行い<a class="wk-cite" href="#src-6">[6]</a>、ASMRを中心に雑談・歌枠・ゲームなど幅広い配信を行う。
            「恋の魔女として生まれた異世界の元お姫様」という設定を持ち、リスナー（ファン）は「だーりん」と呼ばれる<a class="wk-cite" href="#src-2">[2]</a>。
        </p>

        <p class="wk-note">
            このページは<strong>仮公開</strong>です。検索エンジンには表示されず、URLを知っている人だけが閲覧できます。
            記事本文は手作成（最終更新: 2026年10月6日）。本文中の<span class="wk-cite">[数字]</span>はページ末尾の出典に対応します。
        </p>

        <div class="wk-layout">
            <nav class="wk-toc" aria-label="目次">
                <div class="wk-toc-title">目次</div>
                <ol class="wk-toc-list">
                    <li><a href="#profile">プロフィール</a></li>
                    <li><a href="#debut">自己紹介動画</a></li>
                    <li><a href="#overview">概要</a></li>
                    <li><a href="#history">経歴</a></li>
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
                            <tr><th>誕生日</th><td>1月7日<a class="wk-cite" href="#src-2">[2]</a></td></tr>
                            <tr><th>身長</th><td>162cm<a class="wk-cite" href="#src-2">[2]</a></td></tr>
                            <tr><th>年齢</th><td>240,000歳（建前では200,000歳）<a class="wk-cite" href="#src-1">[1]</a><span class="wk-ref">※</span></td></tr>
                            <tr><th>初配信</th><td>2021年3月21日<a class="wk-cite" href="#src-6">[6]</a></td></tr>
                            <tr><th>所属</th><td><a href="https://vkano.jp/" target="_blank" rel="noopener">ぶいカノ（Vkano）</a>0期生 兼 コンテンツプロデューサー<a class="wk-cite" href="#src-2">[2]</a><a class="wk-cite" href="#src-4">[4]</a><br><small>2025年7月17日設立の事務所。旧・プロプロプロダクション2期生 → めるれっとを経て現所属</small></td></tr>
                            <tr><th>ファンネーム</th><td>恋びと同盟<a class="wk-cite" href="#src-1">[1]</a></td></tr>
                            <tr><th>ファンクラブ</th><td><a href="https://koinoya-mai.fanbox.cc/" target="_blank" rel="noopener">Pixiv Fanbox</a><a class="wk-cite" href="#src-2">[2]</a><br><small>旧・Fanicon「舞踏会」（2022年開設）から移行<a class="wk-cite" href="#src-7">[7]</a></small></td></tr>
                            <tr><th>推しマーク</th><td>💗🥄<a class="wk-cite" href="#src-4">[4]</a></td></tr>
                            <tr><th>リスナーの呼称</th><td>だーりん<a class="wk-cite" href="#src-2">[2]</a></td></tr>
                            <tr><th>一人称</th><td>まい<a class="wk-cite" href="#src-6">[6]</a></td></tr>
                            <tr><th>キャラクターデザイン</th><td>MAIRO<a class="wk-cite" href="#src-1">[1]</a></td></tr>
                            <tr><th>モーションデザイン</th><td>はちゃち<a class="wk-cite" href="#src-1">[1]</a></td></tr>
                            <tr><th>配信タグ</th><td>#dear_mai（ラブレター）<br>#koinoyart（ファンアート）<br>#濃いのやまい（R18）<a class="wk-cite" href="#src-12">[12]</a></td></tr>
                            <tr><th>登録者数</th><td>約29.8万人（2026年10月時点）<a class="wk-cite" href="#src-6">[6]</a></td></tr>
                            <tr><th>主な活動</th><td>ASMR・雑談・歌枠・ゲーム<a class="wk-cite" href="#src-6">[6]</a></td></tr>
                        </tbody>
                    </table>
                    <p class="wk-src-note"><span class="wk-ref">※</span> 設定上の年齢。本人の配信でも「24万歳の恋の魔女」と語っている<a class="wk-cite" href="#src-6">[6]</a>。</p>
                </section>

                <section class="wk-section" id="debut">
                    <h2>自己紹介動画</h2>
                    <div class="wk-video-list">
                        <div class="wk-video-card">
                            <a class="wk-video-thumb" href="https://www.youtube.com/watch?v=IJ4rZr5XCto" target="_blank" rel="noopener" aria-label="自己紹介動画をYouTubeで開く">
                                <img src="https://i.ytimg.com/vi/IJ4rZr5XCto/mqdefault.jpg" alt="" width="160" height="90" loading="lazy" decoding="async" />
                            </a>
                            <div class="wk-video-body">
                                <a class="wk-video-title" href="https://www.youtube.com/watch?v=IJ4rZr5XCto" target="_blank" rel="noopener"><b>【自己紹介】はじめまして！恋乃夜まいです♡【新人Vtuber】</b></a>
                                <span>2021年3月19日公開・デビュー前の自己紹介動画<a class="wk-cite" href="#src-6">[6]</a></span>
                            </div>
                        </div>
                        <div class="wk-video-card">
                            <a class="wk-video-thumb" href="https://www.youtube.com/watch?v=9_NKkfrQODc" target="_blank" rel="noopener" aria-label="初配信アーカイブをYouTubeで開く">
                                <img src="https://i.ytimg.com/vi/9_NKkfrQODc/mqdefault.jpg" alt="" width="160" height="90" loading="lazy" decoding="async" />
                            </a>
                            <div class="wk-video-body">
                                <a class="wk-video-title" href="https://www.youtube.com/watch?v=9_NKkfrQODc" target="_blank" rel="noopener"><b>【初配信】はじめまして！恋乃夜まいです♡【新人Vtuber】</b></a>
                                <span>2021年3月21日・初配信アーカイブ<a class="wk-cite" href="#src-6">[6]</a></span>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="wk-section" id="overview">
                    <h2>概要</h2>

                    <p>恋乃夜まいは、「恋の魔女として生まれた異世界の元お姫様」という設定のバーチャルYouTuberである。魔力の暴走から逃れて魔法の存在しない地球へやってきたが、その身体は「ドキドキ」を食べないと生きていけないという設定で、決め台詞は「君のドキドキ…食べさせてくれない？」<a class="wk-cite" href="#src-2">[2]</a>。異世界の元お姫様という出自に似合わず、口調はやわらかく甘えたものになっている。</p>

                    <p>容姿は黒のロングヘアーにパープルのツートンメッシュ、左目近くに泣きぼくろ、右耳に大きめのピアスが特徴<a class="wk-cite" href="#src-1">[1]</a>。メタ的な存在でもあり、自らを「人の手で創られた存在」と認識しており、キャラクターデザインを手がけたMAIRO氏を「ママ」、モーションデザイン担当のはちゃち氏を「パパ」と呼ぶ<a class="wk-cite" href="#src-1">[1]</a>。ファンアートは「#koinoyart」タグで投稿されており<a class="wk-cite" href="#src-12">[12]</a>、pixivでのイラスト文化も盛んだ<a class="wk-cite" href="#src-3">[3]</a>。</p>

                    <p>配信の中心はASMRである。初配信から1週間ほどでASMR枠を開始し、初期は3Dio、2021年9月にはKU100を導入して高音質な囁き配信を続けている<a class="wk-cite" href="#src-1">[1]</a><a class="wk-cite" href="#src-6">[6]</a>。アーカイブの収録本数ではASMRが全カテゴリ中最多で、全体の約4割を占める<a class="wk-cite" href="#src-6">[6]</a>。ほかに雑談・歌枠・ゲーム（ホラー系や『ゼルダの伝説』シリーズなど）をこなし、晩酌しながらの雑談や午後の時間帯の「ごごまい」など、番組性のある枠も定期的に行っている<a class="wk-cite" href="#src-6">[6]</a>。</p>

                    <p>経歴をたどると、2021年3月19日に自己紹介動画を公開し、3月21日に初配信を行った<a class="wk-cite" href="#src-6">[6]</a>。登録者は初配信後1か月足らずで10万人に達し<a class="wk-cite" href="#src-6">[6]</a>、デビュー1か月後の5月には中国語の勉強枠を経て<a href="https://space.bilibili.com/1900434152" target="_blank" rel="noopener">bilibili</a>へ進出、中国人ファンの獲得にも成功している<a class="wk-cite" href="#src-1">[1]</a>。2022年には<a href="https://vtuberfesjapan.jp/" target="_blank" rel="noopener">VTuber Fes Japan</a> 2022のアンバサダーに就任し<a class="wk-cite" href="#src-3">[3]</a>、同年5月に始動した「恋乃夜まい3D化支援プロジェクト！」は目標300万円に対し809万円を集め<a class="wk-cite" href="#src-8">[8]</a>、2023年6月に3Dモデルが披露された<a class="wk-cite" href="#src-3">[3]</a>。新衣装の公開時はトレンド入りするなど、話題性も高い<a class="wk-cite" href="#src-1">[1]</a>。</p>

                    <p>所属は、デビュー時のプロプロプロダクション2期生から、2023年3月のグループ再編でめるれっとへ<a class="wk-cite" href="#src-4">[4]</a>。2025年7月17日、恋乃夜まいを<strong>0期生 兼 コンテンツプロデューサー</strong>としてVTuber事務所「<strong><a href="https://vkano.jp/" target="_blank" rel="noopener">ぶいカノ（Vkano）</a></strong>」が設立され、移籍した<a class="wk-cite" href="#src-2">[2]</a>。現在は同社の0期生として配信活動を続けると同時に、コンテンツプロデューサーとして後輩タレントの育成・プロデュースも担っている<a class="wk-cite" href="#src-2">[2]</a>。2026年10月時点で登録者は約29.8万人で、収録されたアーカイブは約730本・総配信時間は2,000時間以上に及ぶ<a class="wk-cite" href="#src-6">[6]</a>。</p>
                </section>

                <section class="wk-section" id="history">
                    <h2>経歴</h2>
                    <ul class="wk-history">
                        <li><b>2021年3月</b> — プロプロプロダクションのオーディションに選ばれ活動を開始<a class="wk-cite" href="#src-3">[3]</a>。19日に初動画を公開し、21日に初配信、28日に初のASMR配信を行う<a class="wk-cite" href="#src-6">[6]</a>。</li>
                        <li><b>2021年4月</b> — 21日、デビュー1か月でチャンネル登録者10万人を突破<a class="wk-cite" href="#src-6">[6]</a><a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2021年5月</b> — 13日に<a href="https://space.bilibili.com/1900434152" target="_blank" rel="noopener">bilibili</a>チャンネルを開設し、翌14日に登録10万人を突破<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2021年9月</b> — ASMR機材を3DioからKU100へ切り替え、高音質配信の基盤を整える<a class="wk-cite" href="#src-1">[1]</a>。</li>
                        <li><b>2021年10月</b> — 13日、<a href="https://manasisrefrain.com/" target="_blank" rel="noopener">『マナシスリフレイン』</a>正式サービス開始に伴うタイアップ企画に参加<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2021年12月</b> — 27日、チャンネル登録者20万人を突破<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2022年3月</b> — 12日、<a href="https://vtuberfesjapan.jp/" target="_blank" rel="noopener">VTuber Fes Japan 2022</a>のアンバサダーに就任<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2022年4月</b> — ファンクラブ「舞踏会」（Fanicon）を開設<a class="wk-cite" href="#src-3">[3]</a>。15日に渋谷モディでポップアップストアを開催<a class="wk-cite" href="#src-3">[3]</a>。29日・30日、VTuber Fes Japan 2022が幕張メッセで開催<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2022年5月</b> — 16日、カプとれ×プロプロプロダクション2期生コラボが決定<a class="wk-cite" href="#src-3">[3]</a>。22日、<a href="https://camp-fire.jp/projects/view/512162" target="_blank" rel="noopener">CAMPFIRE</a>で「恋乃夜まい3D化支援プロジェクト！」を開始し、開始1時間で300万円の目標を達成<a class="wk-cite" href="#src-3">[3]</a><a class="wk-cite" href="#src-8">[8]</a>。</li>
                        <li><b>2022年6月</b> — 21日、3D化支援プロジェクトを終了し、最終調達額809万円<a class="wk-cite" href="#src-8">[8]</a>。</li>
                        <li><b>2022年7月</b> — チャンネルの総再生回数が累計1000万回を突破<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2022年8月</b> — 20日、新衣装をお披露目。「#恋乃夜まい新衣装」がトレンド入りした<a class="wk-cite" href="#src-1">[1]</a>。</li>
                        <li><b>2022年11月</b> — 12日から20日までパセラリゾーツ×プロプロプロダクション「プロプロカフェ」に参加<a class="wk-cite" href="#src-3">[3]</a>。16日に1stアルバム『PROPRISM』（収録曲「喜劇」）をリリース<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2022年12月</b> — 17日、録り下ろしASMRボイス搭載イヤフォンの予約販売が開始<a class="wk-cite" href="#src-11">[11]</a>。</li>
                        <li><b>2023年2月</b> — 18日、プロプロプロダクションとして『ひぐらしのなく頃に』同時視聴番組に出演（咲夜あずさ・白瀬あおい・猟奇ちゃきと）<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2023年3月</b> — 1日、プロプロプロダクションのグループ再編によりめるれっとへ移籍<a class="wk-cite" href="#src-4">[4]</a>。</li>
                        <li><b>2023年6月</b> — 18日、3Dモデルが完成し、単独初ライブを実施<a class="wk-cite" href="#src-3">[3]</a>。</li>
                        <li><b>2023年12月</b> — 縦長配信が実装され、雑談・ASMR配信に組み込まれる<a class="wk-cite" href="#src-1">[1]</a>。</li>
                        <li><b>2024年3月</b> — ファンクラブをFaniconの「舞踏会」からPixiv Fanboxへ移行（3月にFanboxの稼働記録）<a class="wk-cite" href="#src-7">[7]</a>。29日、めるれっととしてタイトーオンラインクレーン（タイクレ）とのコラボプライズ展開<a class="wk-cite" href="#src-5">[5]</a>。</li>
                        <li><b>2025年</b> — ぶいカノのオーディション期間中に、音声配信アプリ「<a href="https://www.spooncast.net/jp/channel/317680759/tab/home" target="_blank" rel="noopener">Spoon</a>」で一度だけ配信を行う（チャンネルは現在も残存）<a class="wk-cite" href="#src-13">[13]</a>。</li>
                        <li><b>2025年7月</b> — 17日、恋乃夜まいを0期生兼コンテンツプロデューサーとしてVTuber事務所「<a href="https://vkano.jp/" target="_blank" rel="noopener">ぶいカノ（Vkano）</a>」が設立され、移籍<a class="wk-cite" href="#src-2">[2]</a>。</li>
                        <li><b>2026年2月</b> — 14日、<a href="https://www.dlsite.com/maniax-touch/work/=/product_id/RJ01566347.html" target="_blank" rel="noopener">DLsite</a>でバレンタイン限定シチュエーションボイス「【ドMボイス】押しに弱い彼女をいじめたい。CV.恋乃夜まい」を発売（R18・サークルは「ぶいカノ」名義・自らがシナリオを書き下ろし）<a class="wk-cite" href="#src-9">[9]</a>。</li>
                        <li><b>2026年8月17日</b> — 「<strong>思い出いっぱいな日</strong>」。本人が「マイとダーリンの付き合った記念日」と位置づける日であり、「8月を記念日にしよう」と決めたと語った。同年9月7日の<a href="https://www.youtube.com/live/LuPA2fN2PJY" target="_blank" rel="noopener">配信</a>では「8月17日に戻ると」の約束と「1年後だよ」との言葉も残している<a class="wk-cite" href="#src-6">[6]</a>。</li>
                        <li><b>2026年9月</b> — 17日、<strong>初のR18音声作品</strong>「高嶺の花と社内SEXで連続絶頂…！」（三原実莉／サークル名義「恋乃夜まい」）を<a href="https://www.dlsite.com/maniax/work/=/product_id/RJ01720281.html" target="_blank" rel="noopener">DLsite</a>で発売<a class="wk-cite" href="#src-10">[10]</a>。</li>
                        <li><b>2026年10月</b> — 10月時点で登録者約29.8万人、収録アーカイブ約730本に到達<a class="wk-cite" href="#src-6">[6]</a>。</li>
                    </ul>
                </section>

                <section class="wk-section" id="person">
                    <h2>人物</h2>

                    <p>VTuberになることを決めたのは「毎日が同じでつまらない」という理由からで、プロプロプロダクションのオーディションに選ばれたことがきっかけになっている<a class="wk-cite" href="#src-3">[3]</a>。どこか艶を含んだ声質が特徴で、物腰は穏やか。配信中に怒った姿はほとんどなく、相手を素直に褒めたり、嬉しさや恥ずかしさをそのまま言葉にしたりする率直な性格<a class="wk-cite" href="#src-1">[1]</a>。好奇心旺盛で、新しく覚えた言葉や流行を取り入れるのが好き。一方で、自身の配信で語るところでは強めの嫉妬心や束縛願望を持ち合わせており、いわゆる「メンヘラ」な面も持ち味として扱われている<a class="wk-cite" href="#src-1">[1]</a>。大きな挑戦になると緊張のあまり落ち着けなくなることも本人が明かしている<a class="wk-cite" href="#src-1">[1]</a>。</p>

                    <p>一人称は「まい」<a class="wk-cite" href="#src-6">[6]</a>、リスナーのことを「だーりん」と呼び<a class="wk-cite" href="#src-2">[2]</a>、配信開始時の挨拶は「こんまい！」、終了時は「おつゆゆ」<a class="wk-cite" href="#src-3">[3]</a>。「おつゆゆ」に公式な意味はない（本人曰く「可愛いから」）が、由来は中国語の配信で「ゆゆ」という謎の発音が爆笑を呼んだ流れであると語っている。中国語で「ゆ」は「魚」を意味するため、実際には終わりの挨拶ではリスナーから「おつ魚」と呼ばれている<a class="wk-cite" href="#src-6">[6]</a>（<a href="https://www.youtube.com/watch?v=3ZMpmHoZp7U&amp;t=1831s" target="_blank" rel="noopener">2025年1月11日の配信</a> 30:31〜）。この終わりの挨拶は、配信後に合言葉をアーカイブ用へ切り替え忘れしないための合図であることもあると説明されている<a class="wk-cite" href="#src-6">[6]</a>。ASMRや囁きの配信では低めの声でゆっくり喋る<a class="wk-cite" href="#src-2">[2]</a>。</p>

                    <p>保育の資格を所持しており、ピアノが特技。趣味はバチェラーの視聴で、好きなお酒はモーツァルトのチョコレートリキュール。ゲームは苦手な方面んでいたが、好きになってきていると語っている<a class="wk-cite" href="#src-3">[3]</a>。日本語・中国語・英語を扱えるマルチバイリンガルであり、中国語はデビュー直後の勉強枠から自ら身につけたものである<a class="wk-cite" href="#src-1">[1]</a>。</p>

                    <p>人間関係では、咲夜あずさ・猟奇ちゃきとは事務所加入以前からの知り合いであることを明かしている<a class="wk-cite" href="#src-1">[1]</a>。アーカイブ上のコラボ回数でも白瀬あおい（8本）・猟奇ちゃき（7本）・憩居ももあ（5本）が上位にあり、旧2期生・めるれっと時代の同僚との交流が長く続いていることがわかる<a class="wk-cite" href="#src-6">[6]</a>。2期生5人でのユニット「Kissh」や、咲夜あずさ・猟奇ちゃき・白瀬あおいとの「めすぱふぇ」なども結成している<a class="wk-cite" href="#src-1">[1]</a>。また、コミュ力のある妹や、喋り方が似ている母がいることも語っている<a class="wk-cite" href="#src-1">[1]</a>。</p>
                </section>

                <section class="wk-section" id="links">
                    <h2>外部リンク</h2>
                    <div class="wk-card">
                        <ul>
                            <li><a href="https://vkano.jp/" target="_blank" rel="noopener">ぶいカノ 公式サイト</a> ／ <a href="https://vkano.jp/talent/koinoyamai" target="_blank" rel="noopener">公式プロフィール</a></li>
                            <li><a href="https://www.youtube.com/@koinoyamaich" target="_blank" rel="noopener">YouTube @koinoyamaich</a></li>
                            <li><a href="https://twitter.com/koinoya_mai" target="_blank" rel="noopener">X（旧Twitter）@koinoya_mai</a></li>
                            <li><a href="https://www.twitch.tv/koinoya_mai" target="_blank" rel="noopener">Twitch</a> ／ <a href="https://twitcasting.tv/c:koinoya_mai" target="_blank" rel="noopener">TwitCasting</a></li>
                            <li><a href="https://koinoya-mai.fanbox.cc/" target="_blank" rel="noopener">Pixiv Fanbox</a>（ファンクラブ）</li>
                            <li><a href="https://space.bilibili.com/1900434152" target="_blank" rel="noopener">bilibili</a></li>
                            <li><a href="/archive/" target="_blank" rel="noopener">配信アーカイブ検索</a>（本サイト・字幕・コメントの全文検索）</li>
                        </ul>
                    </div>
                </section>

                <section class="wk-section" id="sources">
                    <h2>出典</h2>
                    <div class="wk-card">
                        <ol class="wk-sources">
                            <li id="src-1"><a href="https://dic.pixiv.net/a/%E6%81%8B%E4%B9%83%E5%A4%9C%E3%81%BE%E3%81%84" target="_blank" rel="noopener">ピクシブ百科事典「恋乃夜まい」</a>（CC BY-SA 3.0）— 年齢設定・容姿・キャラデザ/モーション・ファンネーム・KU100導入・新衣装・bilibili進出・マルチバイリンガル・人物像・ユニット・縦長配信</li>
                            <li id="src-2"><a href="https://vkano.jp/talent/koinoyamai" target="_blank" rel="noopener">ぶいカノ 公式プロフィール</a>（<a href="https://vkano.jp/" target="_blank" rel="noopener">vkano.jp</a>）— 所属・0期生兼コンテンツプロデューサー・設立日・誕生日・身長・設定・決め台詞・だーりん・Fanboxリンク</li>
                            <li id="src-3"><a href="https://web.archive.org/web/20250219093404/https://ja.wikipedia.org/wiki/%E6%81%8B%E4%B9%83%E5%A4%9C%E3%81%BE%E3%81%84" target="_blank" rel="noopener">Wikipedia「恋乃夜まい」最終版（2025年1月26日・Wayback Machineアーカイブ・CC BY-SA 4.0）</a> — 志望動機・経歴の日付（10万人/20万人/bilibili/VTuber Fes/3D/単独ライブ）・タイアップ・趣味や特技・挨拶・ディスコグラフィ</li>
                            <li id="src-4"><a href="https://bacharu.io/vtuber/koinoya-mai" target="_blank" rel="noopener">Bācharu「Koinoya Mai」</a> — 所属沿革（プロプロ2期生→2023年めるれっと再編→2025年ぶいカノ）・推しマーク</li>
                            <li id="src-5"><a href="https://panora.tokyo/archives/82842" target="_blank" rel="noopener">PANORA（2024年3月22日）「プロプロ所属VTuber…タイクレとコラボ」</a> — 2024年3月のタイクレコラボ</li>
                            <li id="src-6">本サイトの配信アーカイブ（<a href="/archive/" target="_blank" rel="noopener">配信アーカイブ検索</a>・動画カタログ・登録者数の日次記録・カテゴリ/コラボ統計・字幕・コメント・配信要約）— 初配信日・初ASMR・登録者数推移・収録本数・カテゴリ比率・コラボ回数・24万歳発言・8月17日の記念日に関する発言・「おつゆゆ」の由来と「おつ魚」</li>
                            <li id="src-7"><a href="https://web.archive.org/web/20240316073448/https://koinoya-mai.fanbox.cc/" target="_blank" rel="noopener">Wayback Machine</a>（koinoya-mai.fanbox.cc 最初の記録 2024年3月16日／fanicon.net/fancommunities/4401 は2022年から記録）— ファンクラブのFanicon「舞踏会」からPixiv Fanboxへの移行時期</li>
                            <li id="src-8"><a href="https://camp-fire.jp/projects/view/512162" target="_blank" rel="noopener">CAMPFIRE「恋乃夜まい3D化支援プロジェクト！」</a> — 開始1時間で300万円達成・最終調達額809万円</li>
                            <li id="src-9"><a href="https://www.dlsite.com/maniax-touch/work/=/product_id/RJ01566347.html" target="_blank" rel="noopener">DLsite「【ドMボイス】押しに弱い彼女をいじめたい。CV.恋乃夜まい」（2026年2月14日発売・R18）</a> — サークル「ぶいカノ」名義のシチュエーションボイス販売</li>
                            <li id="src-10"><a href="https://www.dlsite.com/maniax/work/=/product_id/RJ01720281.html" target="_blank" rel="noopener">DLsite「【総フォロワー90万VTuberの初R18♡】高嶺の花と社内SEXで連続絶頂…！」（2026年9月17日発売・R18）</a> — 初のR18音声作品（サークル名義「恋乃夜まい」）</li>
                            <li id="src-11"><a href="https://prtimes.jp/main/html/rd/p/000000233.000013188.html" target="_blank" rel="noopener">PR TIMES（2022年12月17日）「録り下ろしASMRボイス搭載イヤフォン予約販売開始」</a> — イヤフォン商品化</li>
                            <li id="src-12"><a href="https://x.com/koinoya_mai" target="_blank" rel="noopener">X（旧Twitter）@koinoya_mai プロフィール</a> — 現行のハッシュタグ（#dear_mai ／ #koinoyart ／ #濃いのやまい）・名表記「恋乃夜まい💗🥄ぶいカノ」（2026年10月時点）</li>
                            <li id="src-13"><a href="https://www.spooncast.net/jp/channel/317680759/tab/home" target="_blank" rel="noopener">Spoonチャンネル（恋乃夜まい）</a> — ぶいカノオーディション時期に行った一度だけのSpoon配信（時期は本人説による・チャンネルは残存）</li>
                        </ol>
                        <p class="wk-src-note">
                            本ページはファンによる非公式の整理であり、公式情報ではありません。
                            統計値は記載時点のもので、それ以降に変動している可能性があります。
                            ピクシブ百科事典・Wikipediaはクリエイティブ・コモンズ表示-継承ライセンス（CC BY-SA）で公開されています。
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
