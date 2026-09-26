# まいのお知らせWeb通知サービス — システム構成

## 概要
「恋乃夜まい」の配信情報を自動収集し、Web Push / FCM / ダイアログでユーザーに通知するプラットフォーム。
二台構成（`.72` Web/API + `.70` アーカイブDB）で稼働。

---

## サーバー構成

| サーバー | IP | 役割 |
|---|---|---|
| `.72` | 192.168.1.72 | Web サーバー / API サーバー / Worker（スクレイパー） |
| `.70` | 192.168.1.70 | アーカイブ DB (SQLite 1.6GB) / サムネイル / Python API |

### ネットワーク経路
```
外部(mai.honna-yuzuki.com) → cloudflared → nginx:1700 → Express:8080
                                              ↓
                                   内部:192.168.1.70:8766 (archive API)
```

---

## プロセス構成（`.72`）

| プロセス | エントリ | ポート | PM2名 |
|---|---|---|---|
| API サーバー | `server.js` | 8080 | `mai-push-api` |
| Worker（スクレイパー） | `main.js` | 3002 (内部), 3001 (YT Webhook) | `mai-push-worker` |
| Discord Bot | `discord-bot.js` | - | `discord-bot` |

PM2設定: `ecosystem.config.js`
- `mai-push-api`: max_memory 1G, NODE_ENV production
- `mai-push-worker`: max_memory 2G, NOTIFY_API_URL → localhost:8080/api/notify

---

## データベース（`.72`）

| DBファイル | 用途 |
|---|---|
| `data.db` (WAL) | メイン: subscriptions, notifications, events, scheduled_notifications, scraper_status, video_transcripts, yearly_buzzwords, vector_sync_state |
| `pushweb.db` | プッシュ配信管理 |
| `maipush.db` | ユーザー管理 |

### 主要テーブル
- `notifications` — 通知ログ (id, title, body, url, icon, platform, status, tweet_id, image)
- `subscriptions` — Web Push 購読者 (client_id, endpoint UNIQUE, settings_json)
- `android_devices` — FCM デバイス (fcm_token UNIQUE)
- `events` — 配信スケジュール (title, start_time, end_time, platform, confirmed)
- `scheduled_notifications` — 送信待ち通知キュー (run_at, payload_json, sent, kind)
- `scraper_status` — 各スクレイパーの最終実行状態
- `video_transcripts` — 文字起こしキャッシュ
- `yearly_buzzwords` — 年別流行語キャッシュ
- `user_schedules` — ユーザー個別スケジュール設定
- `user_subscriptions` — ユーザーとデバイスの紐づけ

---

## フロントエンド（`.72`）

PHP/HTML SPA（`webui/`）。Expressが静的ファイルとして配信。

| ファイル | 機能 |
|---|---|
| `index.php` | メインダッシュボード（通知履歴、スケジュール） |
| `archive.php` | 配信アーカイブ検索ページ |
| `status.php` | 各スクレイパーのステータス |
| `admin.html` | 管理者パネル |
| `chat.html` | チャット（RAG） |
| `rss.html` | RSSフィード |
| `twitter-media.php` | Twitter画像メディア表示 |

クライアントJS: `js/main.js`（プッシュ登録、通知履歴取得）、`js/notification-stats.js`（統計パネル）、`js/archive.js`（アーカイブ検索）

---

## ルート（`routes/`）

| ルーティング | 主要エンドポイント |
|---|---|
| `notify.js` | `POST /api/notify` — 通知受信・配信（HMAC認証） |
| `subscriptions.js` | `POST/GET/PATCH/DELETE /api/*-platform-settings` — ユーザー設定 |
| `events.js` | `GET/POST/PUT/DELETE /api/events`, `/api/admin/events` — スケジュール管理 |
| `admin.js` | `POST /api/admin/login`, `POST /api/admin/notify` — 管理者操作 |
| `archive.js` | `GET /api/archive/*` — .70:8766へのプロキシ（LRUキャッシュ5分） |
| `rag.js` | `GET /api/search`, `POST /api/ask` — RAG検索/チャット |
| `system.js` | `GET /api/system-info` — CPU/メモリ情報 |
| `history.js` | `GET /api/history` — 通知履歴（ページング） |
| `scraper-status.js` | `GET /api/scraper-status` — スクレイパー状態一覧 |

