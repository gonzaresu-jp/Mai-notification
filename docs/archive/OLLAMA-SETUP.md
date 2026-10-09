# Ollama + Gemma4 セットアップガイド

## インストール手順

### Windows 環境

1. **Ollama公式サイトからダウンロード**
   - https://ollama.ai にアクセス
   - Windows版をダウンロード＆インストール

2. **Ollama サーバーの起動**
   PowerShellで以下を実行：
   ```powershell
   ollama serve
   ```

3. **別ターミナルでモデルを起動**
   新しいPowerShellウィンドウを開いて：
   ```powershell
   ollama run yinw1590/gemma4-e2b-text --think=false
   ```

### 常に起動しておく方法

Ollama をシステム起動時に自動起動する設定をすると便利です。

---

## 現在のこのプロジェクトでの使用設定

```javascript
// gemma-analyzer.js
const MODEL = 'yinw1590/gemma4-e2b-text';
const OLLAMA_ENDPOINT = 'http://localhost:11434/api/generate';
```

---

## テスト実行手順

**1. Ollama起動確認**
```powershell
# 別ターミナルで実行
ollama run yinw1590/gemma4-e2b-text --think=false
```

**2. 別ターミナルで分析テスト実行**
```bash
cd q:\mai-push
node test-gemma.js
```

**3. 実際の監視開始**
```bash
node main.js
```

---

## 環境変数設定(.env)

```env
# Ollama設定（オプション - デフォルト値で通常OK）
OLLAMA_ENDPOINT=http://localhost:11434/api/generate
OLLAMA_MODEL=yinw1590/gemma4-e2b-text

# スケジュール作成設定
ADMIN_NOTIFY_TOKEN=your_token_here
SCHEDULE_USER_ID=1
ENABLE_SCHEDULE_AUTO_CREATE=true
```

---

## トラブルシューティング

### 「ollama: コマンドが見つかりません」
→ Ollamaをインストールして、PATH環境変数にOllamaのパスを追加してください

### 「接続できませんでした」
→ Ollamaサーバーが起動していません。別ターミナルで `ollama serve` を実行してください

### モデルが見つからない
→ 初回は自動ダウンロードされます（数分かかる場合があります）

---

## パフォーマンス参考値

- **初回起動**: 20～30秒（モデルロード）
- **通常分析**: 5～10秒/ツイート
- **メモリ使用量**: 約2～4GB（Gemma4）
