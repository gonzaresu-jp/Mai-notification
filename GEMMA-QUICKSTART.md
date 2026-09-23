# Gemma4 + Ollama連携 - 実行ガイド

## システム構成

```
      Twitter監視
         ↓
    twitter.js
         ↓
   新規ツイート検出
         ↓
Ollama (Gemma4 E2B)へ送信
         ↓
 gemma-analyzer.js
         ↓
JSON形式の分析結果
  (カテゴリ、時刻など)
         ↓
スケジュール自動作成
/api/internal/schedule/create
         ↓
  ユーザーに通知
  webui表示更新
```

---

## 環境準備

### ステップ1: Ollamaをインストール

**Windows:**
1. https://ollama.ai にアクセス
2. Windows版をダウンロード
3. インストーラーを実行

**macOS/Linux:**
```bash
curl https://ollama.ai/install.sh | sh
```

### ステップ2: Ollama サーバー起動

PowerShellまたはターミナルで：
```powershell
ollama serve
```

このコマンドは、http://localhost:11434 でサーバーを起動します。

### ステップ3: Gemma4モデルロード

**別ウィンドウ**でPowerShellを開き：
```powershell
ollama run yinw1590/gemma4-e2b-text --think=false
```

初回実行時はモデルをダウンロード（15GB程度、数分かかる場合があります）

---

## テスト実行

### テスト1: Gemma分析の動作確認

```bash
cd q:\mai-push
node test-gemma.js
```

**期待される出力:**
```
✅ Ollama: 接続OK

---
📝 テスト: 配信予告
📄 テキスト: 明日22時から配信開始します🔴
✅ 分析結果:
{
  "category": "LIVE",
  "status": "LIVE_SOON",
  "start_time": "22:00",
  ...
}
📅 スケジュール候補:
{
  "title": "🔴 配信",
  "scheduled_at": "2026-04-06T22:00:00.000Z",
  ...
}
```

### テスト2: サーバー起動して実際の監視

```bash
node main.js
```

ログで確認：
- `[Gemma] Analyzing tweet:` ← 分析開始
- `[Gemma] Analysis result:` ← 分析完了
- `✅ schedule created` ← スケジュール作成成功

---

## 実装済みコンポーネント

| ファイル | 説明 | 状態 |
|---------|-----|------|
| `gemma-analyzer.js` | Ollama連携モジュール | ✅ 実装済み |
| `twitter.js` | 分析統合 | ✅ 実装済み |
| `user-routes.js` | 内部API追加 | ✅ 実装済み |
| `test-gemma.js` | テストスクリプト | ✅ 実装済み |

---

## 環境変数設定（.env）

```env
# スケジュール作成用（既存の認証トークンを流用）
ADMIN_NOTIFY_TOKEN=your_existing_token

# オプション設定
SCHEDULE_USER_ID=1
ENABLE_SCHEDULE_AUTO_CREATE=true

# Ollama設定（以下はデフォルト値、通常は設定不要）
OLLAMA_ENDPOINT=http://localhost:11434/api/generate
OLLAMA_MODEL=yinw1590/gemma4-e2b-text
```

---

## 分析フロー例

### 例1: 配信予告ツイート

**入力:**
```
恋乃夜まい５周年は明日！💗
３月２１日２２時から！💗
```

**分析結果:**
```json
{
  "category": "LIVE",
  "status": "LIVE_SOON",
  "start_time": "22:00",
  "sentiment": "POSITIVE",
  "confidence": 0.95
}
```

**自動作成スケジュール:**
```
タイトル: 🔴 配信
時刻: 2026-03-21 22:00
出典: ツイート via Gemma分析
```

### 例2: 通常ツイート（スケジュール作成なし）

**入力:**
```
おはよう〜！今日も応援よろしく✌️
```

**分析結果:**
```json
{
  "category": "MORNING",
  "status": "NONE",
  "start_time": null,
  "sentiment": "POSITIVE",
  "confidence": 0.9
}
```

**スケジュール作成: ❌ スキップ**

---

## トラブルシューティング

### Q1: 「モデルが見つかりません」

ollama run コマンドラインで再度実行してください：
```powershell
ollama run yinw1590/gemma4-e2b-text --think=false
```

### Q2: テスト実行時に "接続エラー"

1. Ollama サーバーが起動しているか確認:
   ```powershell
   Get-Process | Where-Object {$_.Name -like "*ollama*"}
   ```

2. ポート 11434 が使用可能か確認:
   ```powershell
   netstat -ano | findstr ":11434"
   ```

### Q3: 分析が遅い

- Gemma4モデルは5~10秒/ツイートが標準
- GPU搭載PCなら約2~3秒/ツイート
- `--think=false` で思考モード を無効化しているため、比較的高速です

### Q4: メモリ不足エラー

Gemma4モデルは約2~4GBメモリを使用します。システムメモリが足りない場合は:
- 他のアプリケーションを閉じる
- より小さいGemmaモデルを検討

---

## パフォーマンス最適化

1. **バッチ処理**: 複数ツイートを同時分析（未実装）
2. **キャッシング**: 同じツイート内容は分析スキップ（未実装）
3. **非同期処理**: 分析結果待ちで通知をブロックしない（実装済み）

---

## 次のステップ

- [ ] TIME_CHANGE時の既存スケジュール更新機能
- [ ] 分析キャッシング機能
- [ ] バッチ分析API
- [ ] WebUI上での分析結果表示
- [ ] エラレート監視ダッシュボード
