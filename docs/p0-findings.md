# P0 技术探针结论（实测记录）

> 本文件只记录**在本机实际执行并看到结果**的事实。没有验证的，明确写"未验证"。
> 记录时间：2026-11-17。上游基线 commit：`5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c`（deepseek-ai/chat-demo，2026-11-13，v0.1.1）。

---

## 1. 环境与可复现命令

| 项目 | 本机实际情况 | 与计划书要求的差异 |
|---|---|---|
| Node.js | v24.15.0 | 计划书要求 22.12+，满足；但 24 是更新的主版本，至今未发现不兼容 |
| pnpm | 11.21.0 | 满足 |
| git | 2.54.0 | 满足 |
| JDK | **21.0.13**（已装于 `D:\_tools\jdk21`） | 需 21，不是 17，见 2.8 |
| Android SDK | **已装于 `D:\_tools\android-sdk`** | platform-tools 37、platforms 35/36、build-tools 35/36 |
| adb | **已装**（platform-tools 37） | 尚无设备连接 |
| Android Studio | 未安装 | 非必需，命令行可完整构建 |

复现命令（在项目根目录执行）：

```powershell
pnpm install --frozen-lockfile   # 235 包，约 16s
pnpm type                        # 0 错误
pnpm lint                        # 118 文件，0 warning 0 error
pnpm build                       # 805ms，产物 dist/
pnpm dev                         # http://localhost:8090/
```

## 2. 已验证的结论

### 2.1 构建链在本机能跑通

| 命令 | 结果 | 证据 |
|---|---|---|
| `pnpm install --frozen-lockfile` | 成功，235 个包 | 退出码 0 |
| `pnpm type` | 0 错误 | `tsc -p tsconfig.json` 退出码 0 |
| `pnpm lint` | 118 文件 / 100 规则，0 warning 0 error | oxlint 输出 |
| `pnpm build` | 编译成功 805ms，产出 `dist/index.html` + 静态资源 | 退出码 0 |

### 2.2 上游 build 脚本在 Windows 上是坏的（已修）

上游原文：`"build": "rm -rf dist && NODE_ENV=production rspack build -c rspack.config.ts"`

- `rm -rf` 在 Windows `cmd.exe` 下不存在 → `pnpm build` 直接失败（`'rm' is not recognized`）。
- 已改为：`cross-env NODE_ENV=production rspack build -c rspack.config.ts`
- **删掉 `rm -rf dist` 是安全的**，因为 `rspack.config.ts:42` 已设置 `output.clean: true`。
  验证方式：在 `dist/` 里放一个假文件 `__stale_probe.txt`，跑完 build 后 `Test-Path` 返回 `False` → 确认旧产物真被清掉。
- `cross-env` 是唯一新增的 devDependency（10.1.0），用于跨平台设置 `NODE_ENV`。

### 2.3 API 走的是 Anthropic 兼容协议（计划书第 2.1 条属实）

- `src/services/api/client.ts:15` → `ANTHROPIC_BASE_URL = ${API_ORIGIN}/anthropic/v1`
- `client.ts:149` → 对话请求 `POST /anthropic/v1/messages`，`stream: true`
- `client.ts:116` → 附件上传 `POST /anthropic/v1/files`（带 `anthropic-beta` 头）
- 默认 `API_ORIGIN = https://api.deepseek.com`（`rspack.config.ts:28`）

### 2.4 CORS 层面的最大风险已排除 ✅

计划书把「WebView 跨源请求」列为**高危**。实测 DeepSeek API 的 CORS 策略是**反射任意 Origin**：

```
# 预检
curl -X OPTIONS https://api.deepseek.com/anthropic/v1/messages \
  -H "Origin: https://localhost" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type,anthropic-version"

→ HTTP 200
  access-control-allow-origin: https://localhost     ← 反射，不是固定 *
  access-control-allow-methods: POST
  access-control-allow-headers: authorization,content-type,anthropic-version
  access-control-allow-credentials: true
```

