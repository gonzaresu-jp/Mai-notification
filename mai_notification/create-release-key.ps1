# まいちゃん通知 Android アプリ: リリース署名の鍵を作るスクリプト（最初の1回だけ実行）
# 右クリック →「PowerShell で実行」。パスワードはこの画面で入力し、他には送られません。
#
# 作られるもの:
#   %USERPROFILE%\mai-keys\mai-notification-release.jks   … 署名の鍵（★必ずバックアップ。無くすと以後アップデートを出せません）
#   <このフォルダ>\keystore.properties                   … ビルド時に鍵とパスワードを読むための設定（git 管理外）
$ErrorActionPreference = "Stop"
$keytool = "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
if (-not (Test-Path $keytool)) { Write-Host "keytool が見つかりません: $keytool" -ForegroundColor Red; Read-Host "Enter で終了"; exit 1 }

$dir = Join-Path $env:USERPROFILE "mai-keys"
$jks = Join-Path $dir "mai-notification-release.jks"
$props = Join-Path $PSScriptRoot "keystore.properties"
if (Test-Path $jks) { Write-Host "既に鍵があります: $jks （上書きしません）" -ForegroundColor Yellow; Read-Host "Enter で終了"; exit 0 }
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host "=== リリース署名の鍵を作成します ===" -ForegroundColor Cyan
do {
  $p1 = Read-Host "鍵のパスワード（6文字以上）" -AsSecureString
  $p2 = Read-Host "もう一度" -AsSecureString
  $s1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
  $s2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
  if ($s1 -ne $s2) { Write-Host "一致しません。もう一度入力してください。" -ForegroundColor Yellow }
  elseif ($s1.Length -lt 6) { Write-Host "6文字以上にしてください。" -ForegroundColor Yellow }
} until ($s1 -eq $s2 -and $s1.Length -ge 6)

& $keytool -genkeypair -v -keystore $jks -alias mai-notification -keyalg RSA -keysize 4096 -validity 36500 `
  -storepass $s1 -keypass $s1 -dname "CN=mai-notification, O=Mai Push, C=JP"
if ($LASTEXITCODE -ne 0) { Write-Host "鍵の作成に失敗しました" -ForegroundColor Red; Read-Host "Enter で終了"; exit 1 }

$jksPath = $jks -replace '\\', '/'
$pw = $s1 -replace '\\', '\\'   # properties 形式ではバックスラッシュをエスケープする
@"
storeFile=$jksPath
storePassword=$pw
keyAlias=mai-notification
keyPassword=$pw
"@ | Set-Content -Path $props -Encoding ASCII

Write-Host "`n完了しました。" -ForegroundColor Green
Write-Host "  鍵:   $jks"
Write-Host "  設定: $props"
Write-Host "`n★ 鍵ファイルとパスワードを、USBメモリやパスワード管理ツールなど別の場所に必ずバックアップしてください。" -ForegroundColor Yellow
Read-Host "Enter で終了"