---

## サービスモジュール（`services/`）

| モジュール | 役割 |
|---|---|
| `context.js` | シングルトンコンテキスト（app, db, sseClients, vapidConfig等） |
| `database.js` | DB初期化、テーブル作成、マイグレーション |
| `notification.js` | Web Push / FCM 送信、管理通知ハンドリング |
| `scheduler.js` | イベントスケジュール通知（30分前、開始時）、定期タスク |
| `sse.js` | Server-Sent Events（リアルタイム更新） |
| `history.js` | `history.json` 生成（直近50件、5秒デバウンス） |
| `embeddings.js` | ローカルLLMエンドポイント `:8082/v1/embeddings` |
| `vectordb.js` | Qdrant `:6333` or simple バックエンド |
| `vector-sync.js` | notifications/events/knowledge → ベクトルDB同期（5分） |
| `system-cpu.js` | CPU使用率監視 |

---

## スクレイパー（`main.js` 内）

| プラットフォーム | モジュール | 取得方法 |
|---|---|---|
| YouTube | `youtube.js` | Webhook (PubSubHubbub) + ポーリング |
| YouTube コミュニティ | `ytcommunity.js` | 5分ポーリング |
| ツイキャス | `twitcasting.js` | API + 5秒監視 |
| Twitter/X | `twitter.js` | ポーリング（120秒） |
| FANBOX | `fanbox.js` | 60秒ポーリング |
| Twitch | `twitch.js` | 2秒ポーリング |
| Bilibili Live | `bilibili-live.js` | Webhook (設定時) |
| Bilibili Dynamic | `bilibili-dynamic.js` | Cookie設定時 |
| GIPT | `gipt.js` | 配信通知 |
| マイルストーン | `MilestoneScheduler` | 定期確認 |

スクレイパー → `http://localhost:8080/api/notify` (HMAC + token認証) で通知送信。

---

## 通知フロー

```
スクレイパー → notifyFn → localhost:8080/api/notify
  → HMAC検証 → 重複チェック (60秒ウィンドウ)
  → INSERT notifications → SSE broadcast (history-updated)
  → history.json更新 (5秒デバウンス)
  → subscriptions + android_devices にプッシュ配信
    → settings_json のプラットフォーム設定で配信可否判定
    → web-push / FCM で送信
    → 410/404 → サブスク削除
```

---

## 予約通知フロー

```
管理者 → POST /api/admin/events (CRUD)
  → syncEventNotifications (60秒毎) → scheduled_notifications にキュー投入
  → dispatchDueEventNotifications (30秒毎)
    → due行を atomic に取得 → handleAdminNotify → プッシュ配信

ユーザー → user_schedules (設定)
  → sendUserScheduleReminders (30秒毎)
    → リマインダー時刻到達 → ユーザー別ターゲットプッシュ
```

---

## RAG / ベクトル検索

```
定期同期 (5分):
  notifications → embeddings (8082 multilingual-e5-small) → vectordb (qdrant:6333)
  events → 同上
  knowledge.json → 同上

検索:
  GET /api/search?q → embed query → vectordb search → 結果返却

チャット:
  POST /api/ask {question}
    → embed query → vectordb search
    + DBから今後のイベント取得
    + 通知ログから時系列コンテキスト
    + knowledge テキスト
    → Gemma (8081) にプロンプト送信 → 回答
```

---

## アーカイブシステム（`.70`）

### データベース
- `archive.db` (SQLite 1.6GB) — 配信動画メタ、文字起こし、コメント、チャットログ
- `v_catalog` ビュー — 動画一覧 (stream_at_jst, video_id, title, category等)

### サービス（`.70`）

| ポート | ファイル | 役割 |
|---|---|---|
| 8766 | `api.py` (423行) | アーカイブ REST API (検索/動画/サムネイル/統計) |
| 8765 | `search.py --serve` | テキスト検索 (別途) |

### プロキシフロー（`.72` → `.70`）
```
ユーザー → GET /api/archive/search?q=...
  → routes/archive.js
    → LRU キャッシュ確認 (5分TTL, 300エントリ)
    → proxyJson → http://192.168.1.70:8766/api/search?q=... (JSON 12秒 / 検索25秒)
    → キャッシュ保存 → レスポンス返却
```

