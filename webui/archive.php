<!doctype html>
<html lang="ja">

<head>
    <?php
    $pageTitle = "配信アーカイブ検索";
    $pageDesc = "恋乃夜まいの配信アーカイブを横断検索できるページ。タイトル・文字起こし・コメント・ライブチャットを全文検索し、該当箇所のタイムスタンプ付きURLからYouTubeへ直接ジャンプできます。";

    // ---- SEO: 検索クエリ付きページはインデックスしない（アーカイブ本文のみインデックス） ----
    $robotsNoindex = !empty($_GET['q']) && trim((string)$_GET['q']) !== '';

    // ---- SEO: サーバーサイドで直近アーカイブを描画（検索エンジン向け本文） ----
    $seoArchives = array();
    $seoCategories = array();
    $seoArchiveTotal = 0;
    $seoJsonLd = '';

    function mai_archive_fetch($path, $timeoutSec = 6)
    {
        $url = 'https://mai.honna-yuzuki.com' . $path;
        $ctx = stream_context_create(array(
            'http' => array('timeout' => $timeoutSec, 'ignore_errors' => true),
            'ssl'  => array('verify_peer' => false, 'verify_peer_name' => false),
        ));
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) return null;
        $data = json_decode($body, true);
        return is_array($data) ? $data : null;
    }

    $arCategory = (isset($_GET['category']) && trim((string)$_GET['category']) !== '')
        ? rawurlencode(trim((string)$_GET['category'])) : '';
    $arList = mai_archive_fetch('/api/archive/videos?limit=12&sort=stream_at_desc'
        . ($arCategory !== '' ? '&category=' . $arCategory : ''));
    if ($arList !== null) {
        $seoArchives = (isset($arList['videos']) && is_array($arList['videos'])) ? $arList['videos'] : array();
        $seoArchiveTotal = isset($arList['total']) ? (int)$arList['total'] : count($seoArchives);
    }
    $arStats = mai_archive_fetch('/api/archive/stats');
    if ($arStats !== null && isset($arStats['categories']) && is_array($arStats['categories'])) {
        arsort($arStats['categories']);
        $seoCategories = array_keys($arStats['categories']);
    }

    if (!empty($seoArchives)) {
        $itemList = array();
        foreach ($seoArchives as $row) {
            $uploadDate = isset($row['stream_date_jst']) ? str_replace(' ', 'T', $row['stream_date_jst']) . '+09:00' : '';
            $itemList[] = array(
                '@type' => 'VideoObject',
                'name' => isset($row['title']) ? $row['title'] : '',
                'url' => isset($row['url']) ? $row['url'] : '',
                'thumbnailUrl' => 'https://mai.honna-yuzuki.com' . (isset($row['thumbnail']) ? $row['thumbnail'] : ''),
                'uploadDate' => $uploadDate,
            );
        }
        $seoJsonLd = json_encode(array(
            '@context' => 'https://schema.org',
            '@type' => 'CollectionPage',
            'name' => '恋乃夜まい 配信アーカイブ一覧',
            'description' => '恋乃夜まい（まいちゃん）の配信アーカイブ。YouTubeで公開されたアーカイブを一覧掲載。タイトル・文字起こし・コメント検索にも対応。',
            'url' => 'https://mai.honna-yuzuki.com/archive',
            'mainEntity' => array(
                '@type' => 'ItemList',
                'itemListElement' => $itemList,
            ),
        ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    $extraHead = '
    <style type="text/css">
        /* display:flex を持つ要素は UA の [hidden] より詳細度が高いので明示的に打ち消す */
        [hidden] {
            display: none !important;
        }

        /* ---------- 左右の立ち絵 ----------
           body::before(-2)=背景画像 / body::after(-1)=暗幕 の間に敷く。
           main は position:static なので z-index:-1 でも本文の下に回る。 */
        .ar-deco {
            /* fixed をやめてドキュメントへ絶対配置（ページと一緒に流れる）。
               body に position 指定が無いので基準は初期包含ブロック＝ドキュメント原点。 */
            position: absolute;
            z-index: 0;
            /* 左右の余白（50vw - 560px）に追従しつつ、できるだけ大きく */
            width: clamp(260px, calc(50vw - 545px), 430px);
            opacity: 0;
            pointer-events: none;
            user-select: none;
            filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.45));
            /* 本文より遅れて下へずらすことで「スクロールが鈍い」視差になる。--dy は archive.js が更新 */
            transform: translate3d(0, var(--dy, 0px), 0);
            transition: opacity 1.1s ease 0.2s;
            will-change: transform, opacity;
            display: none;
        }

        .ar-deco.is-in {
            opacity: 0.95;
        }

        .ar-deco img {
            width: 100%;
            height: auto;
            display: block;
        }

        /* main(最大1200px)の外側に置く。狭い画面では本文に被るので出さない
           左は上寄り、右はそれより下げて高さをずらす */
        .ar-deco-left {
            right: calc(50% + 560px);
            top: 180px;
        }

        .ar-deco-right {
            left: calc(50% + 560px);
            top: 620px;
        }

        @media (min-width: 1560px) {
            .ar-deco {
                display: block;
            }
        }

        .ar-intro {
            background: rgba(250, 250, 250, 0.9);
            color: #000;
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 16px;
            line-height: 1.7;
        }

        .ar-intro h1,
        .ar-intro h2 {
            font-size: 1.3rem;
            color: var(--color-primary);
            margin: 0 0 8px;
            font-weight: bold;
        }

        .ar-intro p {
            margin: 0;
            font-size: 0.92rem;
            color: #333;
        }

        /* ---------- 検索フォーム ---------- */
        .ar-form {
            background: rgba(250, 250, 250, 0.9);
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 14px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: flex-end;
        }

        .ar-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .ar-field.grow {
            flex: 1 1 260px;
        }

        .ar-field label {
            font-size: 0.75rem;
            font-weight: 700;
            color: #666;
        }

        .ar-form input[type="search"],
        .ar-form select {
            padding: 9px 12px;
            border: 1px solid #ccc;
            border-radius: 8px;
            font-size: 0.95rem;
            background: #fff;
            color: #222;
            font-family: inherit;
        }

        .ar-form input[type="search"]:focus,
        .ar-form select:focus {
            outline: 2px solid var(--color-primary);
            outline-offset: 1px;
        }

        .ar-btn {
            padding: 9px 18px;
            border-radius: 8px;
            border: 1px solid var(--color-primary);
            background: var(--color-primary);
            color: #fff;
            font-size: 0.92rem;
            font-weight: 700;
            cursor: pointer;
            transition: opacity 0.15s, transform 0.12s;
            font-family: inherit;
        }

        .ar-btn:hover {
            opacity: 0.88;
            transform: translateY(-1px);
        }

        .ar-btn.ghost {
            background: #fff;
            color: var(--color-primary);
        }

        /* ---------- 状態表示 ---------- */
        .ar-status {
            color: #fff;
            font-size: 0.85rem;
            margin: 0 0 12px 2px;
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
        }

        .ar-status.is-error {
            color: #ffb4b4;
        }

        /* ---------- カード ---------- */
        .ar-results {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 18px;
        }

        .ar-card {
            background: rgba(252, 252, 252, 0.96);
            border-radius: 14px;
            overflow: hidden;
            height: 100%;
            display: flex;
            flex-direction: column;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
            transition: transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1),
                box-shadow 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
        }

        .ar-card:hover,
        .ar-card:focus-within {
            transform: translateY(-6px);
            box-shadow: 0 16px 34px rgba(0, 0, 0, 0.38);
        }

        /* ---------- サムネイル ---------- */
        .ar-thumb {
            position: relative;
            display: block;
            width: 100%;
            aspect-ratio: 16 / 9;
            background: #e3e3e8;
            overflow: hidden;
            text-decoration: none;
        }

        .ar-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transform: scale(1.001);
            transition: transform 0.65s cubic-bezier(0.22, 0.61, 0.36, 1),
                filter 0.4s ease;
        }

        .ar-card:hover .ar-thumb img,
        .ar-card:focus-within .ar-thumb img {
            transform: scale(1.09);
            filter: saturate(1.08) brightness(1.04);
        }

        .ar-veil {
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, rgba(0, 0, 0, 0.05) 35%, rgba(177, 30, 124, 0.55) 100%);
            opacity: 0;
            transition: opacity 0.35s ease;
            pointer-events: none;
        }

        .ar-card:hover .ar-veil,
        .ar-card:focus-within .ar-veil {
            opacity: 1;
        }

        .ar-play {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 54px;
            height: 54px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.94);
            color: var(--color-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.05rem;
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.65);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
            transition: opacity 0.28s ease,
                transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
        }

        .ar-play i {
            margin-left: 3px;
        }

        .ar-card:hover .ar-play,
        .ar-card:focus-within .ar-play {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }

        .ar-dur {
            position: absolute;
            right: 7px;
            bottom: 7px;
            padding: 2px 7px;
            border-radius: 5px;
            background: rgba(0, 0, 0, 0.78);
            color: #fff;
            font-size: 0.7rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            transition: opacity 0.28s ease;
            pointer-events: none;
        }

        .ar-card:hover .ar-dur,
        .ar-card:focus-within .ar-dur {
            opacity: 0;
        }

        /* ---------- 本文（高さを揃えるため各行に下限を持たせる） ---------- */
        .ar-body {
            padding: 12px 14px 14px;
            display: flex;
            flex-direction: column;
            gap: 7px;
            flex: 1;
            min-width: 0;
        }

        .ar-date {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            font-size: 0.78rem;
            font-weight: 700;
            color: var(--color-primary);
            letter-spacing: 0.02em;
        }

        .ar-badge {
            font-size: 0.66rem;
            padding: 1px 7px;
            border-radius: 999px;
            background: var(--color-primary);
            color: #fff;
            font-weight: 700;
        }

        .ar-title {
            font-size: 0.95rem;
            line-height: 1.45;
            margin: 0;
            color: #1a1a1a;
            font-weight: 700;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            min-height: 2.9em;
        }

        .ar-title mark {
            background: #ffe36e;
            color: #000;
            border-radius: 2px;
            padding: 0 1px;
        }

        .ar-cats {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            min-height: 19px;
        }

        .ar-cat {
            font-size: 0.7rem;
            padding: 2px 8px;
            border-radius: 999px;
            background: var(--color-highlight-bg);
            color: var(--color-secondary);
            font-weight: 700;
        }

        .ar-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            font-size: 0.75rem;
            color: #666;
            min-height: 17px;
        }

        .ar-meta span {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .ar-url {
            font-size: 0.72rem;
            color: #0b66c3;
            text-decoration: none;
            display: flex;
            align-items: flex-start;
            gap: 5px;
            line-height: 1.4;
        }

        .ar-url span {
            word-break: break-all;
        }

        .ar-url:hover {
            text-decoration: underline;
        }

        .ar-url .fa-youtube {
            color: #ff0033;
            margin-top: 2px;
            flex-shrink: 0;
        }

        /* 該当箇所が無いカードは URL を最下部に寄せて列を揃える */
        .ar-card:not(.has-hits) .ar-url {
            margin-top: auto;
        }

        .ar-card.has-hits .ar-hits {
            margin-top: auto;
        }

        /* ---------- 検索ヒット ---------- */
        .ar-hits {
            padding-top: 9px;
            border-top: 1px dashed #d8d8e0;
        }

        .ar-hits-title {
            font-size: 0.74rem;
            font-weight: 700;
            color: #777;
            margin-bottom: 6px;
        }

        .ar-hit-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .ar-hit {
            background: #f4f4f8;
            border-radius: 8px;
            padding: 8px 10px;
        }

        .ar-hit-head {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
        }

        .ar-hit-kind {
            font-size: 0.66rem;
            font-weight: 700;
            padding: 1px 7px;
            border-radius: 999px;
            color: #fff;
        }

        .ar-kind-transcript {
            background: #7b4bd6;
        }

        .ar-kind-comment {
            background: #2e8b57;
        }

        .ar-kind-chat {
            background: #d67b1e;
        }

        .ar-hit-at {
            font-size: 0.7rem;
            color: #666;
            font-variant-numeric: tabular-nums;
        }

        .ar-hit-text {
            margin: 0 0 5px;
            font-size: 0.82rem;
            line-height: 1.55;
            color: #222;
            word-break: break-word;
        }

        .ar-hit-text mark {
            background: #ffe36e;
            color: #000;
            font-weight: 700;
            padding: 0 1px;
            border-radius: 2px;
        }

        .ar-hit-url {
            font-size: 0.68rem;
            color: #0b66c3;
            word-break: break-all;
            text-decoration: none;
            display: inline-flex;
            align-items: flex-start;
            gap: 4px;
            line-height: 1.4;
        }

        .ar-hit-url:hover {
            text-decoration: underline;
        }

        /* ---------- 2件目以降の折りたたみ ---------- */
        .ar-more {
            margin-top: 8px;
        }

        .ar-more>summary {
            list-style: none;
            cursor: pointer;
            user-select: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 11px;
            border-radius: 999px;
            background: var(--color-highlight-bg);
            color: var(--color-primary);
            font-size: 0.74rem;
            font-weight: 700;
            transition: background 0.18s ease;
        }

        .ar-more>summary::-webkit-details-marker {
            display: none;
        }

        .ar-more>summary:hover {
            background: #f2cde6;
        }

        .ar-more>summary i {
            font-size: 0.62rem;
            transition: transform 0.25s ease;
        }

        .ar-more[open]>summary i {
            transform: rotate(180deg);
        }

        .ar-more .ar-more-close {
            display: none;
        }

        .ar-more[open] .ar-more-open {
            display: none;
        }

        .ar-more[open] .ar-more-close {
            display: inline;
        }

        .ar-more .ar-hit-list {
            margin-top: 8px;
            max-height: 300px;
            overflow-y: auto;
        }

        /* ---------- 空・スケルトン ---------- */
        .ar-empty {
            grid-column: 1 / -1;
            background: rgba(250, 250, 250, 0.9);
            border-radius: 12px;
            padding: 36px 20px;
            text-align: center;
            color: #444;
            line-height: 1.7;
            margin: 0;
        }

        .ar-skeleton {
            pointer-events: none;
        }

        .ar-skeleton .sk {
            display: block;
            height: 12px;
            border-radius: 6px;
            background: linear-gradient(90deg, #e6e6ec 25%, #f2f2f6 50%, #e6e6ec 75%);
            background-size: 200% 100%;
            animation: arShimmer 1.2s infinite;
        }

        .ar-skeleton .sk-sm {
            width: 40%;
        }

        .ar-skeleton .sk-md {
            width: 70%;
        }

        .ar-skeleton .sk-lg {
            width: 92%;
            height: 18px;
        }

        .ar-skeleton .ar-thumb {
            background: linear-gradient(90deg, #e6e6ec 25%, #f2f2f6 50%, #e6e6ec 75%);
            background-size: 200% 100%;
            animation: arShimmer 1.2s infinite;
        }

        @keyframes arShimmer {
            0% {
                background-position: 200% 0;
            }

            100% {
                background-position: -200% 0;
            }
        }

        /* ---------- ページャ ---------- */
        .ar-pager {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin: 24px 0 8px;
        }

        .ar-pages {
            display: inline-flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 6px;
        }

        .ar-pg {
            min-width: 38px;
            height: 38px;
            padding: 0 11px;
            border-radius: 9px;
            border: 1px solid rgba(255, 255, 255, 0.4);
            background: rgba(255, 255, 255, 0.9);
            color: var(--color-text);
            font-size: 0.85rem;
            font-weight: 700;
            font-family: inherit;
            font-variant-numeric: tabular-nums;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: background 0.18s ease, color 0.18s ease,
                border-color 0.18s ease, transform 0.14s ease;
        }

        .ar-pg:hover:not(:disabled):not(.is-current) {
            background: #fff;
            border-color: var(--color-primary);
            color: var(--color-primary);
            transform: translateY(-2px);
        }

        .ar-pg:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }

        .ar-pg.is-current {
            background: var(--color-primary);
            border-color: var(--color-primary);
            color: #fff;
            cursor: default;
        }

        .ar-gap {
            align-self: center;
            padding: 0 2px;
            color: #fff;
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
        }

        .ar-load-more {
            display: flex;
            justify-content: center;
            margin: 18px 0 4px;
        }

        .ar-back {
            display: block;
            text-decoration: none;
            color: inherit;
            margin-top: 20px;
        }

        .ar-back div {
            background-color: #fff;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px 20px;
            border-radius: 12px;
        }

        @media (max-width: 600px) {
            .ar-results {
                grid-template-columns: 1fr;
            }

            .ar-form {
                padding: 14px;
            }

            .ar-field.grow {
                flex-basis: 100%;
            }

            .ar-pg-txt {
                display: none;
            }

            .ar-pg {
                min-width: 36px;
                height: 36px;
                padding: 0 8px;
            }
        }

        @media (prefers-reduced-motion: reduce) {

            .ar-deco {
                transition: none !important;
                transform: none !important;
            }

            .ar-card,
            .ar-thumb img,
            .ar-veil,
            .ar-play,
            .ar-dur,
            .ar-pg,
            .ar-btn,
            .ar-more>summary i {
                transition: none !important;
            }

            .ar-card:hover,
            .ar-card:focus-within {
                transform: none;
            }

            .ar-card:hover .ar-thumb img,
            .ar-card:focus-within .ar-thumb img {
                transform: none;
            }

.ar-skeleton .sk,
                .ar-skeleton .ar-thumb {
                    animation: none;
                }
            }

        /* ---------- SEO向けサーバーサイド描画（検索エンジン用） ---------- */
        .ar-seo-recent,
        .ar-seo-cats-sec {
            background: rgba(250, 250, 250, 0.9);
            color: #000;
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 14px;
        }

        .ar-seo-recent h2,
        .ar-seo-cats-sec h2 {
            font-size: 1.05rem;
            color: var(--color-primary);
            margin: 0 0 6px;
        }

        .ar-seo-desc {
            margin: 0 0 10px;
            font-size: 0.85rem;
            color: #444;
        }

        .ar-seo-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 10px;
        }

        .ar-seo-list li {
            margin: 0;
        }

        .ar-seo-list a {
            display: flex;
            gap: 10px;
            align-items: center;
            text-decoration: none;
            color: #1a1a1a;
            padding: 8px;
            border-radius: 10px;
            background: #fff;
            transition: background 0.18s ease;
        }

        .ar-seo-list a:hover {
            background: #f6e8f0;
        }

        .ar-seo-thumb img {
            width: 96px;
            height: 54px;
            object-fit: cover;
            border-radius: 6px;
            display: block;
            background: #ddd;
        }

        .ar-seo-meta {
            display: block;
            min-width: 0;
            line-height: 1.45;
        }

        .ar-seo-title {
            display: block;
            font-weight: 700;
            font-size: 0.85rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .ar-seo-date,
        .ar-seo-cats {
            display: block;
            font-size: 0.72rem;
            color: #666;
        }

        .ar-seo-more {
            margin: 10px 0 0;
            font-size: 0.85rem;
            text-align: right;
        }

        .ar-seo-more a {
            color: var(--color-primary);
            font-weight: 700;
        }

        .ar-cat-links {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 4px 0 0;
        }

        .ar-cat-links a {
            padding: 6px 14px;
            border-radius: 999px;
            background: #fff;
            border: 1px solid rgba(177, 30, 124, 0.4);
            color: var(--color-primary);
            font-size: 0.85rem;
            font-weight: 700;
            text-decoration: none;
            transition: background 0.18s ease, color 0.18s ease;
        }

        .ar-cat-links a:hover {
            background: var(--color-primary);
            color: #fff;
        }
    </style>
    ';
    include __DIR__ . '/head.php';
    if (!empty($seoJsonLd)) {
        echo "<script type=\"application/ld+json\">" . $seoJsonLd . "</script>\n";
    }
    ?>
</head>

<body id="app-body">
    <div id="header-slot">
        <?php include __DIR__ . '/header.php'; ?>
    </div>

    <!-- 左右の立ち絵（装飾。スクロール量に応じて archive.js が transform を更新する） -->
    <div class="ar-deco ar-deco-left" data-speed="0.8" aria-hidden="true">
        <img src="/archive01.webp" alt="" width="512" height="512" decoding="async" fetchpriority="low" />
    </div>
    <div class="ar-deco ar-deco-right" data-speed="0.8" aria-hidden="true">
        <img src="/archive02.webp" alt="" width="512" height="512" decoding="async" fetchpriority="low" />
    </div>

    <main>
        <section class="ar-intro">
            <h1>配信アーカイブ検索</h1>
            <p>
                恋乃夜まいの配信アーカイブを検索できます。サムネイルまたはカード内のURLからYouTubeの該当動画が開きます。<br>
                キーワード検索では<strong>タイトル・文字起こし・コメント・ライブチャット</strong>を検索し、該当箇所のタイムスタンプ付きURLを表示します（「かわいい / 可愛い / カワイイ」のような表記ゆれも同じ結果になります）。
</p>
            </section>

        <?php if (!empty($seoCategories)): ?>
        <section class="ar-seo-cats-sec" aria-label="カテゴリから探す">
            <h2>カテゴリから探す</h2>
            <p class="ar-cat-links">
                <?php foreach ($seoCategories as $cat): ?>
                <a href="/archive?category=<?= rawurlencode($cat) ?>"><?= htmlspecialchars($cat) ?></a>
                <?php endforeach; ?>
            </p>
        </section>
        <?php endif; ?>

        <?php if (!empty($seoArchives)): ?>
        <section class="ar-seo-recent" aria-label="最新の配信アーカイブ一覧">
            <h2><?= $arCategory !== '' ? '「' . htmlspecialchars(urldecode($arCategory)) . '」のアーカイブ' : '最新の配信アーカイブ' ?></h2>
            <p class="ar-seo-desc">
                <?php if ($arCategory !== ''): ?>
                恋乃夜まいの「<?= htmlspecialchars(urldecode($arCategory)) ?>」カテゴリの配信アーカイブです（全<?= (int)$seoArchiveTotal ?>件）。
                <?php else: ?>
                恋乃夜まいの最新の配信アーカイブを新しい順に掲載しています（全<?= (int)$seoArchiveTotal ?>件）。配信タイトルからYouTubeの該当動画へジャンプできます。
                <?php endif; ?>
            </p>
            <ul class="ar-seo-list">
                <?php foreach ($seoArchives as $row): ?>
                <li>
                    <a href="<?= htmlspecialchars(isset($row['url']) ? $row['url'] : '#') ?>" rel="noopener noreferrer" target="_blank">
                        <span class="ar-seo-thumb"><img src="/api/thumbnail/<?= htmlspecialchars($row['video_id'] ?? '') ?>"
                                alt="" width="96" height="54" loading="lazy" decoding="async" /></span>
                        <span class="ar-seo-meta">
                            <span class="ar-seo-title"><?= htmlspecialchars($row['title'] ?? '') ?></span>
                            <span class="ar-seo-date"><?= htmlspecialchars($row['stream_date_jst'] ?? '') ?> 公開</span>
                            <span class="ar-seo-cats"><?= htmlspecialchars(implode(' / ', $row['categories'] ?? array())) ?></span>
                        </span>
                    </a>
                </li>
                <?php endforeach; ?>
            </ul>
            <p class="ar-seo-more"><a href="/archive">もっと見る（アーカイブ検索）</a></p>
        </section>
        <?php endif; ?>

        <form class="ar-form" id="ar-form" role="search">
            <div class="ar-field grow">
                <label for="ar-q">キーワード</label>
                <input type="search" id="ar-q" name="q" placeholder="例: かわいい / ホラー / おはよう" autocomplete="off" />
            </div>

            <div class="ar-field" id="ar-kind-wrap" hidden>
                <label for="ar-kind">検索対象</label>
                <select id="ar-kind">
                    <option value="all">すべて</option>
                    <option value="title">タイトル</option>
                    <option value="transcript">文字起こし</option>
                    <option value="comment">コメント</option>
                    <option value="chat">ライブチャット</option>
                </select>
            </div>

            <div class="ar-field">
                <label for="ar-category">カテゴリ</label>
                <select id="ar-category">
                    <option value="">すべて</option>
                </select>
            </div>

            <div class="ar-field" id="ar-sort-wrap">
                <label for="ar-sort">並び順</label>
                <select id="ar-sort">
                    <option value="stream_at_desc">配信が新しい順</option>
                    <option value="stream_at_asc">配信が古い順</option>
                    <option value="view_desc">再生数が多い順</option>
                    <option value="like_desc">高評価が多い順</option>
                    <option value="hits_desc" id="ar-sort-hits" hidden disabled>ヒットが多い順</option>
                </select>
            </div>

            <div class="ar-field">
                <label>&nbsp;</label>
                <button type="submit" class="ar-btn"><i class="fa-solid fa-magnifying-glass"></i> 検索</button>
            </div>

            <div class="ar-field" id="ar-clear-wrap" hidden>
                <label>&nbsp;</label>
                <button type="button" class="ar-btn ghost" id="ar-clear">検索を解除</button>
            </div>
        </form>

        <p class="ar-status" id="ar-status" aria-live="polite"></p>

        <div class="ar-results" id="ar-results"></div>

        <div class="ar-load-more" id="ar-load-more-wrap" hidden>
            <button type="button" class="ar-btn" id="ar-load-more">さらに読み込む</button>
        </div>

        <nav class="ar-pager" id="ar-pager" aria-label="ページ送り" hidden></nav>

        <a href="/" class="ar-back">
            <div>
                <h3 style="margin:0;">通知ダッシュボードに戻る</h3>
            </div>
        </a>
    </main>

    <div id="footer-slot">
        <?php include __DIR__ . '/footer.php'; ?>
    </div>

    <script src="/ios-helper.js" defer></script>
    <script src="/dist/archive.min.js?v=<?= @filemtime(__DIR__ . '/dist/archive.min.js') ?: time(); ?>" defer></script>
    <script type="module" src="/dist/main.bundle.min.js?v=<?= @filemtime(__DIR__ . '/dist/main.bundle.min.js') ?: time(); ?>" defer></script>

</body>

</html>
