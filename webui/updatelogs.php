<?php
$updateLogs = [
    [
        "date" => "2026-09-22",
        "details" => [
            "add" => [
                "SSE（/api/events/stream）に接続保護を実装 — 全体接続数上限（SSE_MAX_CLIENTS、既定500）・同一送信元ごとの上限（SSE_MAX_PER_CLIENT、既定5）・接続寿命（SSE_MAX_AGE_MS、既定30分、EventSourceは自動再接続）を設け、超過は429を返す。送信元の判定は前段（nginx/cloudflared）経由のときだけ X-Forwarded-For の末尾要素（実クライアントIP）を使い、直結接続ではTCPピアアドレスを使う（XFF偽造対策）",
                "回帰テスト scripts/regression-test.js を新設 — sqlite3@6 への昇格前に必須のゲート。一時DB＋実push抑止（DISABLE_NOTIFICATIONS=1）で子プロセス起動し、/api/health、notify認証（tokenなし401／HMACなし401／誤HMAC401／完全認証でsuppressed:true）、内部scraper-status認証、token-exchangeの無効code 400、SSE上限429、sqlite3のINSERT/SELECT/lastID/UPSERTを自動検証（stagingで19/19 PASS）",
                "セキュリティ運用ドキュメント SECURITY.md を整備（旧 SECURITY_HANDOFF.txt を移行・改善）— 済み対策の検証結果、innerHTML棚卸し表、trust proxy評価、sqlite3@6昇格手順、ポート/権限の確認手順を記載",
                "通知APIのHMAC署名を送信側で統一 — notify-sign.js（signNotifyPayload）を新設し、twitter / twitcasting / fanbox / youtube / bilibili / ワーカー内通知が /api/notify へ必ず X-Notify-Hmac（HMAC-SHA256生hex）を付与するよう修正。従来信じられていた X-Signature は API 側で読まれず、HMAC必須化後に送信側が未追随のまま全配信が401で失敗し続けていた潜在事故を解消",
                "staging の node_modules を本番への symlink から実体化（依存変更の検証を独立して実行可能に）",
            ],
            "change" => [
                "トークン比較をすべて timingSafeEqual に統一 — /api/notify（routes/notify.js）・内部scraper-status（routes/scraper-status.js）・ワーカー内 /api/notify（main.js）",
                "POST /api/internal/scraper-status の認証を NOTIFY_API_TOKEN に統一し、未設定時は503で閉じるように変更 — 旧実装はトークン未設定だと認証なしで書込可能で、かつ ADMIN_NOTIFY_TOKEN を受入れていた。services/context.js の ADMIN_NOTIFY_TOKEN フォールバックも廃止（API経由の送信者はコード上存在せず、ワーカーは直接DB更新のため影響なし）",
                "秘密情報・バックアップのファイル権限を是正 — 本番・staging の .env を600、backups/ を750（中身は640）に変更。nginxは既に /mai-push/ へのdeny・拡張子deny（.env/.db/.bak等）が有効で、外部からの /backups/*.db や /.env は404になることを実測確認",
                "sqlite3 を 6.0.1 へ昇格（npm audit critical 解消）— Node v22 でネイティブビルドし、回帰テスト19/19・本番smoke を通過後、本番反映",
                "ワーカー内 /api/notify を fail-closed 化（NOTIFY_API_TOKEN未設定時は503で閉じる）。/api/internal/twitter/analysis にもトークン＋HMAC必須化",
                "trust proxy を \"loopback\" に設定し、helmet を全 static（/pushweb /admin /webui）より前へ移動 — 共通セキュリティヘッダの欠落防止",
                "本番・staging の .env から重複キーを除去（dotenvは先頭勝ちで後発行が無効化される罠）。RAG_CHAT_MODEL を gemini-3.5-flash-lite に一本化",
                "DBバックアップの保存先を Web公開ツリー外 /var/lib/mai-push/backups へ移行 — 日次cron（03:00）の出力・履歴23日分＋env を統合し、Webツリー内 backups/ を削除",
                "SMB共有（[html]）から .env / *.db / *.bak / backups を veto files で除外 — LAN共有経由の秘密情報・DBの漏えいを遮断",
            ],
            "fix" => [
                "rss-reader.js のXSSを修正 — 外部RSSの title/description/link/enclosure を未エスケープのまま innerHTML に流し込んでいたため、エスケープ＋ http(s): URL検証＋ textContent 描画に変更",
                "SSEのOrigin判定バグを修正 — 許可オリジンは Set なのに .some() を呼んでおり、同一オリジンの EventSource（Originヘッダなし）で常に TypeError→500 になる潜在バグだった（本番エラーログに過去11,930件記録、デスクトップアプリの再接続ループの原因）。.has() に修正して解消",
                "朝の新着ツイート通知が届かない問題を修正 — HMAC必須化直後の送信側未追随（HMAC付与漏れ）で /api/notify が401になり、ログ上の成功行とは裏腹に実送だけが失敗していた。送信側HMAC統一で解消（修正後の実機配信を確認済み）",
            ],
        ],
        "lines" => "54,179",
    ],

    [
        "date" => "2026-09-21",
        "details" => [
            "add" => [
                "配信アーカイブ管理API（nassy側 api.py の管理者拡張）が実装され、管理画面「アーカイブ管理」の動画カテゴリ編集・YT削除動画の登録が動作開始（.env の ARCHIVE_ADMIN_TOKEN で有効化。更新は部分更新 PUT /api/admin/video/:id、削除は availability=deleted のソフト削除で DB には残す）",
                "管理画面 (admin.html) を全セクション6タブ化 — 通知送信 / アーカイブ管理 / イベント管理 / 今週の一言 / まいAI / パスキーを上部タブで切替（URLハッシュ #tab= でタブ状態を復元）",
                "ツイート統計（管理画面「まいAI」タブ／CLI）に、感情ラベル（POSITIVE/NEUTRAL/NEGATIVE）×時期の交差集計を追加 — 月別・時間帯別・曜日別・カテゴリ別のポジティブ/ネガティブ傾向を積み上げバー＋±インデックスで可視化",
                "DBバックアップを改善（scripts/backup.sh）— 素のcpではWAL未反映で古い日次のスナップショットになる問題を、sqlite3 .backup（整合性チェック付き・稼働中も安全）に置き換え。.env も日次保存（backups/env-*.env）。30日保持",
            ],
            "change" => [
                "「今後の開発予定」ページを更新 — 解決済みの既知の問題を取り消し線付きの完了扱いに変更し、新機能追加予定（登録者推移の自動更新・アーカイブのカテゴリ自動分類・他配信プラットフォーム対応・LLM精度向上・状態予測・字幕精度向上）を追記。既知の問題に「PubSubHubbub障害でYTの通知が届かなくなる」を追記（RSSポーリング併用による通知の冗長化を検討中と明記）",
                "配信アーカイブの最新2件にカテゴリを適用（Collab晩酌 / ASMR晩酌）— カテゴリ付与フォーマットの実地確認。既存の配信日時・再生数・ローカルパス等は保持したまま部分更新できることを検証",
                "アーカイブ管理「カテゴリ編集」を刷新 — タイトル検索をサーバー側化（新ルート /api/admin/archive/search が .70 の /api/search?kind=title を中継）＋ページング＋カテゴリフィルタ＋並び順に対応。一覧のカテゴリはチップ表示でワンクリック追加/解除でき、チェックボックスで複数選択しての一括カテゴリ適用にも対応（.70 へは直列PUT）。動画リスト1回の応答に含まれる categories をそのまま表示するため、従来の1本ごとのカテゴリ取得を廃止して大幅に軽量化",
                "イベント管理にタイトルの絞り込み検索（クライアント側）を追加。通知フォームのプレビューに送信対象（全員/特定デバイス）と即時送信/予約時刻を表示",
                "全ページのインラインCSSを webui/css/ 配下へ分離 — 17ファイル（admin / archive / chat / compare / download / future / guide / header / index / info / logs / rss / status / subtitle-compare / test / twitter-media / wave）の <style> を個別CSSファイルに移設し、<link> 読み込みへ一本化（PHPページは filemtime キャッシュバスター付き）。HTML/CSS/PHPの混在を解消してスタイル管理を一元化。compare.html は自動生成のため生成元 scripts/render-compare-html.js も同時に更新",
                "インラインJSを webui/js/ 配下へ分離 — ページ固有のインライン<script>を22ファイルに移設（admin-dashboard / header-auth / twitter-media-dashboard / rss-reader / index-dashboard / index-history-tabs / index-activities / intent-redirect / logs-load-more / status-page / subtitle-compare-toggle / test-notification-anim / test-webgl / log-settings-toggle / page-fade-sw / test-oshidays / wave-log-settings / wave-oshidays / wave-page-fade / wave-layout / wave-pixi / compare-filter）。test.php 内の重複2対（L407=L616, L427=L726）は同一ファイルを共有。PHPページは filemtime、静的HTMLは ?v=20260921 のキャッシュバスター付き。CSP（script-src 'self'）と整合し、インラインブロックによるブロック問題も解消。JSON-LD（構造化データ）はデータのため意図的にインライン維持。compare.html は生成元 scripts/render-compare-html.js も更新",
            ],
            "fix" => [
                "配信アーカイブ検索で、ページ移動やカード再構築後に字幕要約／チャプターのバッジが消える問題を修正（badgeRendered フラグのリセットとキャッシュからの即再描画）",
                "管理画面「アーカイブ管理」で「もっと読み込む」時にカテゴリ表示が「-」に戻る問題を修正（カテゴリ表示を catCache で保持し再描画時も復元）",
                "管理画面のJSをキャッシュバスター付き参照に変更（/js/ は 1年 immutable のため ?v= で即反映）、公開アーカイブのJSはビルドして filemtime ベースで自動更新されることを確認",
                "YouTube検知の冗長化 — PubSubHubbub（Webhook）障害で配信枠・配信開始の通知が届かなくなる問題の対策として、RSSフィード（無料）＋videos APIバッチ（1コール=1unit）による5分間隔のフォールバックスキャンを youtube.js に実装。ライブ中検知で【ライブ】通知、予定枠（published90分以内）で【予定】通知。sent_records の plannedSent/liveSent をwebhookと共有するため重複通知なし。既知の問題ページも「対策実装済み」に更新",
                "CSS分離時の <link> タグ生成に閉じ引用符欠落のバグ — \$extraHead 系9ページ（archive / download / future / guide / index / info / logs / status / twitter-media）で href=\"/css/X.css?v=…\" の末尾二重引用符を付け忘れており、HTMLの属性値解析が後続タグまで巻き込んでページ固有CSSが全く読み込まれずレイアウトが崩れていた問題を修正（\" /> に統一）",
            ],
        ],
        "lines" => "34,970",
    ],

    [
        "date" => "2026-09-20",
        "details" => [
            "add" => [
                "配信アーカイブの管理機能を、管理画面「アーカイブ管理」に追加（準備完了） — 動画カテゴリの編集・YTから削除された動画の登録（公開検索から除外し、AI・要約生成のみに利用）。管理APIは nassy 側 api.py の管理者拡張（docs/ARCHIVE-ADMIN-SPEC.md）の実装待ちで、実装後に .env の ARCHIVE_ADMIN_TOKEN を設定すると有効化されます",
                "staging（テスト）環境を構築 — 本番と同じホストに git worktree（/home/yuzuki/mai-push-test）で分離し、専用DB（data-test.db）・実push抑止（DISABLE_NOTIFICATIONS=1）・定期タスク停止（NODE_ENV=development）を実現。専用URL https://mai-test.honna-yuzuki.com/ でログインゲート付き公開",
                "開発フロー用スクリプト scripts/deploy-staging.sh / scripts/promote.sh を追加 — ブランチをstagingへデプロイして自動smoke、問題なければmainへfast-forward昇格する運用を確立（詳細は DEVELOPMENT-WORKFLOW.md に記載）",
            ],
            "change" => [
                "アーカイブAPIのレートリミットを調整 — /api/ 全体の上限を150回/分から300回/分に緩和し、/api/archive/* は専用400回/分に分離（配信アーカイブ検索の1画面表示が約40リクエストで、ページ送りや検索を数回すると429「Too many API requests」になっていた問題を解消）",
                "AI（まいAIチャット）と要約生成（minutes-gen）が、YTから削除された動画も参照できるよう include_deleted=1 を渡すようにした（公開の配信アーカイブ検索には影響なし）",
            ],
            "fix" => [
                "GitHub公開リポジトリの履歴に混入していた Twitch認証情報（Client Secret / App Access Token）と Discord Webhook URL を全履歴から除去 — git-filter-repo でrewriteしforce push（SHA変更済み）。認証情報は全て再発行済み（旧値は無効化）。残存しないことを全コミットで検証済み",
            ],
        ],
        "lines" => "31,976",
    ],

    [
        "date" => "2026-09-19",
        "details" => [
            "add" => [
                "管理者パスキー（WebAuthn）認証を追加 — Windows Hello / TouchID / セキュリティキーでパスワードなしログイン。登録はログイン状態の管理画面「セキュリティ (パスキー)」から行い、ログイン画面に「パスキーでログイン」ボタンを表示（@simplewebauthn/server）",
                "AIまいちゃんのチャットに会話セッション機能を追加（ChatGPT風） — 会話をセッション単位で data.db（chat_sessions / chat_messages）に保存し、サイドバーで履歴一覧・切替・削除が可能に。初回質問からタイトル自動生成、RAG回答の参照元も保存（/api/admin/chat/sessions 系APIを新設。セッションは管理者ユーザー別に分離し他人のセッションIDは403拒否）",
            ],
            "change" => [
                "管理者セッションをメモリMapから data.db（admin_sessions）永続化に移行 — pm2再起動でログアウトされなくなった。有効期限も1時間から30日スライド式に延長（DB書込は5分間隔にスロットル）",
                "mai-push-api の実行Nodeを v22.12.0 に固定（ecosystem.config.js に interpreter 指定＋pm2 save）— sharp@0.35 が Node 18 で起動クラッシュするため",
                "まいAIチャットUIをChatGPT風の全画面レイアウトに刷新 — 画面全域を使い、メッセージ列・入力欄だけを見やすい幅（820px）で中央寄せ。モバイルはサイドバーがスライド表示に",
                "全サイトのハンバーガーメニューをFont Awesomeアイコン＋3グループ（コンテンツ／情報／サポート）で整理し、「このサービスについて」を削除",
            ],
            "fix" => [
                "sharp の Linux バインディング（@img/sharp-linux-x64）欠落を修復 — APIサーバーの起動クラッシュループ（pm2再起動194→252回・全APIが503）を解消",
                "管理画面の認証チェックが未定義変数 token 参照で停止し、未ログイン時のログイン画面リダイレクトが動いていなかった問題を修正",
                "サーバーがHTMLエラーページを返した際に JSON.parse エラーで落ちていたのを「サーバーエラー (HTTP N)」表示に改善（ログイン・パスキー登録画面）",
                "CSP（script-src 'self'）によりまいAIチャットのインラインスクリプト全体がブラウザでブロックされて動作しない問題を修正 — 処理を外部ファイル webui/chat.js へ分離",
                "まいAIチャットの細かい修正 — 「＋新しいチャット」ボタンがサイドバーからはみ出す問題、未ログイン時のリダイレクト先が存在しないパス（/webui/admin/login）になっていた問題",
            ],
        ],
        "lines" => "29,663",
    ],

    [
        "date" => "2026-09-18",
        "details" => [
            "add" => [
                "配信の要約を自動生成する機能を追加 — YouTube字幕をチャンク分割し Cloudflare Workers AI（@cf/qwen/qwen3-30b-a3b-fp8）で要約を生成し video_minutes テーブルに保存。毎朝9:30に未処理分を自動処理する cron を追加（無料枠1日10,000 Neurons の範囲でチャンク数を自動調整し、枠が尽きれば翌日自動再開）",
                "要約をベクトルDBへ自動同期（services/minutes-sync.js）— AIまいちゃんの回答時に該当配信の要約を引用できるように。要約ヒットからは親字幕を引用（引用判定スコア0.58以上）",
                "非公開配信や字幕の長い動画にも対応できるようチャプター密度を配信時間から自動算出（min=span/360、max=span/240）",
            ],
            "change" => [
                "ツイート分析エンジンをローカルllama.cpp（gemma-4-E4B-it）から Gemini API（gemini-3.5-flash-lite）へ移行 — 不要になった llama-server（:8081）のメモリ常駐を廃止し約3.6GBのRAMを解放",
                "AIまいちゃんのチャット回答生成も Ollama から Gemini API へ移行（RAG_CHAT_PROVIDER=gemini）",
                "AIまいちゃんの口調を更新 — 一人称を「まい」に、挨拶は「こんまい！」。最近のツイートを口調の手本として参照し、似せた文体で返答",
                "質問から検索キーワードを意味拡張（LLM）し、ひらがな助詞・常用語のストップワード除去を追加して全文検索の盲点を補強",
                "チャットUIを刷新 — 再試行ボタン・履歴クリア・質問履歴（上矢印で復元・localStorage保存）を追加",
                "フッターの「Last updated」を updatelogs.php の最新日付から自動表示に変更。更新履歴の記述を webui/updatelogs.php に分離（logs.php から require）",
                "配信アーカイブページ（/archive）のSEO用セクションを整理し、index からの重複コンテンツを削減",
            ],
        ],
        "lines" => "28,182",
    ],

    [
        "date" => "2026-09-10",
        "details" => [
            "add" => [
                "配信アーカイブページ（/archive）のSEO対応 — H1化、検索エンジン向けに「カテゴリから探す」「最新の配信アーカイブ」をサーバーサイド描画（カテゴリURL対応）、CollectionPage/ItemList（VideoObject×12件）の構造化データを追加",
                "使い方・対応一覧ページを新設（/guide.php）— サービス概要・対応プラットフォーム・設定の3ステップ・FAQ（FAQPage構造化データ）を提供。SEO用の本文テキストは新規ページでまかなう方針（index.php は見た目維持のため非変更）",
                "ヘッダーナビに「使い方・対応一覧」リンクを追加、sitemap.xml を刷新（/archive・/guide.php・/twitter-media/ 等を追加し lastmod を更新）",
            ],
            "change" => [
                "robots meta を条件分岐化（\$robotsNoindex で noindex,follow に切替）。?q= 付き検索URLは noindex 化し canonical は /archive/ に集約",
            ],
            "fix" => [
                "全ページの空/欠落した <img alt> を修正 — フッターのプラットフォームアイコン・ヘッダーの通知トグル/アバター・アーカイブのサムネイル/立ち絵・メディア/次回予定サムネイル等に説明的な代替テキストを付与（Bingの画像Alt指摘13件対応）",
            ],
        ],
        "lines" => "27,168",
    ],

    [
        "date" => "2026-09-08",
        "details" => [
            "add" => [
                "カウントパネルに「付き合った記念日(8月17日)」を追加、周年記念の直後に配置",
                "お誕生日(1月7日)・周年記念(3月21日)・付き合った記念日(8月17日)のラベルに日付を併記",
            ],
            "fix" => [
                "カウントパネルのPC表示で項目数が奇数になりバランスが崩れる問題を修正 — デビュー行を全幅化し、お誕生日＋周年記念／付き合った記念日＋推してからをペアにして常に偶数で整列（スマホは従来通りの個別セル表示）",
                "スケジュールの重複埋め込みを修正 — YouTubeイベントのupsertで、配信が「予定」から「配信中」に遷移した後も既存の他プラットフォーム（Twitter等）の予定行を重複として統合するよう判定対象を拡大（重複INSERTを防止）",
            ],
            "change" => [
                "YouTube webhookのPubSubHubbub購読が切れると検知が遅れる問題を対策 — 購読リース期限(5日)より短い3日間隔で自動再購読するように変更（503等の一時失敗後も次の周期で自動回復）",
            ],
            "change" => [
                "コード行数の集計方法を cloc に変更（コメント・空行を除いた実コード行を採用）",
            ],
        ],
        "lines" => "26,689",
    ],

    [
        "date" => "2026-09-05",
        "details" => [
            "add" => [
                "配信アーカイブ検索ページを追加（/archive.php）— 動画一覧をカード表示（サムネイル/日付/タイトル/URL）、文字起こし・コメント・ライブチャットを全文検索（ひらがな正規化）、該当箇所のタイムスタンプ付きURLとハイライト表示、カテゴリ絞り込み・並び順・ページング対応",
                "年別流行語を統計パネルに追加（nassy字幕 TF-IDF + sudachipy）— 年別に特徴語上位100件を抽出、汎用語フィルタ・まいちゃん語彙保護、チャットとの整合性ブースト、特定配信に偏る語には代表動画タイトルを付与、10件表示＋「もっと見る」で100件まで展開",
                "アーカイブ検索のタイトル検索対応 — 動画タイトルも全文検索対象に含め、表記ゆれを吸収",
                "通知履歴に詳細統計を追加 — 月別/種別/曜日/時間帯グラフと年別集計、流行語セクションを追加",
            ],
            "fix" => [
                "api.py の /api/videos が常時500になる不具合を修正（stream_at → stream_at_jst）、サムネ・配信日などのメタ付与と内部パス除去",
                "buzzwords のキャッシュが top パラメータで切り詰められる不具合を修正（常に100件でキャッシュし要求件数はスライスで返却）、スレッドセーフ化（Already borrowed 対策）、チャットユーザー名の除外、長い複合語（ぽこあポケモン等）の保護とプレースホルダ修正",
                "GitHub Desktop の Fetch が無限ループする不具合を修正（origin を SSH → HTTPS に切り替え、known_hosts 追加）",
                "pull 時のコンフリクト解消（build.mjs の notification-stats / archive 併記、YADMAT~Z の phantom ファイル対応）",
                "アーカイブページのUI改善 — カードの高さ揃え、該当箇所の折りたたみ、クリック領域をサムネイルとURLに限定、ホバーアニメーションとサムネイル拡大、左右の立ち絵のパララックス調整",
            ],
        ],
        "lines" => "26,649",
    ],

    [
        "date" => "2026-08-06",
        "details" => [
            "fix" => [
                "Twitterスクレイパーのメモリリーク修正（page.on('request')リスナーの削除追加、再帰リトライ時のページクリーンアップ強化、HTTP Agentの再利用）",
                "discord-alert.jsのalertLimits Mapが無限に成長する問題を定期クリーンアップで修正",
                "スケジュール重複問題の修正（Gemma推定時刻とYouTube確定時刻が大きく異なる場合の重複検出を強化）",
                "FANBOX APIレスポンスの配列パス修正（body → body.posts）导致通知が一切送られていなかった問題を修正",
                "Twitterスクレイピング間隔を60秒→120秒に変更しレート制限対策",
                "管理者パネルにホームに戻るボタンを追加",
            ],
        ],
    ],
    [
        "date" => "2026-07-17",
        "details" => [
            "fix" => [
                "ツイートの挨拶語（「おはよう」等）がAI解析で配信の時間帯と誤検出され、実際には存在しない日（翌日扱い等）に予定が自動生成されてしまう不具合を修正",
                "スケジュールの重複判定が緩く、無関係なツイートの解析結果が既存の正しい予定を誤って上書きしてしまう不具合を修正",
                "スケジュール自動生成の基準時刻を「AI解析処理の実行時刻」から「ツイートの実投稿時刻」に変更し、処理の遅延による日付のズレを防止",
                "配信予定のURL・サムネイルがTwitter投稿のものになり配信自体の情報が表示されない事例を修正（該当予定をYouTubeの実URL・サムネイル・タイトルに更新）",
            ],
        ],
    ],
    [
        "date" => "2026-06-26",
        "details" => [
            "fix" => [
                "Androidアプリで通知履歴のリスト/ヒートマップタブが切り替えられない不具合を修正（カルーセルがタブ上に重なりタップを奪っていた問題。.log-section に z-index を設定して解決・アプリ再ビルド不要）",
                "曖昧な時間帯（「夜ごろ」等）のスケジュールで開始前アラームが誤発火する不具合を修正（time_period 指定時は時刻ベース通知を生成しないよう scheduler.js を変更）",
                "YouTubeコミュニティ投稿が通知されない不具合を修正（ytcommunity.init() が2回呼ばれて notifyFn が上書き消去されていた問題。マージ方式に変更）",
            ],
        ],
    ],
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
];
?>
