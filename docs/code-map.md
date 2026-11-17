# DS Echo 代码地图

> 上游 commit：`5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c`（`fix: clarify history import errors and release v0.1.1`）
> 本文件是**通读 `src/` 下全部 117 个 `.ts` / `.tsx`（共 14517 行）后的实测结论**，不是推测。
> 文中所有路径都相对 `src/`（唯一例外是标了「仓库根」的 `rspack.config.ts`），行号对应当前这个 commit。改动前请先 `git status` 确认代码没被别人动过，行号可能漂移。

---

## 0. 一句话架构

**一个没有后端的单页应用**：用户在输入框里写消息 → 消息进 zustand 的「内存状态树」（`services/chat/store.ts`）→ `services/api/client.ts` 用 `fetch` 打 DeepSeek 的 Anthropic 兼容接口（`POST /anthropic/v1/messages`，SSE 流）→ `services/api/sse.ts` + `parseEvent.ts` 把字节流切成事件 → `services/chat/reply.ts` 把事件合并进内存里的消息块，界面按动画帧重绘 → 同时 `services/chat/db.ts` 把会话与附件原件异步写进 IndexedDB；API Key、主题、语言等小配置写进 `localStorage`。

四层，依赖方向单向：

```
components/  （React 组件，只做展示 + 把点击转成调用）
     ↓
services/chat/store.ts （唯一的状态中枢：zustand store，所有会话读写的总闸）
     ↓                                    ↘
services/api/*  （fetch + SSE，网络）     services/chat/db.ts（IndexedDB，持久化）
     ↓
services/api/types.ts（协议类型，纯声明）
```

没有路由（`main.tsx` 直接渲染 `<App/>`），没有服务端代码，没有登录态——只有一个手工粘贴的 API Key。

---

## 1. 目录职责表

| 目录 | 负责什么 | 不该放什么 |
|---|---|---|
| `app/` | 应用外壳：根组件 `App.tsx`（初始化 + 三栏布局 + 全局副作用注册）、`theme.ts`（深浅色解析与 `<body>` class 同步）、`viewport.ts`（移动端断点、阻止整页滚动、键盘弹出后的视口高度） | 任何业务逻辑、任何 `fetch` |
| `components/` | 纯 UI：输入框、消息、Markdown、设置、侧栏、搜索面板、通用控件。每个子目录 = 界面上一个区域；`components/base/` 是与业务无关的通用控件（Button/Tooltip/Modal/Menu/Select/Toast/浮层定位）。组件只调用 `services/` 暴露的函数，自己不做网络、不碰数据库 | 持久化、跨组件状态机、协议解析 |
| `services/` | 业务与 IO 的全部实现：`api/`（接口与流）、`chat/`（状态中枢、IndexedDB、消息树、草稿、ZIP 导入导出）、`markdown/`（解析与懒加载）、`speech/`（录音与朗读）、`attachments.ts`（上传队列与校验）、`settings.ts`（本机设置）、`location*.ts`、`uploadExts.ts`（扩展名白名单） | JSX、CSS、`window.alert` 之类界面副作用 |
| `i18n/` | 中英文案表（`zh.ts` / `en.ts`，key 必须两边一致）与 `translate()` / `useTranslate()` | 任何界面结构与业务判断 |
| `utils/` | 3 个零依赖小工具：剪贴板、日期格式化、ID 生成 | 任何需要 import `services/` 的逻辑 |

另有两个根文件：`env.d.ts`（`__API_ORIGIN__` 等全局声明）、`main.tsx`（入口，只做 `ensureKatex()` + `setupTheme()` + `createRoot().render(<App/>)`）。

### 1.1 全量文件清单（117 个 `.ts` / `.tsx`，括号内为行数）

