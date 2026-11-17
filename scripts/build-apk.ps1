# 打 APK 的一键脚本（薄胶水，不是自研构建系统）
#
# 为什么需要它：Gradle 构建依赖三个环境变量（JAVA_HOME / ANDROID_HOME / ANDROID_SDK_ROOT），
# 而 JDK 与 SDK 装在仓库之外的 D:\_tools。每次手敲三行 export 容易漏、漏了报错又难懂。
# 真正的构建仍然完全交给 pnpm / Capacitor CLI / Gradle 官方工具，本脚本不重写任何构建逻辑。
#
# 用法：  .\scripts\build-apk.ps1
# 产物：  android\app\build\outputs\apk\debug\app-debug.apk

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$jdkHome = "D:\_tools\jdk21\jdk-21.0.13+9"
$sdkHome = "D:\_tools\android-sdk"

foreach ($p in @($jdkHome, $sdkHome)) {
    if (-not (Test-Path $p)) {
        Write-Error "找不到 $p。请先按 docs/android-build.md 第 2 节重装工具链。"
        exit 1
    }
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdkHome
$env:ANDROID_SDK_ROOT = $sdkHome
$env:Path = "$jdkHome\bin;$sdkHome\platform-tools;$env:Path"

Push-Location $repoRoot
try {
    Write-Host "==> [1/3] 编译网页 (pnpm build)" -ForegroundColor Cyan
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build 失败" }

    Write-Host "==> [2/3] 同步进 Android 工程 (cap sync)" -ForegroundColor Cyan
    pnpm exec cap sync android
    if ($LASTEXITCODE -ne 0) { throw "cap sync 失败" }

    Write-Host "==> [3/3] 构建 debug APK (gradle)" -ForegroundColor Cyan
    Push-Location "$repoRoot\android"
    try {
        .\gradlew.bat assembleDebug --no-daemon --console=plain
        if ($LASTEXITCODE -ne 0) { throw "gradle assembleDebug 失败" }
    } finally {
        Pop-Location
    }

    $apk = "$repoRoot\android\app\build\outputs\apk\debug\app-debug.apk"
    $size = [math]::Round((Get-Item $apk).Length / 1MB, 2)
    Write-Host "`n==> 成功：$apk  ($size MB)" -ForegroundColor Green
} finally {
    Pop-Location
}