```
# 余额接口（不带 Key，只看 CORS 头）
curl -i https://api.deepseek.com/user/balance -H "Origin: https://localhost"

→ HTTP 401（预期，因为没 Key）
  access-control-allow-origin: https://localhost
  access-control-allow-credentials: true
```

结论：**Capacitor 的 `https://localhost` 源可以直连 API，不需要早期就写原生 HTTP 桥接。**
（连带好处：`/user/balance` 接口确实存在且路径正确。）

### 2.5 应用能启动，且首屏行为已确认

用 Playwright 在 1280x800 与 390x844 两个视口打开 `http://localhost:8090/`：

- 控制台错误 0、未捕获异常 0、失败请求 0、HTTP ≥400 共 0
- `#root` 有 1 个子节点，标题 `API 使用 demo`
- 截图（390 宽）显示：首次进入即弹出「设置」对话框，含「通用设置 / 数据管理」两个页签、
  API Key 输入框、「导入历史对话（上传）」「导出所有历史对话（下载）」「删除所有对话」

截图存放：`.verify/p0-boot/`（已在 .gitignore 中忽略）

### 2.6 导入流程的真实结构：上游**已有暂存区**

计划书说「官方导入是替换全部本地记录，需要改成安全合并」。实测更精确：

| 环节 | 位置 | 实际行为 |
|---|---|---|
| 入口 | `src/services/chat/backup.ts:48-50` | 先 `checkArchiveFormat` 校验，再 `replaceHistory(() => importArchive(file))` |
| 解析 | `src/services/chat/history/importArchive.ts:81` | **流式**读取 ZIP，逐条目写入 `sessionsStaging` / `filesStaging`，全程不碰正式表 |
| 提交 | `src/services/chat/store.ts:407-413` | `clearStaging` → `importArchive` → `commitStaging`，失败时再次 `clearStaging` |
| 替换 | `src/services/chat/db.ts:210` `commitStaging` | **单事务内对 `sessions`/`files` 先 `clear()` 再逐条 put**，失败显式中止事务回滚 |

**含义（对 P2 很重要）**：
- "导入不破坏现有数据"的**基础设施已经存在**（暂存 + 单事务 + 回滚）。
- 真正要改的只有两处：`db.ts:210 commitStaging` 里的 `clear()` 改成合并；
  以及在合并时按「稳定会话 ID + 归档指纹」去重（目前没有任何去重逻辑，也没有 ImportRegistry 表）。
- 工作量比计划书假设的"从零做非破坏性导入"**显著更小**，但风险集中在事务语义上，需要自动化测试覆盖。

### 2.7 API Key 确实是 localStorage 明文

- `src/services/settings.ts:10` 注释写明「本机设置，存 localStorage：API Key、语言、主题…」
- `settings.ts:23` → `apiKey: 'chat-demo:api-key'`
- `settings.ts:122` `setApiKey()` 直接 `localStorage.setItem`

### 2.9 用真实 ZIP 跑通「改造前」基线（P2 的对照物）

样本：用户从 chat.deepseek.com 导出的真实包 `chatdata/deepseek_data-2026-11-17.zip`
（1.9 MB → 解压 3.4 MB，压缩比 1.9x，**不含 zip bomb 特征**；`export_format_version: 3`）

内容结构（只统计结构，未读取正文）：

```
条目 86 个：manifest.json + user.json + index.json + 77 个会话 JSON + 6 个附件
消息角色：USER 177 条 / ASSISTANT 177 条
单会话最大消息数：38，最短 2 条
```

用 `scripts/probe-import-baseline.py`（Playwright + 临时 profile，跑完即销毁）执行
「上传 → 确认弹窗 → 确认导入」，实测：

| 指标 | 导入前 | 导入后 |
|---|---|---|
| sessions | 0 | **77** |
| sessionSummaries | 0 | **77** |
| files（附件） | 0 | **6** |
| sessionsStaging / filesStaging | 0 | 0（暂存已清空） |
| 控制台错误 | — | **0** |