| 文件 | 角色 |
|---|---|
| `app/App.tsx` (139) | 根组件：`initChat`、模式切换、加载/保存失败提示、全局副作用 |
| `app/theme.ts` (71) | 主题解析（light/dark/system）与 DOM class 同步 |
| `app/viewport.ts` (111) | 移动端断点、阻止整页滚动、键盘视口高度 |
| `components/base/anchored.ts` (258) | 浮层定位、点外部/Esc 关闭、悬停延迟（Tooltip/Menu/Select/HoverCard 共用） |
| `components/base/Button.tsx` (21) | 通用按钮（4 种样式 × 3 种尺寸） |
| `components/base/IconButton.tsx` (42) | 图标按钮，tooltip 同时当无障碍名 |
| `components/base/icons.tsx` (525) | 41 个内联 SVG 图标组件，无逻辑 |
| `components/base/Menu.tsx` (65) | 下拉菜单 |
| `components/base/Modal.tsx` (82) | 弹窗，叠放时 Esc 只关最上层 |
| `components/base/Select.tsx` (93) | 胶囊形选择器 |
| `components/base/Toast.tsx` (38) | 轻提示渲染（含错误态与文字链接） |
| `components/base/toastState.ts` (19) | 轻提示状态与 `showToast()` |
| `components/base/Tooltip.tsx` (70) | 悬停提示，移动端不显示 |
| `components/base/Button.module.css.d.ts` (13) | CSS Module 类名类型声明（构建产物） |
| `components/base/Select.module.css.d.ts` (9) | 同上 |
| `components/chatInput/ChatInput.tsx` (291) | 输入框：发送/停止、思考与搜索开关、附件、拖拽、语音接线 |
| `components/chatInput/DraftAttachments.tsx` (99) | 草稿附件列表（图片缩略图 / 文件卡片） |
| `components/chatInput/DragMask.tsx` (149) | 拖拽上传 hook + 全屏遮罩 |
| `components/chatInput/Spectrum.tsx` (132) | 录音实时频谱（逐帧改 transform） |
| `components/chatInput/useVoiceInput.ts` (152) | 录音 → ASR → 回填文字的状态机 |
| `components/chatInput/VoiceButton.tsx` (78) | 麦克风按钮三态（空闲/录音/转写） |
| `components/chatInput/ChatInput.module.css.d.ts` (25) | CSS Module 类型声明 |
| `components/files/FileCard.tsx` (83) | 文档附件卡片（图标 + 名称 + 状态） |
| `components/files/FileIcon.tsx` (97) | 按扩展名选图标（PDF/表格/PPT/图片/其他） |
| `components/files/FileCard.module.css.d.ts` (17) | CSS Module 类型声明 |
| `components/markdown/Markdown.tsx` (44) | 渲染入口：节流 → AST → 渲染器 |
| `components/markdown/MarkdownAstRenderer.tsx` (247) | AST → DOM 的全部映射（标题/列表/表格/代码/引用） |
| `components/markdown/CodeBlock.tsx` (123) | 代码块：语言名、复制、Mermaid 图/码切换 |
| `components/markdown/Link.tsx` (56) | 链接与图片 URL 清洗（只允许 http/https/mailto） |
| `components/markdown/MathFormula.tsx` (67) | KaTeX 行内/块级公式，失败回退原文 |
| `components/markdown/MermaidDiagram.tsx` (92) | Mermaid 绘制，流式期间只画完整行 |
| `components/markdown/useThrottleMarkdownRender.ts` (44) | 按上次渲染耗时对流式 Markdown 节流 |
| `components/messages/MessageList.tsx` (181) | 消息列表：可见分支、跟随底部、版本映射 |
| `components/messages/AssistantMessage.tsx` (178) | 助手消息：思考区、正文、错误提示、操作按钮 |
| `components/messages/UserMessage.tsx` (136) | 用户消息：气泡、附件、就地编辑 |
| `components/messages/ReplyArea.tsx` (391) | 思考与工具步骤时间线（搜索/打开/查找/阅读链接） |
| `components/messages/BranchSwitcher.tsx` (56) | 「1 / N」版本切换器 |
| `components/messages/CopyButton.tsx` (33) | 复制按钮（成功换对勾 1 秒） |
| `components/messages/MessageFile.tsx` (164) | 消息里的图片缩略图/文件卡，含补传状态与重试 |
| `components/messages/ReadAloudButton.tsx` (26) | 朗读按钮 |
| `components/messages/ReadingBars.tsx` (113) | 朗读 loading/playing 的 SVG 竖条动画 |
| `components/messages/scrollContext.ts` (6) | 「滚到底部」React Context |
| `components/messages/useReplyView.ts` (32) | `buildReplyView` 的 React 包装（复用 sources 数组） |
| `components/messages/AssistantMessage.module.css.d.ts` (16) | CSS Module 类型声明 |
| `components/messages/BranchSwitcher.module.css.d.ts` (7) | 同上 |
| `components/messages/MessageFile.module.css.d.ts` (12) | 同上 |
| `components/messages/MessageList.module.css.d.ts` (7) | 同上 |
| `components/messages/ReplyArea.module.css.d.ts` (38) | 同上 |
| `components/messages/UserMessage.module.css.d.ts` (15) | 同上 |
| `components/search/CitationLink.tsx` (26) | 正文 `[citation:N]` 角标，悬停预览来源 |
| `components/search/FallbackImage.tsx` (48) | 三态图片（骨架/成功/兜底） |
| `components/search/HoverCard.tsx` (56) | 悬停卡片容器 |
| `components/search/SearchPanel.tsx` (35) | 右侧搜索结果面板 |
| `components/search/searchPanelState.ts` (18) | 面板开关状态 |
| `components/search/SiteLogo.tsx` (37) | 站点图标与重叠缩略图组 |
| `components/search/SourceCard.tsx` (30) | 单条结果卡片 |
| `components/search/SourceCard.module.css.d.ts` (13) | CSS Module 类型声明 |
| `components/session/SessionView.tsx` (46) | 会话页：标题栏 + 消息列表 + 吸底输入框 |
| `components/session/MobileHeader.tsx` (34) | 移动端顶栏 |
| `components/session/Welcome.tsx` (21) | 新对话欢迎页 |
| `components/session/Welcome.module.css.d.ts` (8) | CSS Module 类型声明 |
| `components/settings/SettingsDialog.tsx` (559) | 设置弹窗全部内容：主题/语言/音色/位置/API Key/导入/导出/删全部 |
| `components/settings/ApiKeyField.tsx` (100) | API Key 输入框、掩码显示、移动端确定按钮 |
| `components/settings/useApiKeyForm.ts` (50) | 校验 API Key 后保存 |
| `components/settings/settingsDialogState.ts` (25) | 弹窗开关 + `ensureApiKey()` |
| `components/settings/Settings.module.css.d.ts` (38) | CSS Module 类型声明 |
| `components/sider/Sider.tsx` (157) | 侧边栏（含移动端抽屉、删除确认弹窗） |
| `components/sider/SessionItem.tsx` (84) | 单条会话（点击切换、重命名、删除菜单） |
| `components/sider/CollapsedSider.tsx` (31) | 收起后的两个按钮 |
| `components/sider/mobileSiderState.ts` (8) | 移动端抽屉开关 |
| `components/sider/Sider.module.css.d.ts` (22) | CSS Module 类型声明 |
| `i18n/index.ts` (34) | 翻译函数与 `TranslationKey` 类型 |
| `i18n/zh.ts` (172) | 中文文案表（key 的唯一真源） |
| `i18n/en.ts` (181) | 英文文案表 |
| `services/api/client.ts` (189) | **唯一发出 HTTP 请求的地方**：鉴权头、`/messages` 流、`/files` 上传、`/models` 校验 |
| `services/api/sse.ts` (136) | SSE 解析（按 WHATWG 规范） |
| `services/api/parseEvent.ts` (231) | 流事件 JSON → 类型化事件（不认识的事件丢弃） |
| `services/api/types.ts` (260) | 协议类型：请求体、内容块、流事件、错误体 |
| `services/api/errors.ts` (116) | 状态码归类、可重试判定、附件失效与上传失败识别 |
| `services/api/speech.ts` (65) | ASR `/v1/tools/asr`、TTS `/v1/tools/tts` |
| `services/api/balance.ts` (79) | **P1 新增**：`GET /user/balance`，响应形状校验（形状不符报 protocol 错误，不静默返回 0） |
| `services/account/balance.ts` (78) | **P1 新增**：余额状态机（idle/loading/ready/error）+ 防旧响应覆盖的请求序号 |
| `services/external.ts` (61) | **P1 新增**：官方外链白名单 + `Browser.open` 跳转（建 Key、充值） |
| `services/chat/mergePlan.ts` (52) | **P2 新增**：合并导入去重规则（纯函数，tests/merge-plan.test.ts 覆盖） |
| `services/chat/history/archiveFingerprint.ts` (33) | **P2 新增**：归档 SHA-256 指纹 + 64MB 体积上限 |
| `services/chat/store.ts` (1094) | **状态中枢**：会话 CRUD、发送、流式收尾、历史替换、缓存淘汰 |
| `services/chat/db.ts` (~390) | IndexedDB 全部读写 + 导入暂存 + `mergeStaging`（合并）/ `commitStaging`（覆盖，仅删除全部用） |
| `services/chat/types.ts` (128) | 本地数据模型：`Session` / `Message` / `FileAttachment` |
| `services/chat/reply.ts` (347) | 流事件合并、收尾、消息 → 请求体转换 |
| `services/chat/branches.ts` (117) | 消息树：当前路径、追加分支、切换版本 |
| `services/chat/view.ts` (400) | 回复 → 界面视图（步骤时间线、来源编号、正文 markdown） |
| `services/chat/drafts.ts` (161) | 未发送草稿（内存）与草稿附件 |
| `services/chat/describe.ts` (60) | 回复错误 → 界面提示文案/动作 |
| `services/chat/backup.ts` (57) | 导入/导出/清空的串行队列入口 |
| `services/chat/sessionGroups.ts` (33) | 会话按今天/昨天/7 天/30 天/月分组 |
| `services/chat/latestReminder.ts` (30) | 生成随请求发送的「时间/星期/地区/Web/语言」快照 |
| `services/chat/history/importArchive.ts` (159) | ZIP 格式预检 + 流式导入到暂存 |
| `services/chat/history/exportArchive.ts` (50) | 组装导出 ZIP |
| `services/chat/history/toLocal.ts` (318) | 归档片段 → 本地消息（还原消息树） |
| `services/chat/history/toArchive.ts` (278) | 本地消息 → 归档片段（重编号、状态映射） |
| `services/chat/history/schema.ts` (263) | 归档字段逐项校验 + 版本检查 |
| `services/chat/history/format.ts` (208) | 归档格式类型定义（`export_format_version: 3`） |
| `services/chat/history/paths.ts` (24) | ZIP 条目命名与解析 |
| `services/chat/history/zipReader.ts` (316) | 手写 ZIP32 读取（STORE/DEFLATE、CRC、路径校验） |
| `services/chat/history/zipWriter.ts` (117) | 手写 ZIP32 写入（STORE） |
| `services/chat/history/errors.ts` (13) | `BackupError`（携带 i18n key） |
| `services/chat/history/README.md` | 归档格式与导入规则的说明（非代码） |
| `services/attachments.ts` (245) | 上传队列（并发 3）、格式/体积/数量校验、错误文案 |
| `services/settings.ts` (140) | 本机设置（localStorage）：API Key、语言、主题、位置、音色、开关 |
| `services/location.ts` (54) | 地区/省份/城市数据访问与校验 |
| `services/locationData.ts` (452) | 纯数据：省份、城市、国家代码、中文名覆盖 |
| `services/uploadExts.ts` (986) | 纯数据：允许上传的扩展名数组（986 行几乎全是字符串） |
| `services/markdown/parse.ts` (87) | Markdown → mdast，并把 citation/链接/脚注预处理掉 |
| `services/markdown/highlight.ts` (110) | Prism 语言懒加载表 + 别名 |
| `services/markdown/katex.ts` (17) | KaTeX 懒加载 |
| `services/markdown/mermaid.ts` (53) | Mermaid 懒加载 + 串行渲染队列 |
| `services/speech/readAloud.ts` (144) | TTS 裸 PCM 流 → AudioContext 排队播放 |
| `services/speech/recorder.ts` (132) | 录音并编码成 16kHz WAV |
| `utils/clipboard.ts` (28) | 复制文本（clipboard API + execCommand 兜底） |
| `utils/format.ts` (22) | `formatDate` / `monthKey` |
| `utils/id.ts` (4) | `createId()`（`crypto.randomUUID` 或退化实现） |
| `env.d.ts` (15) | 全局声明（`__API_ORIGIN__`、CSS Module、prism/katex 副作用模块） |
| `main.tsx` (11) | 入口：加载 KaTeX、装主题、挂载 `<App/>` |

