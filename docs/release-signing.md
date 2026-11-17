# 发布签名与打包

> 目标：产出一个**可以给别人装**的 APK。重点是签名与"不要再发 debug 包"这两件事。

## 1. 为什么必须用 release 包

debug 包（`app-debug.apk`）会打开 WebView 的远程调试端口。任何人拿到这个包，
只要能连上设备（USB 或同网的 adb），就能通过 `adb forward` + Chrome DevTools
看到该应用里的全部内容——包括你输入的 API Key。

release 包不含 `android:debuggable` 标记，Capacitor 也不会开放调试端口。
**对外分发只能用 release 包。**

## 2. 密钥库在哪、怎么备份

| 项 | 位置 |
|---|---|
| 密钥库 | `D:\_tools\dsecho-keys\dsecho-release.jks`（**仓库之外**） |
| 凭据 | `D:\_tools\dsecho-keys\CREDENTIALS.txt`（同目录，含密码） |
| Gradle 读取的配置 | `android/keystore.properties`（**已 gitignore**） |

- 算法：RSA 2048，有效期 10000 天，alias `dsecho`
- 证书 DN：`CN=DS Echo, OU=Personal, O=DS Echo, L=Zhengzhou, ST=Henan, C=CN`
- 证书 SHA-256：`93439c74870f5c2cc38cf8527cb3e1644154507e63bd13186a1f01a19c5bbe1f`

**必须备份**：把 `.jks` 和 `CREDENTIALS.txt` 一起拷到别的地方（U 盘、密码管理器）。
丢了密钥库的后果是——**这个 App 从此不能再发布可覆盖升级的版本**，
老用户只能卸载重装（本地聊天和 Key 全丢）。

## 3. 打包

```powershell
.\scripts\build-apk.ps1 -Release
# 产物：android\app\build\outputs\apk\release\app-release.apk（约 5 MB）
```

脚本内部就是：`pnpm build` → `cap sync android` → `gradlew assembleRelease`。

`android/keystore.properties` 缺失时不会报错，release 产出**未签名**包
（能构建成功，但装不上、也发不出去）。这样没有密钥的人也能验证构建链。

## 4. 版本号规则（发新包前必看）

在 `android/app/build.gradle` 的 `defaultConfig` 里：

```groovy
versionCode 1        // 每次发版必须 +1，否则设备上覆盖安装会失败
versionName "0.1.0"  // 给人看的版本号，与 package.json 的 version 保持一致
```

Android 只按 `versionCode` 判断新旧，且**要求签名一致**才能覆盖安装。

## 5. 验证过的证据

| 项 | 命令 | 结果 |
|---|---|---|
| 签名正确 | `apksigner verify --print-certs` | `CN=DS Echo`，SHA-256 与上表一致 |
| 签名方案 | `apksigner verify --verbose` | v2 = true（minSdk 24，v2 足够） |
| 不是 debug 包 | `aapt2 dump badging \| findstr debuggable` | 无输出 |
| 版本 | `aapt2 dump badging` | `versionCode='1' versionName='0.1.0'` |
| 网页资源完整 | 解包统计 `assets/public/*` | 159 个文件 |
| 体积 | — | release 5.00 MB / debug 6.13 MB |

## 6. 从 debug 换到 release 会丢数据（重要）

debug 包和 release 包的签名不同，Android 不允许直接覆盖安装，必须先卸载。
**卸载会清掉应用数据**：本地聊天记录、API Key 都会没有。

正确的迁移步骤：

1. 在 debug 版里：设置 → 数据管理 → 导出所有历史对话 → 选「保存到文件」
2. 卸载 debug 版
3. 安装 release 包
4. 首屏连接向导 → 底部「已有聊天记录？先导入再连接」→ 选刚才的 ZIP → 预览 → 导入
5. 在连接向导里重新粘贴 API Key

第 4 步同时也是一次真实的"备份能不能救回来"验证。

## 7. 还没做的

- 应用图标还是 Capacitor 默认图标（`mipmap-*/ic_launcher*`）
- 没有 `versionCode` 自动从 `package.json` 生成，需要手动改
- 没有 CI：现在全靠本地脚本
- 未开启 R8 混淆（`minifyEnabled false`）；开之前要先确认 Capacitor 插件的 keep 规则

## 8. 真机验收（release 包实际装上后）

| 项 | 结果 |
|---|---|
| 安装 | 卸载 debug 后 `adb install app-release.apk` 成功，正常启动 |
| 首屏 | 显示连接向导（全新数据，符合预期） |
| **WebView 调试端口** | `adb forward ... webview_devtools_remote_<pid>` 后访问 `http://localhost:9223/json/version` — **无响应**（debug 包此前是可访问的）。这是"能给别人装"的关键前提，已实证 |
| `run-as` 读应用数据 | 被系统拒绝（`package not debuggable`），说明确实不可调试 |
| 功能可用 | 设置里余额正常刷新（¥6.27 @22:00），说明 Key 与网络链路在 release 包下正常 |

### 关于"卸载会丢数据"的实测

本次卸载 debug 后安装 release，应用数据**确实没有保留**（抽屉里 0 条会话）。
`android:allowBackup="true"` 并没有在这个机型上触发自动恢复——
所以文档第 6 节的"先导出再卸载"流程是必需的，不能指望系统备份兜底。

备份文件已推到手机 `Download/dsecho-backup.zip`（3.35 MB，77 会话 / 6 附件，ZIP 完整性 OK）。
