# WinUI 3 プロジェクトのビルドスクリプト
# Visual Studio の MSBuild が必要（dotnet build は AppxPackage ツールを見つけられない）
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
    /v:minimal

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Build succeeded: bin\x64\$config\net8.0-windows10.0.19041.0\win-x64\MaiPush.exe"
} else {
    Write-Error "Build failed"
    exit 1
}