---

## 2. 按功能索引（最重要的一节）

### 2.1 发消息 / 流式接收 / 停止生成

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 「发送」按钮的行为、回车发送 | `components/chatInput/ChatInput.tsx` | `send()` 135–153；按钮 `canSend` 133；回车 183–188 |
| 真正提交（建会话、插入提问+占位回答、起流） | `services/chat/store.ts` | `sendMessage()` 548–616；插入分支 602–605；起流 614 |
| 输入框文本/附件 → 可发送消息 | `services/chat/drafts.ts` | `prepareDraftMessage()` 99–121 |
| 一次生成请求的全过程（重试、退避、收尾） | `services/chat/store.ts` | `streamReply()` 962–1093；请求体 999–1011；逐帧刷新 1027–1032 |
| 请求体字段（model / system / thinking / tools） | `services/chat/store.ts` | 999–1011；常量 `MODEL` 36、`SYSTEM_PROMPT` 38、`SAFETY_CHECK` 42、`serverTools()` 49–57 |
| 打 HTTP、判 Content-Type、逐事件产出 | `services/api/client.ts` | `streamMessage()` 144–189；端点 149；错误帧 172–177 |
| SSE 字节流 → 事件（切行/多行 data） | `services/api/sse.ts` | `readServerSentEvents()` 105–136；`ServerSentEventDecoder` 20–99 |
| 事件 JSON → 类型化事件 | `services/api/parseEvent.ts` | `readMessageEvent()` 175–231 |
| 事件 → 内存里的内容块（text/thinking/工具） | `services/chat/reply.ts` | `applyEvent()` 72–137；`settleReply()` 143–160 |
| 回复状态机 pending/streaming/done/stopped/error | `services/chat/types.ts` | `ReplyStatus` 72；`AssistantMessage` 74–104 |
| 停止生成 | `ChatInput.tsx:263–274` → `services/chat/store.ts` | `stopReply()` 542（就是 `controller.abort()`）；中止后收尾 1037–1039 |
| 「继续生成」按钮的可用条件 | `services/chat/reply.ts` | `canContinueReply()` 172–191 |
| 流式期间的落盘时机（切后台/关页面） | `services/chat/store.ts` | `persist()` 182–219；`bindChatPersistence()` 228–254 |
| 模型自动生成标题 | `services/chat/store.ts` | 1008 传 `title:{enabled:true}`；1015–1026 收标题 |

