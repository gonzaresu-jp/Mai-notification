# セキュリティ引き継ぎ・現状（SECURITY.md）

更新日: 2026-09-22（旧 SECURITY_HANDOFF.txt を検証結果込みで本ファイルへ移行・改善）
ブランチ: `feature/security-hardening-20260922`

## 最初に読むもの

- **AGENTS.md は必読。** ポート位相、通知テスト禁止、本番再起動の承認制、依存関係更新の禁止事項がある。
- 本番: `/var/www/html/mai-push`、API **8080**、pm2: `mai-push-api` / `mai-push-worker`
- staging: `/home/yuzuki/mai-push-test`、API **8081**、pm2: `mai-push-api-test`（`DISABLE_NOTIFICATIONS=1` 固定）
- コマンド実行前に必ず所有者確認:

```bash
ss -ltnp | grep -E ':8080|:8081'
pm2 pid mai-push-api; pm2 pid mai-push-api-test
readlink /proc/<pid>/cwd
```

2026-09-22 実測: 8080 = `/var/www/html/mai-push`（本番）、8081 = `/home/yuzuki/mai-push-test`（staging）。

## 反映済みの対策（検証済み）

- OAuth state はランダム・単発・5分失効。デスクトップのJWT受け渡しは60秒の単発code交換。
- `/api/notify` は `NOTIFY_API_TOKEN` と `NOTIFY_HMAC_SECRET` が未設定なら **503** で拒否。
- 秘密値の分離: `NOTIFY_API_TOKEN` / `NOTIFY_HMAC_SECRET` / `INTERNAL_API_TOKEN`。`ADMIN_NOTIFY_TOKEN` は通知/内部APIでは不使用。
- HMAC 比較は `crypto.timingSafeEqual`。
- Electron は `webSecurity=true`。OAuth callback はループバックのみ許可。
- CSRF Origin 判定は完全一致。DB/JSバックアップの誤コミット抑止済み。`package-lock.json` はGit管理。
- **nginx（2026-09-22 外部実測 404）**: `location ^~ /mai-push/ { deny all; }`、ドットファイル deny、
  `.env|.db|.bak|...` 拡張子 deny が有効 → `/backups/*.db`・`/.env`・`/data.db` はWeb非公開。
- **データ保護（2026-09-22 実施）**: 本番 `.env` を 600 へ、`backups/` を 750・中身 640 へ変更済み。
  ※ `backups/` は gitignore 済みだが **Web公開ツリー内（/var/www/html 配下）** にある。
  nginx の deny で守られているが、`backup.sh` の出力先を Web 外（例: `/var/lib/mai-push/backups`）へ移すのが望ましい。

## 2026-09-22 追加ハードニング（本ブランチ）

| 対象 | 変更 |
|---|---|
| `server.js`（SSE `/api/events/stream`） | 全体接続数上限 `SSE_MAX_CLIENTS`(既定500)・同一送信元上限 `SSE_MAX_PER_CLIENT`(既定5)・接続寿命 `SSE_MAX_AGE_MS`(既定30分)・`retry:` ヒント付与。超過は **429**。送信元キーは前段(nginx/cloudflared)経由のときだけ X-Forwarded-For 末尾を使い、直結では TCP ピア（XFF偽造対策） |
| `routes/notify.js` | トークン比較を `timingSafeEqual` 化 |
| `routes/scraper-status.js` | `POST /api/internal/scraper-status` を `NOTIFY_API_TOKEN` に統一・未設定時 **503**・timing-safe比較。旧実装は「トークン未設定なら認証なしで書込可」＋ADMINトークンを受入れていた |
| `services/context.js` | `LOCAL_API_TOKEN` の `ADMIN_NOTIFY_TOKEN` フォールバックを**廃止**（`POST /api/internal/scraper-status` の送信者はコード上存在せず、worker は直接DB更新のため影響なし確認済み） |
| `main.js` | ワーカー内 `/api/notify` のトークン比較を timing-safe 化 |
| `webui/js/rss-reader.js` | **XSS修正**: 外部RSSの title/desc/link/enclosure を未エスケープで innerHTML に流していた → エスケープ＋ `http(s):` URL検証＋ textContent 描画に変更 |
| `scripts/regression-test.js` | 新規。sqlite3@6 昇格前の回帰テスト（下記） |

