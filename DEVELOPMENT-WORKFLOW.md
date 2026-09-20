# 開発フロー（staging / 本番）

1台のサーバー（elza）上に本番とテスト（staging）を同居させた運用フローのメモ。

## 環境の関係

| | 本番 | staging（テスト） |
|---|---|---|
| コード | `/var/www/html/mai-push`（branch: main） | `/home/yuzuki/mai-push-test`（git worktree・branch: staging） |
| API ポート | `http://localhost:8080` | `http://localhost:8081` |
| DB | `data.db` | `data-test.db`（本番のスナップショット） |
| NODE_ENV | production | development（定期タスク・ベクトル同期・マイルストーン停止） |
| 通知 | 通常動作 | `DISABLE_NOTIFICATIONS=1` で**実push完全抑止** |
| URL | https://mai.honna-yuzuki.com | https://mai-test.honna-yuzuki.com（ログインゲート付き） |
| pm2 | mai-push-api / mai-push-worker / discord-bot | mai-push-api-test（+ mai-push-worker-test は必要時のみ） |

- staging の `node_modules` / `.env` / `vapid.json` 等は本番へのシンボリックリンク（コード差分だけをテストしたいため）
- どちらも同じ `.env` を参照するので、接続先設定・Webhook 等の「環境差」は増やさない方針
- アーカイブ検索APIは別ホスト `192.168.1.70:8766`（api.py）を経由（どちらの環境からも同一）

## 基本フロー（trunk-based）

```
feature/xxx で開発
   ↓
bash scripts/deploy-staging.sh feature/xxx      … stagingに展開 + smoke 自動実行
  （ブラウザで https://mai-test.honna-yuzuki.com を目視確認）
   ↓
git push origin feature/xxx                     … staging で検証したリビジョンを共有
bash scripts/promote.sh feature/xxx --sync-staging … 本番へ ff 昇格 + 本番smoke + staging追従
```

### deploy-staging.sh

```
bash scripts/deploy-staging.sh <branch> [--worker] [--sync-db] [--dry-run]
```

- `<branch>`：デプロイするブランチ（main / feature/xxx。origin に存在していること）
- `--worker`：テスト用 worker（スクレイパー）も起動
- `--sync-db`：先に本番 `data.db` → `data-test.db` スナップショット
- `--dry-run`：手順だけ表示
- 実行後、API（:8081）の smoke（health / archive stats / videos / search）を自動実行。失敗時は exit 1

### promote.sh

```
bash scripts/promote.sh <branch> [--sync-staging] [--no-restart] [--dry-run]
```

- **fast-forward 可能な場合のみ** 昇格。staging で検証したコミットと同一ツリーを本番で動かす
- `--sync-staging`：昇格後に staging を新しい main へ追従
- `--no-restart`：本番プロセスの再起動をスキップ
- `--dry-run`：手順だけ表示
- 本番リポジトリに**未コミット変更があると中止**します（先に commit / stash する）
- ff できない（本番 main が進んでいる）場合も中止し、`<branch>` の rebase → staging 再検証を促す

### promote 後の自動処理

1. 本番 pm2 全再起動（`bash scripts/restart.sh all`）
2. 本番 API（:8080）の smoke（health / archive stats / videos / search）
3. （--sync-staging 時）`deploy-staging.sh main` で staging を最新化

## 運用ルール

1. **本番の pull / 昇格は必ず `--ff-only`**（commitを落とさない）
2. **staging の DB はスナップショット運用**：`bash scripts/sync-test-db.sh`
   - staging API 起動中の同期はロック競合の恐れがあるため `pm2 stop mai-push-api-test` してから実行が安全
3. **テスト通知（実機への push）は禁止**。staging は DISABLE_NOTIFICATIONS=1 だが、DB に直接書いたテスト行は本番に同期しないこと
4. 環境差を `.env` に増やさない（`NODE_ENV` とプロセス引数で吸収）
5. sudo が必要な作業（nginx / cloudflared の設定反映）はエージェント不可 → 手動で行う
   - nginx: `sudo cp /home/yuzuki/mai-push-test/scripts/nginx/mai-test.conf /etc/nginx/mai-test.conf && sudo nginx -t && sudo systemctl reload nginx`
   - cloudflared: config.yml はリモート管理のためダッシュボードの Public Hostname で変更

## セキュリティ履歴（2026-09-20 実施）

- GitHub公開リポジトリの履歴に Twitch Client Secret / App Access Token / Discord Webhook URL が混入していたため：
  1. 認証情報を `.env` へ移動（community化対応：ecosystem.config.js / healthcheck.sh 直書きを排除）
  2. Twitch Client Secret・App Access Token・Discord Bot Token を再発行（旧値は無効化済み）
  3. `git-filter-repo` で全履歴から旧値を除去し force push（SHA変更済み）
- 作業フォルダ／本番／staging とも `git reset --hard origin/main` 済み
- 履歴の空き blobs はローカル `git gc --prune=now` で消去済み

## ロールバック

```bash
git log --oneline -10 main            # 戻り先の commit を確認
git reset --hard <commit> && git push --force origin main   # ※force push は慎重に
```

または promote 直後なら `git revert` で新しい commit を積んでから通常 push。