### 2.2 API 鉴权与请求头

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| `x-api-key` / `anthropic-beta` 头 | `services/api/client.ts` | `anthropicHeaders()` 85–90；`FILES_BETA` 17（`files-api-2025-04-14`） |
| 校验 Key（`GET /models`，不花钱） | `services/api/client.ts` | `verifyApiKey()` 93–99 |
| 校验表单 → 保存 Key | `components/settings/useApiKeyForm.ts` | `submit()` 30–47 |
| Key 存到哪 | `services/settings.ts` | `KEYS.apiKey` 23（`chat-demo:api-key`）；`setApiKey()` 122–125 |
| 没 Key 时自动弹设置 | `components/settings/settingsDialogState.ts` | `ensureApiKey()` 19–25 |
| 语音接口的鉴权（`Authorization: Bearer`） | `services/api/speech.ts` | `transcribe()` 17–46；`synthesize()` 49–64 |
| API 根地址（构建期注入） | 仓库根 `rspack.config.ts:28,83` → `services/api/client.ts:13` | `__API_ORIGIN__` 默认 `https://api.deepseek.com` |

### 2.3 余额与 API 错误提示

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 状态码归类（401/402/413/429/5xx/断网） | `services/api/errors.ts` | `classifyStatus()` 17–34；`classifyApiError()` 36–44 |
| 哪些错误可重试 | `services/api/errors.ts` | `isRetryableApiError()` 47–55 |
| 错误 → 用户文案 | `services/chat/describe.ts` | `describeReply()` 19–60 |
| 错误提示的界面样式与「换 Key / 充值」入口 | `components/messages/AssistantMessage.tsx` | 94–126；充值地址常量 27 |
| 余额查询 | **不存在** | 全仓库没有余额/账单接口；只有 402 会被归类成 `insufficientBalance`（`services/api/errors.ts:21–23`） |
| 上传失败的文案 | `services/attachments.ts` | `describeUploadError()` 64–72；配额提示 `describeUploadQuota()` 89–99 |
| 附件 file_id 失效的识别 | `services/api/errors.ts` | `getFileErrorCode()` 71–76；`extractFileIds()` 79–81 |

### 2.4 会话列表读写 / 删除会话

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 列表怎么读（只读摘要，不读消息） | `services/chat/db.ts` | `loadSessionSummaries()` 78–79 |
| 启动时加载列表 | `services/chat/store.ts` | `initChat()` 291–318 |
| 打开会话（合并并发读、标记加载失败） | `services/chat/store.ts` | `ensureSessionLoaded()` 321–367 |
| 切换会话 / 新对话 | `services/chat/store.ts` | `selectSession()` 450–457；`newChat()` 443–448 |
| 重命名 | `services/chat/store.ts` + `services/chat/db.ts` | `store.ts` 的 `renameSession()` 459–478 → `db.ts` 的 `renameSession()` 105–124 |
| 删除会话（并清理没人引用的附件原件） | `services/chat/store.ts` + `services/chat/db.ts` | `removeSession()` 484–488 / `removeSessionData()` 490–540 → `db.deleteSession()` 127–148 |
| 删除确认弹窗 | `components/sider/Sider.tsx` | 102–138 |
| 侧栏列表与分组标题 | `components/sider/Sider.tsx` | 19–141（分组 24） |
| 单条会话的菜单（重命名/删除） | `components/sider/SessionItem.tsx` | 12–84 |
| 时间分组规则 | `services/chat/sessionGroups.ts` | `groupSessions()` 10–33 |

### 2.5 消息树与分支切换

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 「当前显示哪条路径」 | `services/chat/branches.ts` | `getVisibleMessages()` 18–35（沿 `selectedChildId` 走） |
| 新旧消息如何挂到树上 | `services/chat/branches.ts` | `appendBranch()` 77–101；`normalizeSession()` 4–15 |
| 切到兄弟版本 | `services/chat/branches.ts` | `selectVersion()` 104–117 |
| 「1 / N」版本号怎么算 | `services/chat/branches.ts` | `buildMessageVersions()` 40–74 |
| 切换版本的界面入口 | `services/chat/store.ts` | `selectMessageVersion()` 677–686 |
| 重新生成 / 编辑提问 / 继续生成 | `services/chat/store.ts` | 619–642 / 645–675 / 689–724 |
| 版本切换器 UI | `components/messages/BranchSwitcher.tsx` | 11–56 |

