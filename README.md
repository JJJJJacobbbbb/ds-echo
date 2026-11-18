# DS Echo

**用你自己的 DeepSeek API Key，在 Android 上继续聊那些"聊不下去"的长对话。**

> ⚠️ 这是第三方客户端，**与深度求索官方无关**。API 用量从你自己的账户余额扣费，与本项目作者无关。

## 为什么会有这个

官方 App / 网页版从 2026-11-16 起收紧了长对话：单次输入约 4 万字、超过 7 天不活跃的长对话不能续、每日还有额度。很多人的角色扮演、长期陪伴、长文档对话就这样被卡住了。

DeepSeek 开源了聊天前端，也提供了"导出历史到其他 App"的入口。DS Echo 把这两件事接起来：

- 把官方导出的 ZIP **导入**到本地
- 用你自己的 **API Key** 接着聊（不受 7 天/每日额度的产品限制）
- 上下文按 **256K token** 预算管理，超出部分压缩进**会话记忆**，尽量不"失忆"

## 功能

| 能力 | 说明 |
|---|---|
| 历史导入 | 直接吃官方导出的 `deepseek_data-*.zip`，**并入**而非覆盖，按会话 ID 去重；导入前有预览 |
| 续聊 | 走 `api.deepseek.com` 的 SSE，支持深度思考、联网搜索、附件、继续生成 |
| 上下文管理 | 超出 256K token 时丢最早的轮次，被丢的内容压进会话记忆 |
| 会话记忆 | 每 10 轮自动提取事实，注入 system prompt；合并时有护栏，写坏就保留旧记忆 |
| 余额与充值 | 查询余额、跳转官方充值页 |
| 导出 | 导出回官方格式的 ZIP（与官方互通） |
| 语音输入 | 录音后走官方 ASR（需麦克风权限） |
| 安全 | API Key 存在 Android Keystore，不进 localStorage 明文 |

## 下载

- **GitHub Releases**（文件最全）：<https://github.com/JJJJJacobbbbb/ds-echo/releases/latest>
- **国内打不开 GitHub 时**：蓝奏云 <https://wwbld.lanzouw.com/iFFVb4gg4inc>（提取码 `h373`）
- 也可以用 `docs/download.html` 这个静态下载页（单文件、零依赖，含二维码，可放到任意静态托管）

> 首次安装需要在系统弹窗里允许「安装未知应用」。
> 应用内「检查更新」会依次尝试多个源（jsDelivr / GitHub API / 两个 APK 镜像），
> 下载后强制校验 SHA-256。

## 快速开始

1. **拿一个 API Key**：<https://platform.deepseek.com/api_keys>（需登录，按用量计费）
2. 安装 APK，打开 App，按引导粘贴 Key
3. （可选）设置 → 数据管理 → 导入历史，选官方导出的 ZIP
4. 开始聊

> 没有 Key 不能聊天——本 App 不提供代理或共享账号。

## 隐私

- 聊天记录、附件、API Key **只存在你的手机上**，本项目没有后端、不做云同步
- API Key 用 Android Keystore 加密保存（明文只存在于内存）
- 聊天请求直连 `api.deepseek.com`，中间没有第三方
- **检查更新**会请求 `api.github.com`（GitHub 能看到你的 IP），只在你自己点「检查更新」时发生
- 不接入任何分析 SDK

## 开发

需要 Node.js 22+、pnpm，以及一个 JDK 21 与 Android SDK（构建 APK 时）。

```sh
pnpm install
pnpm dev            # 浏览器里开发
pnpm build          # 产出 dist/
pnpm test           # 单元测试
pnpm lint && pnpm type
```

打包 Android：

```sh
# 需要 android/keystore.properties（发布签名）或走 debug 包
./scripts/build-apk.ps1 -Release
```

更细的说明见 `docs/`：

- `docs/code-map.md` —— 代码地图（先看这个）
- `docs/android-build.md` —— 构建与签名、以及踩过的坑
- `docs/p1-account.md` / `docs/p2-merge-import.md` / `docs/p3-export.md`
- `docs/memory.md` —— 会话记忆（移植自 dsh-persona-memory）
- `docs/context-budget.md` —— 上下文预算与裁剪
- `docs/secure-key.md` —— Key 的存储与迁移

## 已知限制

- 只做了 Android（Capacitor 打包），iOS 没验证
- 记忆没有界面入口（设计上"用户什么都不用做"），看不到它记了什么
- 上下文压缩是有损的：能保留事实，但不能保证原句
- 语音输入依赖官方 ASR 接口，需要余额

## 许可

MIT。本项目基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)（MIT, Copyright (c) 2026 DeepSeek）改造，
原项目的版权声明保留在 `LICENSE` 中。

会话记忆的机制与文件格式移植自 [dsh-persona-memory](https://www.npmjs.com/package/dsh-persona-memory)（MIT），
并与 [pi-hermes-memory](https://github.com/chandra447/pi-hermes-memory) 的 `MEMORY.md` 格式字节兼容。

---

## English summary

DS Echo is an unofficial Android client for DeepSeek, forked from [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo).
It imports your official DeepSeek chat export and lets you continue those conversations with **your own API key** —
the official app has tightened long-conversation limits since 2026-11-16 (≈40k chars per message, 7-day idle cutoff,
daily quota). Context is managed against a 256K-token budget; overflow is condensed into per-session memory
(ported from `dsh-persona-memory`).

Not affiliated with DeepSeek. API usage is billed to your own account. Data never leaves your device; no backend,
no analytics, API key stored in Android Keystore.