**trust proxy の評価**: `app.set("trust proxy", 1)` は現行トポロジ（nginx 直結 `/api/` では XFF 未送出、
cloudflared 経由では `X-Real-IP`＋クラウドフレアが付与した XFF）で実クライアントIPを正しく取る。
nginx が `/api/` に XFF を送出しない限り、レート制限のキーは cloudflared 付与値（偽造不可）に依存する。
nginx 設定変更時は `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` を足す場合は要注意
（nginx 以降で信頼ホップ数の再調整が必要）。

## sqlite3@6 昇格の手順（回帰テストは完成済み）

現状 `npm audit --omit=dev`: critical 1（sqlite3@5 依存ツリーの tar）/ high 9 / total 21。
**`npm audit fix --force` をテストなしで実行しない（AGENTS.md）**

1. 本番 `data.db` と staging `data-test.db` を Web公開外・制限付きの場所へバックアップ。
2. ✅ 回帰テスト実装済み: `scripts/regression-test.js`
   （notifications / subscriptions / scraper_status の INSERT/SELECT/lastID・UPSERT、
   `/api/health`、notify: tokenなし401 / HMACなし401 / 誤HMAC 401 / 完全認証で `suppressed:true`、
   内部scraper-status認証、token-exchange 無効code 400、SSE 上限429）
3. staging だけで `sqlite3@6` を更新（`npm install sqlite3@6`）。
4. `node --check` → staging pm2 再起動 → **回帰テスト実行:**

```bash
node scripts/regression-test.js --port 18099
```

5. staging 8081 で smoke（health / scraper-status / events）＋ブラウザ目視。
6. 受入後、作業者が**本番反映と `--update-env` 再起動を明示承認**。
7. 本番 `/api/health` 200 確認後、10分間 pm2 ログと通知失敗を監視。

注意: 回帰テストは一時DBを自分で作るので本番DBを触らない。ただし**本番(8080)ツリーで実行しない**
（Web公開ディレクトリ内に一時DBを作るため。staging 作業ツリーで実行すること）。

## innerHTML 棚卸し（2026-09-22 実施・主要ファイル）

- ✅ **修正済み**: `webui/js/rss-reader.js`（外部RSS → XSS可だった）
- ✅ **問題なし（esc/escapeHtml + URL検証済み）**: `weekly-schedule.js`（escapeHtml + `toSafeHttpUrl` で
  thumbnail/url を検証、`encodeURIComponent` 経由で data属性）、`admin-ai.js`、`twitter-media-dashboard.js`
  （`file_url` はサーバー生成の `/api/twitter-media/file/:id` のみ、tweet_text は escapeHtml）
- ⚠️ **要改善（低〜中リスク）**:
  - `historyService.js` lightbox（710-717行）: `data-media-url` 属性値をそのまま src に展開。
    値は自画面でサーバーから受けたもの（DBの `local_path` 由来はサーバー側で `/file/:id` 化済み）だが、
    `toSafeHttpUrl` 相当の検証を足すとより堅い。
  - `heatmap.js` / `notification-stats.js`: data-date/data-count は自前生成の数値・日付でJS-XSS実質不可。
    テンプレ文字列の内側に来る将来の変更には注意。
  - `admin-*.js` / `status-page.js`: 管理者のみ閲覧・管理API由来。esc使用済みが大半。
    今後外部入力を扱う場合は escapeHtml 経由に統一。
- 運用ルール: 新規コードで外部/DB由来の文字列を innerHTML に入れない（textContent か escapeHtml）。

## 追加で残っているリスク

- [ ] `backup.sh` の出力先を Web公開ツリー外へ移す（nginx deny は現状有効だが単一防御点に依存）。
- [ ] SSE 429 時のクライアント挙動（EventSource 自動再接続）を実デバイスで一応確認。
- [ ] `services/context.js` の `LOCAL_API_TOKEN`（現環境変数 `LOCAL_API_TOKEN` のみ）を使う箇所が
      将来出たら、`NOTIFY_API_TOKEN` へ統一する。
- [ ] nginx `/api/` に将来 `X-Forwarded-For` を足す場合は trust proxy 設定を見直す（上記）。

## 補助ファイル

- `scripts/regression-test.js`: sqlite3@6 昇格ゲート用回帰テスト（`--port` で起動ポート指定）。
- staging `.env` は `DISABLE_NOTIFICATIONS=1` 固定。**この設定を 1 に戻すな**。
- `/tmp/verify_sec.sh`・`/tmp/ensure_env.js` は旧セッションの補助スクリプト。実行前に内容と対象ポートを確認。