### 2.6 导入历史 ZIP / 导出历史 ZIP / 备份

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 三个入口（导出/导入/清空）+ 串行队列 | `services/chat/backup.ts` | `exportHistory()` 20–40；`importHistory()` 46–51；`clearHistory()` 54–57；`enqueueBackup()` 11–15 |
| 设置里的按钮与状态文案 | `components/settings/SettingsDialog.tsx` | `useHistoryImport` 440–466；`ImportHistory` 469–513；`ExportHistory` 516–559；`useHistoryDelete` 172–206 |
| 选文件（`<input type=file accept=.zip>`） | `components/settings/SettingsDialog.tsx` | 496–508 |
| 格式预检（第一个条目必须是 manifest） | `services/chat/history/importArchive.ts` | `checkArchiveFormat()` 57–73 |
| 流式导入到暂存区 | `services/chat/history/importArchive.ts` | `importArchive()` 81–159；图片去重 93–102 |
| 事务替换（**先 clear 再复制**） | `services/chat/db.ts` | `commitStaging()` 210–245 |
| 导入期间锁 UI、先停所有流 | `services/chat/store.ts` | `replaceHistory()` 392–441 |
| 归档 → 本地消息（还原消息树） | `services/chat/history/toLocal.ts` | `toLocalSession()` 282–318；`buildTree()` 246–279；片段映射 `toBlocks()` 109–206 |
| 本地消息 → 归档（重编号、状态映射） | `services/chat/history/toArchive.ts` | `toSessionFile()` 229–269；`numberMessages()` 210–227 |
| 字段校验与版本号 | `services/chat/history/schema.ts` | `checkManifest()` 230–238；`readSessionFile()` 252–263；`readSessionIndex()` 240–250 |
| ZIP 读取（含 CRC 与路径安全） | `services/chat/history/zipReader.ts` | `readArchive()` 241–299；`readEntry()` 302–308；`isZipFile()` 20–23 |
| ZIP 写入 | `services/chat/history/zipWriter.ts` | `writeArchive()` 42–117 |
| ZIP 内条目名规则 | `services/chat/history/paths.ts` | 3–10（`manifest.json` / `chat_session_index.json`）；`parseSessionPath()` 13–14；`imagePath()` 23–24 |
| 归档格式本身（字段含义） | `services/chat/history/format.ts` | `EXPORT_FORMAT_VERSION = 3` 12 |
| 备份相关 bug 的报错 key | `services/chat/history/errors.ts` | `BackupError` 4–9 |

### 2.7 设置与 API Key 存取

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 设置项有哪些、默认值 | `services/settings.ts` | 类型 11–20；初值 90–99 |
| localStorage 的键名 | `services/settings.ts` | `KEYS` 22–31 |
| 各设置项的 setter | `services/settings.ts` | 101–139（每个都是「写 localStorage + 更新 store」） |
| 设置弹窗开/关与默认分组 | `components/settings/settingsDialogState.ts` | 8–16 |
| 弹窗结构（通用/数据两组） | `components/settings/SettingsDialog.tsx` | 43–133；分组定义 48–55 |
| API Key 输入框与掩码 | `components/settings/ApiKeyField.tsx` | `useApiKeyEditor` 11–16；`ApiKeyField` 21–84 |
| 位置选择（省/市/国家） | `components/settings/SettingsDialog.tsx` | `LocationSetting` 208–270 |
| 「最新信息」快照怎么拼 | `services/chat/latestReminder.ts` | `createLatestReminder()` 19–29 |

### 2.8 深色模式 / 主题 / 国际化

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 主题怎么算出来（light/dark/system） | `app/theme.ts` | `useTheme()` 19–23；`resolveTheme()` 15–16 |
| 主题怎么落到 DOM | `app/theme.ts` | `applyTheme()` 32–51（`body.dark` / `data-ds-dark-theme`）；`setupTheme()` 64–71 |
| 主题选择的界面 | `components/settings/SettingsDialog.tsx` | `ThemeSetting` 367–394 |
| 主题偏好持久化 | `services/settings.ts` | `KEYS.themePreference` 26；`setThemePreference()` 112–115 |
| 翻译函数 | `i18n/index.ts` | `useTranslate()` 31；`translate()` 33–34；`isTranslationKey()` 14–15 |
| 文案本身 | `i18n/zh.ts` / `i18n/en.ts` | zh 是 key 的源（`TranslationKey` 由它推导） |
| 语言切换 | `components/settings/SettingsDialog.tsx` + `services/settings.ts` | `LocaleSetting()` 272–292 → `setLocale()` 101–104 |
| `<html lang>` 同步 | `app/App.tsx` | 55–57 |

### 2.9 附件与图片上传

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 选择/拖拽/粘贴文件 | `components/chatInput/ChatInput.tsx` | `acceptFiles()` 77–85；拖拽 102；粘贴 189–195 |
| 允许哪些扩展名 | `services/uploadExts.ts` | `ACCEPT_FILE_EXTS`（986 行数据，4–986） |
| 体积/数量/格式校验 | `services/attachments.ts` | `validateFiles()` 46–58；常量 9–18（64MB / 32MB / 50 个） |
| 上传队列（最多同时 3 个、同 id 复用） | `services/attachments.ts` | `uploadAttachment()` 167–206；`enqueueUpload()` 120–141 |
| 上传时带什么 `purpose` | `services/attachments.ts` | `getUploadPurpose()` 32–37（PDF/Word/PPT → `rich_layout_recognition`） |
| 真正发 Files API 请求 | `services/api/client.ts` | `uploadFile()` 105–123 |
| 草稿里的附件 | `services/chat/drafts.ts` | `addDraftFiles()` 61–85；`removeDraftAttachment()` 132–142 |
| 发送前补齐 serverId（含失效重传） | `services/chat/store.ts` | `prepareFiles()` 816–876；`ensureServerId()` 779–792；`reuploadInvalidatedFiles()` 900–938 |
| 原件存在哪 | `services/chat/db.ts` | `StoredFile` 8–11；`saveFiles()` 155；`loadFile()` 157–158 |
| 消息里图片/文件怎么显示 | `components/messages/MessageFile.tsx` | 50–164；`useFileUrl()` 13–32 |
| 附件卡片（图标/大小/重试） | `components/files/FileCard.tsx` | 14–83 |

