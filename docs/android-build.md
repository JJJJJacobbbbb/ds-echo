# Android 构建说明（本机实测可复现）

> 目标：任何人拿到这个仓库，照着本文能自己产出 APK。所有命令都在本机实际跑通过。
> 最底下的「坑」一节是踩过的，不要跳过。

## 1. 本机工具链现状

| 组件 | 版本 | 位置 | 说明 |
|---|---|---|---|
| JDK | **21.0.13**（Temurin） | `D:\_tools\jdk21\jdk-21.0.13+9` | **必须 21**，见坑 1 |
| Android SDK | cmdline-tools 13114758 | `D:\_tools\android-sdk` | 含 platform-tools 37、platforms 35/36、build-tools 35/36 |
| Gradle | 8.14.3 | `android/gradlew` 自带 wrapper | 首次构建自动下载 |
| Node / pnpm | 24.15.0 / 11.21.0 | 系统 PATH | — |

这些工具装在 `D:\_tools`（**仓库之外**，不入库）。换机器时按下面命令重装。

## 2. 从零重装工具链（约 500 MB 下载）

```powershell
# JDK 21（Temurin，zip 免安装，避免 UAC）
curl.exe -sSL -o D:\_tools\jdk21.zip "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse"
Expand-Archive D:\_tools\jdk21.zip -DestinationPath D:\_tools\jdk21

# Android 命令行工具
curl.exe -sSL -o D:\_tools\cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip"
Expand-Archive D:\_tools\cmdline-tools.zip -DestinationPath D:\_tools\ct
Move-Item D:\_tools\ct\cmdline-tools D:\_tools\android-sdk\cmdline-tools\latest

# SDK 组件（Capacitor 8 需要 compileSdk 36）
$sdk = "D:\_tools\android-sdk"
"y`ny`ny`ny`ny`ny`ny`ny`n" | & "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=$sdk --licenses
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=$sdk "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

## 3. 构建 APK

```powershell
# 一次做完：编译网页 → 同步进 Android 工程 → 打 debug 包
.\scripts\build-apk.ps1
```

手动做法（脚本内部就是这三步）：

```powershell
$env:JAVA_HOME      = "D:\_tools\jdk21\jdk-21.0.13+9"
$env:ANDROID_HOME   = "D:\_tools\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

pnpm build                                  # 产出 dist/
pnpm exec cap sync android                  # 把 dist/ 拷进 android/app/src/main/assets/public
cd android; .\gradlew.bat assembleDebug --no-daemon
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`（约 6 MB）

## 4. 装到手机

```powershell
adb devices                                   # 确认手机已授权
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

## 5. 坑（按踩到的顺序）

### 坑 1：JDK 17 不行，必须 21
现象：`compileDebugJavaWithJavac` 报 `无效的源发行版：21`。
原因：Capacitor 8 的 `capacitor-android` 用 Java 21 源码级别编译。
**别试图降 Capacitor 版本去迁就 JDK 17**，用 JDK 21。

### 坑 2：工程路径含中文会被 AGP 拒绝
现象：`Your project path contains non-ASCII characters`，构建直接中止。
现状：`D:\项目\DSEcho` 含中文，已在 `android/gradle.properties` 加
`android.overridePathCheck=true` 放行，实测能完整构建成功。
前提：本项目没有 NDK/C++ 编译步骤。**若将来引入 NDK，必须把工程移到纯 ASCII 路径**。

### 坑 3：中文 Windows 的控制台与 Gradle 编码
现象：Gradle 报错信息显示成乱码（`����: ��Ч��Դ���а棺21`），难以排查。
处理：`android/gradle.properties` 里已把 `org.gradle.jvmargs` 设为 `-Dfile.encoding=UTF-8`。
看 Gradle 输出前可先 `chcp 65001` 切 UTF-8 代码页。

### 坑 4：`pnpm build` 在上游原版会失败
上游 `package.json` 的 build 脚本是 `rm -rf dist && NODE_ENV=production rspack build`，
`rm` 在 Windows 不存在。已改为 `cross-env NODE_ENV=production rspack build`
（`rspack.config.ts` 自带 `output.clean: true`，不需要手动删目录）。

## 6. 尚未验证

- 真机启动、WebView 内 SSE 流式接收、文件选择器、返回键 —— 需要插上手机（`adb devices` 当前为空）。
