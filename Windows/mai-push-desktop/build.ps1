# Mai Push Desktop - Windows ビルドスクリプト
# 右クリック → 「PowerShell で実行」で OK

Write-Host "=== Mai Push Desktop ビルド ===" -ForegroundColor Cyan

# 1. Node.js 確認
$nodeVer = node --version 2>$null
if (-not $nodeVer) {
    Write-Host "Node.js が見つかりません。https://nodejs.org からインストールしてください。" -ForegroundColor Red
    exit 1
}
Write-Host "Node.js: $nodeVer" -ForegroundColor Green

# 2. npm install
Write-Host "`n依存関係をインストール中..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install に失敗しました" -ForegroundColor Red
    exit 1
}
Write-Host "完了" -ForegroundColor Green

# 3. Build
Write-Host "`nビルド中（数分かかります）..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ビルドに失敗しました" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 完了 ===" -ForegroundColor Cyan
Write-Host "インストーラー: dist\Mai Push Desktop-Setup-1.0.0.exe" -ForegroundColor Green
Write-Host "ポータブル版:  dist\Mai Push Desktop-Portable-1.0.0.exe" -ForegroundColor Green