### 2.10 Markdown / 公式 / Mermaid 渲染

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 一条消息的正文怎么渲染 | `components/markdown/Markdown.tsx` | 14–44（节流 → `toMdAst` → `MarkdownAstRenderer`） |
| Markdown → AST、citation 预处理 | `services/markdown/parse.ts` | `toMdAst()` 34–87；citation 替换 46–59 |
| AST 各节点 → 什么 DOM | `components/markdown/MarkdownAstRenderer.tsx` | 215–247；块级 158–213；行内 104–146 |
| 代码块 + 语言高亮 | `components/markdown/CodeBlock.tsx`、`services/markdown/highlight.ts` | `CodeBlock` 73–123；`loaders` 20–67；`getHighlightLang()` 99–102 |
| KaTeX 公式 | `components/markdown/MathFormula.tsx`、`services/markdown/katex.ts` | `useMathHtml()` 18–47；`ensureKatex()` 7–17 |
| Mermaid 图 | `components/markdown/MermaidDiagram.tsx`、`services/markdown/mermaid.ts` | 组件 7–92；`renderMermaid()` 21–53 |
| 流式时 Markdown 多久重绘一次 | `components/markdown/useThrottleMarkdownRender.ts` | 14–44（`MAX_WAIT` 2000ms，4） |
| 正文里的 `[citation:N]` 角标 | `services/chat/view.ts` + `components/search/CitationLink.tsx` | `joinTextBlocks()` 154–174；`CitationLink` 10–26 |
| 链接安全（协议白名单） | `components/markdown/Link.tsx` | `sanitizeUrl()` 4–19 |

### 2.11 本地存储（IndexedDB）位置

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 数据库名与版本 | `services/chat/db.ts` | 5（`DB_VERSION = 12`）；56–76（`openDB('chat-demo', 12)`） |
| 表结构与索引 | `services/chat/db.ts` | 16–32（类型）；58–71（建表/建索引） |
| 写会话（会话 + 摘要 + 附件同一事务） | `services/chat/db.ts` | `saveSession()` 84–102 |
| 导入暂存的清空/写入/提交 | `services/chat/db.ts` | `clearStaging()` 161–168；`addStagingSession()` 170–172；`commitStaging()` 210–245 |
| 存储失败怎么处理（只打控制台） | `services/chat/db.ts` | `reportStorageError()` 248–251 |

### 2.12 语音输入与朗读

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 录音（16kHz 单声道 WAV） | `services/speech/recorder.ts` | `startRecording()` 23–98；`encodeWav()` 100–132 |
| 录音 → 转写 → 回填 | `components/chatInput/useVoiceInput.ts` | `toggle()` 99–131；`finish()` 55–97 |
| 语音识别请求 | `services/api/speech.ts` | `transcribe()` 17–46 |
| 朗读（PCM → 扬声器） | `services/speech/readAloud.ts` | `toggleReadAloud()` 80–144；`toFloat32()` 47–54 |
| 朗读按钮 | `components/messages/ReadAloudButton.tsx` | 13–26 |

### 2.13 搜索结果面板与工具步骤

| 我想改… | 去这个文件 | 关键函数/行号 |
|---|---|---|
| 右侧面板开关/内容 | `components/search/searchPanelState.ts` | `toggleSearchPanel()` 13–16；`closeSearchPanel()` 18 |
| 面板 UI | `components/search/SearchPanel.tsx` | 9–35 |
| 来源编号与去重 | `services/chat/view.ts` | `SourceRegistry` 108–148 |
| 回复 → 步骤时间线 + 正文 | `services/chat/view.ts` | `buildReplyView()` 176–347；折叠标题 `getAreaTitle()` 370–400 |
| 步骤时间线 UI（搜索/打开/查找/阅读） | `components/messages/ReplyArea.tsx` | 56–105；`SearchRow` 185–261；`OpenRow` 299–343 |

---

## 3. 关键数据流（文字版时序）

### 3.1 用户发一条消息 → 流式渲染 → 落库

1. **点击发送**：`components/chatInput/ChatInput.tsx` 的 `send()`（135–153）先用 `services/chat/drafts.ts` 的 `prepareDraftMessage()`（99）检查「有文字或附件，且所有附件已上传成功」，再 `ensureApiKey()`，最后调 `services/chat/store.ts` 的 `sendMessage(sessionId)`（144）。
2. **建/取会话**：`services/chat/store.ts` 的 `sendMessage()`（548）从草稿取 `{text, files}`（552）；若是新对话，就地建一个 `Session` 并塞进 `sessionCache`（565–581）。
3. **插入提问 + 占位回答**：`createReply()`（257–270）造一条 `status:'pending'` 的助手消息；`services/chat/branches.ts` 的 `appendBranch()`（77）把它俩挂到当前路径末尾（602–605）；`persist()`（182）异步写库。
4. **起流**：`void streamReply(sessionId, reply, {history, question})`（614）。
5. **补附件**：`streamReply()`（962）先 `prepareFiles()`（816）——本轮附件并行补传，历史里缺 `serverId` 的图片逐个补传，失败静默跳过、下次再试。
6. **发请求**：`services/chat/reply.ts` 的 `toRequestMessages()`（303）把「提问 + 有效回答」的成对轮次转成 `messages`，加上 `system`/`thinking`/`tools`/`safety_check`，交给 `services/api/client.ts` 的 `streamMessage()`（144）；后者 `POST /anthropic/v1/messages`（149，`stream:true`，头带 `x-api-key`）。
7. **解析 SSE**：`response.body` → `services/api/sse.ts` 的 `readServerSentEvents()`（105）用 `ServerSentEventDecoder`（20）按 CRLF/LF 切行、空行派发事件 → `JSON.parse` → `services/api/parseEvent.ts` 的 `readMessageEvent()`（175）做字段校验，不认识的事件直接丢。
8. **合并进内存**：`services/chat/store.ts:1027` 对每个事件调 `services/chat/reply.ts` 的 `applyEvent()`（72）：`content_block_start` 追加块，`text_delta` / `thinking_delta` / `signature_delta` / `citations_delta` 累加。界面不是每个事件都重绘，而是 `requestAnimationFrame(flush)`（1031）合并到下一帧；页面隐藏时立刻 `flush`（1028–1029）。
9. **收尾**：`message_stop` → `settleReply(reply,'done')`（1034，实现在 `services/chat/reply.ts:143`）；出错/中止走 1036–1080，记成 `error`（带 `kind/status/localMessage`）或 `stopped`；`finally`（1082–1093）摘掉 `streaming` 标记并 `persist()`。
10. **落库**：`persist()` → `services/chat/db.ts` 的 `saveSession()`（84）在**一个事务**里写 `sessions`、`sessionSummaries`、`files`；失败只置 `sessionSaveErrors`，顶部出现「尚未保存」条（`app/App.tsx:81–93`）。
11. **渲染**：`app/App.tsx:123` 传 `session` → `components/session/SessionView.tsx`（11）→ `components/messages/MessageList.tsx`（51 取当前分支）→ `components/messages/AssistantMessage.tsx` 的 `useReplyView()`（47）→ `services/chat/view.ts` 的 `buildReplyView()`（176）算出步骤/正文/来源 → `components/markdown/Markdown.tsx`（14）节流后 `toMdAst()`（`services/markdown/parse.ts:34`）→ `MarkdownAstRenderer` 出 DOM。