结论：**上游现有导入逻辑能吃下这个真实包**，格式版本、附件、会话树都没问题。
所以 P2 的工作不是"让导入能用"，而是"把覆盖改成分合并 + 去重"。

改造前的关键行为（来自代码 + 实测）：
- 确认弹窗文案就是 `historyImportConfirmDescription`：「上传的历史对话会覆盖当前所有对话记录」
- 导入没有预览（选完文件直接确认），也没有"跳过 N 个重复"的概念
- 导入后 `sessions` 恒等于包内会话数，本地已有会话会被 `commitStaging` 的 `clear()` 抹掉

截图证据：`.verify/import-baseline/{1-file-selected,2-confirm-dialog,3-imported,4-session-list}.png`

## 3. 阻塞与未验证项（不许含糊）

| 项 | 状态 | 说明 |
|---|---|---|
| Android APK 构建 | ✅ **通过** | `app-debug.apk` 5.99 MB，见 2.8 |
| 真机安装与启动 | ❌ **阻塞** | `adb devices` 为空，等待手机以 USB 调试模式接入 |
| 真机 SSE 流式验证 | ❌ **阻塞** | 同上；CORS 已排除，仍剩「WebView 是否缓冲 SSE」这一项未验证 |
| 真机余额接口验证 | ❌ **阻塞** | 同上（CORS 已通过 curl 侧证） |
| 真实 ZIP 导入回归 | ⚠️ 未做 | 用户已确认有一份真实 ZIP，待 P2 |
| 代码地图 | ✅ 完成 | `docs/code-map.md`（117 个文件通读，路径全部做过存在性校验） |

### 2.8 APK 已能产出（P0 第 5 条达成一半）

| 步骤 | 命令 | 结果 |
|---|---|---|
| 网页构建 | `pnpm build` | dist/ 产出 |
| 加 Android 工程 | `pnpm exec cap add android` | Capacitor 8.6.2，生成 `android/` |
| 同步资源 | `pnpm exec cap sync android` | dist/ → `assets/public/`，155 个文件 |
| 打 debug 包 | `gradlew assembleDebug` | **BUILD SUCCESSFUL**，5.99 MB |

产物校验（用 `aapt2 dump badging` 与直接解包读取）：

```
package: name='com.dsecho.app' versionName='1.0' compileSdkVersion='36'
minSdkVersion:'24'  targetSdkVersion:'36'
application-label:'DS Echo'
assets/public/index.html
assets/public/static/js/main.9820cd3a.js (463.8 KB)
assets/public/* 共 155 个文件
```

两个必须记住的构建约束（详见 `docs/android-build.md`）：
1. **JDK 必须是 21**。用 17 会在 `compileDebugJavaWithJavac` 报 `无效的源发行版：21`（Capacitor 8 的源码级别是 21）。
2. **工程路径含中文会被 AGP 拒绝**。已在 `android/gradle.properties` 加 `android.overridePathCheck=true` 放行。
   本项目无 NDK，可接受；**一旦引入 NDK 必须迁到纯 ASCII 路径**。

一键重建：`.\scripts\build-apk.ps1`（已实测，增量约 20s）。

## 4. 风险登记更新（相对计划书第 8 章）

| 原风险 | 新等级 | 依据 |
|---|---|---|
| WebView CORS 失效 | 高 → **低** | 实测 API 反射 Origin，预检放行 |
| WebView SSE 被缓冲 | 高 → **中** | 只剩这一项需要真机；Android 13+ 系统 WebView 内核较新，大概率可用，但**未验证** |
| 合并导入破坏历史 | 高 → **中** | 上游已有暂存+事务+回滚，只需改 clear→merge 并补测试 |
| 官方 ZIP 格式变化 | 中高（不变） | 有 `export_format_version = 3` 版本校验（`history/format.ts:12`、`schema.ts:231-235`） |
