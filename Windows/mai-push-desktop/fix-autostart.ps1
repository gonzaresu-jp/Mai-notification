# まいちゃん通知 — ログオン時自動起動(HKCU Run)の重複・死にエントリを掃除する
# 使い方: 右クリック →「PowerShell で実行」 または
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\fix-autostart.ps1
# 管理者権限は不要（HKCU のみ）。

$ErrorActionPreference = 'Stop'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$Canonical = 'electron.app.まいちゃん通知'
$Legacy = @('com.mai-push.desktop', 'electron.app.Electron')

if (-not (Test-Path $RunKey)) {
  Write-Host "Run キーが存在しません（何もしない）" -ForegroundColor Yellow
  exit 0
}

$props = Get-ItemProperty -Path $RunKey
$ownExe = ''
# 起動中のアプリがあればその exe を、無ければ既定のインストール先を正とする
$proc = Get-Process -Name 'まいちゃん通知' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc) {
  try { $ownExe = [System.IO.Path]::GetFullPath($proc.Path).ToLower() } catch {}
}

$removed = 0
# 自分の exe は「起動中プロセス → 無ければ正規エントリの指す先」から特定する
if (-not $ownExe) {
  $canonData = [string]$props.$Canonical
  if ($canonData) {
    $t = $canonData.Trim()
    if ($t.StartsWith('"')) {
      $end = $t.IndexOf('"', 1)
      if ($end -gt 0) { $t = $t.Substring(1, $end - 1) } else { $t = $t.Substring(1) }
    } else {
      $t = ($t -split '\s+')[0]
    }
    if ($t -and (Test-Path -LiteralPath $t)) {
      try { $ownExe = [System.IO.Path]::GetFullPath($t).ToLower() } catch {}
    }
  }
}

foreach ($name in $props.PSObject.Properties.Name) {
  if ($name -like 'PS*') { continue }
  if ($name -eq $Canonical) { continue }

  $data = [string]$props.$name
  $target = $data.Trim()
  if ($target.StartsWith('"')) {
    $end = $target.IndexOf('"', 1)
    if ($end -gt 0) { $target = $target.Substring(1, $end - 1) } else { $target = $target.Substring(1) }
  } else {
    $target = ($target -split '\s+')[0]
  }
  $targetNorm = ''
  if ($target -and (Test-Path -LiteralPath $target)) {
    try { $targetNorm = [System.IO.Path]::GetFullPath($target).ToLower() } catch { $targetNorm = $target.ToLower() }
  }

  $sameExe = ($ownExe -and $targetNorm -and $targetNorm -eq $ownExe)
  $legacy  = $Legacy -contains $name
  $dead    = ($target -and -not (Test-Path -LiteralPath $target) -and
              ($name -like 'electron.app.*' -or $name -like '*mai-push*'))

  if ($sameExe -or $legacy -or $dead) {
    Remove-ItemProperty -Path $RunKey -Name $name -Force
    Write-Host ("削除: {0}  =>  {1}" -f $name, $data) -ForegroundColor Green
    $removed++
  } else {
    Write-Host ("維持: {0}  =>  {1}" -f $name, $data)
  }
}

Write-Host ""
Write-Host ("{0} 件削除 / 残 {1} 件" -f $removed, (@(Get-ItemProperty -Path $RunKey).PSObject.Properties.Name | Where-Object { $_ -notlike 'PS*' }).Count) -ForegroundColor Cyan