### 3.2 导入一个历史 ZIP

1. **选文件**：`components/settings/SettingsDialog.tsx` 496–508 的 `<input type="file" accept=".zip...">`，`onChange` 调 `historyImport.select(file)`（465）。
2. **二次确认**：同文件 `ImportConfirm`（318–343）点「确认导入」→ `confirm()`（446–463）→ `importHistory(file)`（455）。
3. **进串行队列**：`services/chat/backup.ts` 的 `importHistory()`（46）走 `enqueueBackup()`（11），保证导入/导出/清空不交错；先 `checkArchiveFormat(file)`（48）。
4. **格式预检**：`services/chat/history/importArchive.ts` 的 `checkArchiveFormat()`（57）——`services/chat/history/zipReader.ts` 的 `isZipFile()`（20）先看开头是不是 `PK\x03\x04`，然后 `readArchive()`（241）逐条读，**第一个条目必须是 `manifest.json`**，再由 `services/chat/history/schema.ts` 的 `checkManifest()`（230）校验版本（只接受 `export_format_version === 3`）。
5. **原子替换入口**：`services/chat/store.ts` 的 `replaceHistory(() => importArchive(file))`（392）。它先 `abort()` 所有正在生成的流（398），等删除任务（402），`historyEpoch += 1`（403，让所有在途异步结果失效），`db.clearStaging()`（407）清掉上次中断的暂存。
6. **流式导入到暂存**：`importArchive()`（81–159）按条目顺序分支处理：会话 JSON → `services/chat/history/toLocal.ts` 的 `toLocalSession()`（282）还原消息树 → `services/chat/db.ts` 的 `addStagingSession()`（170）；图片 → 识别头部字节得 MIME → `saveStagingFiles()`（174，同一文件 ID 只存一次）；`user.json` 直接跳过（114–116）；`chat_session_index.json` 读成索引（128–129）。
7. **收尾校验**：全部读完后核对「索引列出的会话数 == 实际导入数」且一一对应（149–157），再由 `updateStagingFileTypes()`（`services/chat/db.ts:178`）回填图片 MIME。
8. **提交事务**：`services/chat/db.ts` 的 `commitStaging()`（210）在**一个 readwrite 事务**里，先 `target.clear()`（219）清空 `sessions`、`files`，再 `sessionSummaries.clear()`（221），然后用游标逐条把暂存复制进正式表并重建摘要（223–234），最后清空暂存（235）。任何一步抛错都 `abortTransaction()`（238），正式数据回滚到导入前。
9. **刷新内存**：`services/chat/store.ts:416–428` 清缓存/草稿、`sessions = sortSessions(summaries)`、`activeId = null`；返回导入会话数。
10. **UI 更新**：`finally`（`services/chat/store.ts:431`）解锁 `importingHistory`；`components/sider/Sider.tsx:24` 用 `services/chat/sessionGroups.ts` 的 `groupSessions()` 重新分组渲染；`SettingsDialog.tsx` 把成功文案写进 `status`（456）。失败时 `clearStaging()`（`store.ts:413`）并把提示统一成 `historyImportFailed`（458）。
11. **附带效果**：`replaceHistory` 里 `historyEpoch` 自增会让所有旧的「读会话/存会话」回调发现自己过期而丢弃结果（`services/chat/store.ts:194`、`:336`），避免旧数据盖回来。

---

## 4. IndexedDB 结构

数据库：`chat-demo`，版本 `12`（P2 起新增 `importRegistry` 表）（`services/chat/db.ts:5` 常量，`db.ts:57` 打开）。
`upgrade()`（58–71）只负责**建缺失的表和索引，不迁移任何旧数据**（59 行注释明说）。

| object store | keyPath | 索引 | 值类型 | 谁在写 |
|---|---|---|---|---|
| `sessions` | `id` | 无 | `Session`（含全部消息，含所有分支） | `saveSession` 84、`renameSession` 105、`commitStaging` 210 |
| `sessionSummaries` | `id` | `fileIds`（multiEntry） | `StoredSessionSummary` = `SessionSummary` + `fileIds: string[]`（14） | `saveSession` 84、`renameSession` 105、`commitStaging`、`deleteSession` 127 |
| `files` | `id` | 无 | `StoredFile { id, blob }`（8–11，附件原件） | `saveFiles` 155、`saveSession`（随会话一起） |
| `sessionsStaging` | `id` | 无 | `Session`（导入暂存） | `addStagingSession` 170；`clearStaging` 161；`commitStaging` 210 |
| `filesStaging` | `id` | 无 | `StoredFile`（导入暂存） | `saveStagingFiles` 174；`clearStaging` 161；`commitStaging` 210 |

补充事实：
- `fileIds` 索引是「删除会话时判断原件是否还被别的会话引用」的唯一依据（`deleteSession` 136–140）。
- `localStorage` 里另存 8 个键（**不在 IndexedDB**）：`chat-demo:api-key`、`:locale`、`:location`、`:theme-preference`、`:tts-voice`、`:thinking`、`:search`、`:sider-collapsed`（`services/settings.ts:22–31`）。

---

## 5. 已知的、与「要做 Android 客户端」冲突的地方

以下每条都是代码里**实际存在**的事实，附文件:行号。