### 流行語（TF-IDF）
- `buzzwords.py` (524行) — sudachipy トークナイズ + TF-IDF スコアリング
- チャットコーパス統合（チャットスコアを最大1.8倍ブースト）
- 保護語（スンスン、ぽこあ等）→ プレースホルダ置換で分割防止
- キャッシュ: `buzzwords_cache.json` (6時間TTL, top=100固定)
- スレッドセーフ (threading.Lock)

---

## 認証・セキュリティ

| 手段 | 詳細 |
|---|---|
| HMAC署名 | スクレイパー通知: `X-Signature` header (SHA-256) |
| Token認証 | `ADMIN_NOTIFY_TOKEN` — 管理通知API |
| 管理者ログイン | `admin/admin` bcrypt, session cookie |
| Rate Limiting | `authLimiter 20/min`, `apiLimiter 150/min`, `notifyLimiter 30/min` |
| CSP | `helmet` — `frame-ancestors 'none'`, HSTS 2年 |
| CORS | `*` (API), 管理APIはsession-based |
| サムネイル | video_id 11文字正規表現バリデーション |

---

## デプロイ

| 項目 | 詳細 |
|---|---|
| Git | `https://github.com/gonzaresu-jp/Mai-notification.git` |
| ブランチ | `main` (push: SSH, fetch: HTTPS) |
| ビルド | `npm run build` → `build.mjs` (esbuild) |
| PM2 | `pm2 start ecosystem.config.js` |
| 環境変数 | `.env` (PORT, TZ, PUBLIC_URL, 通知設定, 各APIキー) |
| VAPID | `vapid.json` (Web Push 公開鍵/秘密鍵) |
| 本番パス | `/var/www/html/mai-push` |

### 依存先（`.70`）
- Python + sudachipy, flask/外部依存なし（標準ライブラリのみ）
- systemd --user: `koinoyamai-api.service` → `api.py :8766`

---

## 主要な依存ライブラリ

| ライブラリ | 用途 |
|---|---|
| express 5.1 | Web フレームワーク |
| web-push | Web Push 通知 |
| firebase-admin 12.7 | FCM 通知 |
| sqlite3 | データベース |
| puppeteer | YouTubeスクレイピング |
| discord.js 14.26 | Discord Bot |
| helmet | セキュリティヘッダー |
| express-rate-limit | レートリミット |
| node-cron | 定期タスク |
| cheerio | HTMLパース |
| googleapis | YouTube Data API |
| sharp | 画像処理 |
| jsonwebtoken | JWT認証 |
| bcrypt | パスワードハッシュ |
| esbuild | フロントエンドバンドル |

---

## コード行数カウント方法

ログ (`webui/logs.php` の各エントリ `"lines"`) に記載する行数は cloc で集計する。

```powershell
# リポジトリ直下で実行（.72 の実パス: \\192.168.1.72\html\mai-push）
cloc . --vcs=git `
  --exclude-dir="dist,node_modules,mai_notification,tmp,Windows,fontawesome,fontawesome-free-7.2.0-web" `
  --not-match-f="package-lock\.json|\.min\.(js|css)$|\.(webp|png|jpg|ico|woff2?|ttf|db|log|bak)$" `
  --include-lang="JavaScript,TypeScript,PHP,Python,CSS,HTML,JSON"
```

### 基準
- **集計値**: cloc の SUM の `code` 列（コメント・空行を除いた実コード行）
- **対象**: git 追跡ファイルのみ（`--vcs=git`）
- **除外**: `webui/dist/`（ビルド生成物）、`*.min.*`、`package-lock.json`、`node_modules/`、`mai_notification/`、`tmp/`、`Windows/`（Electron/dev 生成物）、`webui/fontawesome*`、画像（webp/png/jpg/ico/woff/ttf）、DB/ログ/バックアップ
- **対象言語**: JavaScript / TypeScript / PHP / Python / CSS / HTML / JSON
- 例: 2026-09-08 → `114 files, code 26,689`

> 参考: `2026-09-05` 以前のエントリは空行・コメントを含む物理行数の集計値（`count_lines.py` 方式）。

---

## 最終更新
- 2026-09-08: コード行数カウント方法（cloc）を追加
- 2026-09-07: システム構成文書作成
