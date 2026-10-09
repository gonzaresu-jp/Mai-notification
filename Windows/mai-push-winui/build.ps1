# WinUI 3 プロジェクトのビルドスクリプト
# dotnet build は AppxPackage ツール不足で失敗するため VS の MSBuild を使う
$msbuild = "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe"
if (-not (Test-Path $msbuild)) {
    Write-Error "Visual Studio 2022 Community が見つかりません"
    exit 1
}

$config = if ($args[0]) { $args[0] } else { "Release" }
Write-Host "Building $config..."

& $msbuild MaiPushWinUI.csproj `
    /p:Configuration=$config `
    /p:Platform=x64 `
    /p:RuntimeIdentifier=win-x64 `
    /p:EnableSourceControlManagerQueries=false `
    /v:minimal

if ($LASTEXITCODE -eq 0) {
    $outDir = "bin\x64\$config\net8.0-windows10.0.19041.0\win-x64"
    Write-Host "`n✓ Build succeeded: $outDir\MaiPush.exe"
    Write-Host "  Run: & '$outDir\MaiPush.exe'"
} else {
    Write-Error "Build failed"
    exit 1
}