1. **导入 = 整体覆盖，事务里先 `clear()` 全部表**。`services/chat/db.ts:216–245` 的 `commitStaging()` 对 `sessions` 与 `files` 先 `clear()`（219）再复制，`sessionSummaries` 也 `clear()`（221）；入口在 `services/chat/backup.ts:46–51`，期间 `services/chat/store.ts:392` 会中止所有生成。~~没有「合并导入」这条路~~ → **P2 已修复**：导入改走 `stageHistoryImport` → 预览 → `mergeStaging`（不 clear），见 `docs/p2-merge-import.md`。
2. **API Key 明文存 localStorage**。`services/settings.ts:10`（注释自认）、`:22–31`（键名）、`:122–125`（原样 `setItem`）。没有 Keystore / 加密 / 生物识别。
3. **鉴权直接由前端发往上游**。`services/api/client.ts:13–17`（`API_ORIGIN` + `/anthropic/v1` + `files-api-2025-04-14`）、`:85–90`（`x-api-key`）、`:149`（`POST /messages`）。Key 一定在客户端里，无法隐藏；WebView 里还要求该域名的 CORS 放行。
4. **只认 `export_format_version === 3`**。`services/chat/history/schema.ts:230–238`：比 3 新报 `backupNewerVersion`，不等于 3 报 `backupInvalidVersion`——旧版导出文件一律导入失败。
5. **附件原件整块进出内存**。ZIP 里图片用 `services/chat/history/zipReader.ts` 的 `readEntry()`（302–308）拼成一个完整 `Blob`；导入时整张 `new Blob([data])` 存库（`services/chat/history/importArchive.ts:98–102`）；上传时整个 `FormData` 一次发出（`services/api/client.ts:111–121`）。低内存 Android 机上大文件会顶到 OOM。
6. **文件和下载都依赖浏览器语义**。导入靠 `<input type=file>` 给的 `File`（`components/settings/SettingsDialog.tsx:496–508`、`services/chat/backup.ts:46`），且 `zipReader.ts` 全程用 `file.slice()` 随机读（20–23、35–44）；导出靠 `<a download>` + `createObjectURL`（`SettingsDialog.tsx:527–532`）。Android 必须换成 SAF / ContentResolver / 写 `Downloads`。
7. **录音依赖 `getUserMedia` + `ScriptProcessorNode`，且只在安全上下文可用**。`services/speech/recorder.ts:24–26`（`getUserMedia`）、`:58`（`createScriptProcessor`，已被规范标记废弃）、`:81–84`（iOS 需 `resume`）；`components/chatInput/useVoiceInput.ts:14` 用 `window.isSecureContext` 直接禁用入口——WebView 里大概率一直是禁用态。
8. **朗读用 Web Audio 播裸 PCM**。`services/speech/readAloud.ts:91` 新建 `AudioContext({sampleRate:24000})`，`:102–131` 手工排队 `AudioBufferSourceNode`；需用户手势才能出声（`:78` 注释）。
9. **所有外链走 `target="_blank"` / `window.open`**：`components/markdown/Link.tsx:42,52`、`components/search/SourceCard.tsx:17`、`components/search/CitationLink.tsx:14`、`components/messages/MessageFile.tsx:161`、`components/messages/AssistantMessage.tsx:117`（充值）、`components/base/Toast.tsx:31`。WebView 不接管就会出现「点了没反应」。
10. **剪贴板依赖 `navigator.clipboard` + `execCommand` 兜底**。`utils/clipboard.ts:3–22`（`:22` 是已废弃的 `execCommand`）。
11. **远端文件从不删除**。`services/api/client.ts:126–131` 有 `deleteFile()`，但全仓库**没有任何调用点**（grep 仅命中定义处）；`services/chat/store.ts:480–483` 的注释明确写「远端文件不删」。服务端配额只会涨不会落。
12. **模型/人设/安全审核是硬编码常量**。`services/chat/store.ts:36`（`MODEL = 'deepseek-flash'`）、`:38`（中文 system prompt）、`:42`（`SAFETY_CHECK = { level: 'high' }`，注释称固定开启）。多模型或关审核都要改这里。
13. **数据库名与版本写死且不做迁移**。`services/chat/db.ts` 的 `'chat-demo'`、`DB_VERSION = 12`、注释「不迁移旧消息」。Android 版想复用/迁移旧数据得另写。
14. **流式刷新绑定浏览器帧与页面可见性**。`services/chat/store.ts:1031`（`requestAnimationFrame`）、`:1028` 与 `:244`（`document.visibilityState`）。Android 后台/息屏行为不同，落盘时机要重做（否则杀进程即丢最后一段回答）。
15. **导出在内存里生成完整 Blob**。`services/chat/history/exportArchive.ts:49`、`services/chat/history/zipWriter.ts:113`（`new Blob(chunks)`），没有流式写盘；`zipWriter.ts:44/56/61` 还会在超过 ZIP32 上限时直接抛 `ArchiveLimitError`。
16. **没有账号体系、没有余额查询**。唯一「余额」概念是 402 状态码归类（`services/api/errors.ts:21–23`）；Key 靠用户手工粘贴（`components/settings/ApiKeyField.tsx:42–62`），没有登录、刷新 token、多账号切换。
17. **移动端布局靠 CSS 断点而非原生控件**。`app/viewport.ts:4`（`not all and (min-width: 768px)`）、`:46–110`（`visualViewport` 手动算键盘高度）、`:35–43`（`touchmove` 里 `preventDefault`）。放进 WebView 后这套「假装是 App」的补丁会与真实键盘行为冲突。

---

## 附：改代码前该知道的 3 件事

1. **几乎所有会话写操作都要经过 `services/chat/store.ts`**。想加功能，先在那里加一个导出函数，再让组件调用它——不要从组件直接摸 `db.ts`。
2. **行号会漂**。这份地图对应 commit `5d5dd75`；每节都写了函数名，用「函数名 + 近似行号」定位，别只靠数字。
3. **`store.ts`（1094 行）与 `SettingsDialog.tsx`（559 行）已经超过单文件 400 行红线**，`ReplyArea.tsx`(391) 接近。真要动这三个文件里的逻辑，先想清楚拆成什么再改。

