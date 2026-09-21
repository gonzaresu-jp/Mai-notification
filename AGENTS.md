# AGENTS.md — AIエージェント向け 運用安全規則（mai-push）

このリポジトリで作業するAI/エージェントは**必ず本ファイルを読むこと**。
過去に複数回の重大事故が確認されている（2026-09-21〜22）。

## 1. ポート位相（最重要・間違えやすい）
- **本番API = PORT 8080**（pm2: `mai-push-api`, `/var/www/html/mai-push/server.js`）
- **staging API = PORT 8081**（pm2: `mai-push-api-test`, `/home/yuzuki/mai-push-test/server.js`, NODE_ENV=development）
- **本番ワーカー = `mai-push-worker`**（pm2, `/var/www/html/mai-push/main.js`、Webhook 3001）
- `curl localhost:8081` は**staging**である。本番検証を 8081 で行うと**stagingの旧コードを本番と誤認**する（実際に起きた）。
- 検証前に必ず `ss -ltnp | grep -E '8080|8081'` と `pm2 pid` で**ポートの実所有者PID→パス**を確認してから叩け。

## 2. 通知API（/api/notify）— 本番で実送テスト禁止
- **本番(8080)への POST /api/notify は実ユーザーにpushが届く**（web push + FCM）。テスト送信による誤爆が実際に発生した。取り消し不能。
- 通知の動作確認は **必ず staging(8081)** で行うこと。staging `.env` は `DISABLE_NOTIFICATIONS=1` 固定（実送抑止・履歴のみ）。**この設定を1に戻すな**。
- stagingで抑制確認済みのレスポンス: `{"success":true,"suppressed":true,...}` が返れば auth 経路は正常。

## 3. 認証仕様（2026-09 codex セキュリティ改修後）
- `/api/notify` ヘッダ: `x-notify-token: $NOTIFY_API_TOKEN` + `x-notify-hmac: HMAC-SHA256 hex of JSON.stringify(body)`（compact JSONをそのまま送れば一致する）
- env 3値は**環境ごとに別々のランダム値**を `.env` に設定（コミット対象外・`.env` は gitignore）: `NOTIFY_API_TOKEN` / `NOTIFY_HMAC_SECRET` / `INTERNAL_API_TOKEN`。未設定時 `/api/notify` は **503**。
- `ADMIN_NOTIFY_TOKEN` は通知/内部APIでは**もう使われない**（管理者専用）。
- OAuth: `state` はランダム単発5分失効（`/auth/token-exchange` で60秒単発code→JWT交換）。**stateやJWTがURLに平文で残らない**。
- HMAC比較は `crypto.timingSafeEqual` 使用。自前で `===` 比較に戻すな。

## 4. ワーカー二重起動防止（StartGuard）
- `main.js` は `[StartGuard]` プロセスロック（`/tmp` 等、`NODE_ENV` で test/prod 分離）を持つ。
- **pm2稼働中に手で `node main.js` を起動するとロックで拒否される**（仕様）。検証で二重起動させるな。

## 5. 依存関係
- 残存脆弱性 **critical 1（sqlite3 経由の tar）/ high 9**。
- **`npm audit fix --force`（sqlite3@6 破壊的更新）は回帰テスト整備完了まで禁止**。
- `package-lock.json` は Git 管理対象。除外するな。

## 6. 検証の作法
- 変更後は `node --check <file>` → pm2 再起動（`--update-env`）→ **正しいポート**で `/api/health`。
- 本番 pm2 再起動は作業者の明示承認後にのみ実施。
- DB・history.json を触るテストは本番でやるな。staging でやれ。

最終更新: 2026-09-22（実事故ベース）
