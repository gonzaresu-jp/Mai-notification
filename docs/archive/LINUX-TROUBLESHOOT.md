# Linux環境での Ollama 接続トラブルシューティング

## 問題

```
❌ Ollama: 接続エラー - network timeout at: http://localhost:11434/api/generate
```

## 原因分析

Ollama `ps` では表示されているが、APIエンドポイントに接続できない場合、以下の可能性があります：

### 1. Ollama API サーバーが完全に起動していない
- `ollama run` コマンドでモデルをロードした直後は、APIサーバーの初期化に時間がかかる場合があります
- Gemma4は3.5GB のモデルで、初期化に**5～30秒**要する場合があります

### 2. ネットワークバインディングの問題（Linux特有）
- Ollama がデフォルトで `127.0.0.1:11434` にバインドされており、`localhost` で接続できない場合
- または IPv6 のみでリッスンしている場合

### 3. ファイアウォール / SELinux の干渉
- SELinux が有効な場合、ポート接続がブロックされる可能性

---

## 解決手順

### ステップ1: Ollama APIサーバーの状態確認

```bash
# モデル確認
ollama ps

# 期待される出力例
# NAME                               ID              SIZE      PROCESSOR    CONTEXT    UNTIL
# yinw1590/gemma4-e2b-text:latest    294ed29167a6    3.5 GB    100% CPU     4096       4 minutes from now
```

**モデルが表示されている** = プロセスは起動している

### ステップ2: APIサーバーの応答確認

```bash
# タイムアウト長めで接続確認
curl -v http://127.0.0.1:11434/api/tags --max-time 30

# または
curl -s -X GET http://localhost:11434/api/tags | jq .
```

**応答例:**
```json
{
  "models": [
    {
      "name": "yinw1590/gemma4-e2b-text:latest",
      "size": 3665527296,
      ...
    }
  ]
}
```

### ステップ3: ポートバインディング確認

```bash
# netstat で確認
netstat -tlnp | grep 11434

# または ss コマンド
ss -tlnp | grep 11434

# 期待される出力例
# tcp  0  0  127.0.0.1:11434  0.0.0.0:*  LISTEN  12345/ollama
```

### ステップ4: Bash スクリプトで確認（推奨）

以下をターミナルに貼り付けて実行：

```bash
#!/bin/bash

echo "=== Ollama 診断スクリプト ==="
echo ""

# 1. プロセス確認
echo "[1] Ollama プロセス確認"
if ollama ps >/dev/null 2>&1; then
  echo "  ✅ プロセス: 起動中"
  ollama ps | tail -n+2 | while read line; do
    echo "     $line"
  done
else
  echo "  ❌ プロセス: 起動していない"
  exit 1
fi
echo ""

# 2. ポート確認
echo "[2] ポート:11434 確認"
if nc -z -w 2 127.0.0.1 11434 >/dev/null 2>&1; then
  echo "  ✅ ポート: リッスン中"
else
  echo "  ⚠️  ポート: 応答なし（APIサーバーがまだ初期化中の可能性）"
fi
echo ""

# 3. API 応答確認（タイムアウト長め）
echo "[3] API 応答確認（最大30秒待機）"
if timeout 30 curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "  ✅ API: 応答中"
  echo "  ロード済みモデル:"
  curl -s http://127.0.0.1:11434/api/tags | jq -r '.models[] | "    - \(.name)"' || echo "    (不明)"
else
  echo "  ❌ API: タイムアウト（初期化中の可能性）"
  echo "  → 30秒待機してから再度テストしてください"
fi
echo ""

echo "診断完了"
```

### ステップ5: Ollama の再起動

#### パターンA: バックグラウンドで実行

```bash
# 既存プロセスを停止
killall ollama

# 再度起動（バックグラウンド）
nohup ollama serve > /tmp/ollama.log 2>&1 &

# ログ確認
tail -f /tmp/ollama.log
```

#### パターンB: screen/tmux で実行（推奨）

```bash
# screen の場合
screen -S ollama -d -m ollama serve
screen -r ollama  # ウィンドウに接続

# tmux の場合
tmux new-session -d -s ollama ollama serve
tmux attach -t ollama
```

---

## 改善されたコード

### gemma-analyzer.js の変更

| 項目 | コンピ対応 | 変更前 | 変更後 |
|-----|---------|-------|-------|
| タイムアウト | 増強 | 30秒 | 120秒 |
| リトライ回数 | 初回 | 2回 | 5回 |
| リトライ回数 | 通常 | 2回 | 3回 |
| バックオフ | 固定 | 500ms×2^n | 1000ms×1.5^n |
| 初期化判定 | 追加 | なし | 初回数回は待機 |

### テストスクリプト改善

- `/api/tags` エンドポイントで接続確認（API全般の健全性確認）
- 詳細なエラーメッセージと設定ガイドを表示
- Linux/macOS/Windows の設定手順を区分

---

## Node.js テスト再実行

```bash
# オブザーバー起動確認後に実行
node test-gemma.js

# または、詳細ログ付きで実行
DEBUG=* node test-gemma.js

# あるいは、一度だけ分析テストする
node -e "const g = require('./gemma-analyzer'); g.analyzeTweet('テスト').then(r => console.log(JSON.stringify(r, null, 2)))"
```

---

## 高度なトラブルシューティング

### Q1: SELinux が干渉している（CentOS/RHEL）

```bash
# SELinux ステータス確認
getenforce

# 一時的に無効化
setenforce 0

# 永続的に無効化（再起動が必要）
sudo sed -i 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config
```

### Q2: Ollama が IPv6 でのみバインドしている

```bash
# 環境変数で強制
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

### Q3: 他のプロセスがポート 11434 を使用している

```bash
lsof -i :11434
kill -9 <PID>
```

---

## 性能が遅い場合

### GPU 有効化確認

```bash
# GPU 利用状況確認
nvidia-smi  # NVIDIA GPU の場合
rocm-smi    # AMD GPU の場合

# Ollama がGPUを使っているか確認
ollama ps -v
```

### メモリ確認

```bash
free -h
```

Gemma4 は 3.5GB メモリを使用するため、システムメモリが 8GB 以上必要です。

---

## 正常な状態の目安

✅ 正常な場合：
```
yuzuki@elza:~$ ollama ps
NAME                               ID              SIZE      PROCESSOR    CONTEXT    UNTIL
yinw1590/gemma4-e2b-text:latest    294ed29167a6    3.5 GB    100% CPU     4096       4 minutes from now

yuzuki@elza:~$ node test-gemma.js
✅ Ollama: 接続OK

[テスト] Ollamaへの接続を確認中...
✅ 分析結果: { category: "LIVE", status: "LIVE_SOON", start_time: "22:00", ... }
```

---

## サポート情報

- Ollama 公式: https://ollama.ai
- Gemma モデル: https://ollama.ai/library/gemma4
- 本プロジェクト: q:/mai-push/GEMMA-QUICKSTART.md
