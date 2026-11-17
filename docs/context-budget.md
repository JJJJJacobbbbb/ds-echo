# 上下文预算与裁剪

## 为什么需要

`deepseek-flash` 的上下文是 **1M token**（[官方定价页](https://api-docs.deepseek.com/quick_start/pricing/)），
不是无限。而改造前的 `toRequestMessages()` 把历史**原样全部**塞进请求：
一旦超过窗口，服务端直接报错，用户看到的是"消息发不出去"，而不是"部分历史被省略"。

这个 App 的目标用户恰好是**长对话**用户（官方 App 自 2026-11-16 起单次输入压到约 4 万字、
超 7 天不活跃的长对话不能续），所以这条路径必须处理。

## 策略

**保留最近轮次，从最早的开始丢**，并如实告诉用户丢了多少。

不做自动摘要。摘要要额外请求、且可能篡改角色设定——对角色扮演是风险。
宁可明说"模型看不到被省略的部分"，也不假装它记得。

## 参数

| 项 | 值 | 依据 |
|---|---|---|
| 输入预算 | 256,000 token | 用户指定；输出上限 384K，留出系统提示、记忆与工具结果 |
| 估算系数 | 汉字 0.6 token/字，其它 0.25 token/字符 | 经验值，偏保守（宁可早裁剪） |

## 代码

| 文件 | 职责 |
|---|---|
| `src/services/chat/contextBudget.ts` | 纯逻辑：`estimateTokens()`、`fitToBudget()` |
| `src/services/chat/reply.ts` | `toRequestMessages()` 先裁剪再拼 messages，返回 `droppedRounds` / `estimatedTokens` |
| `src/services/chat/store.ts` | 把裁剪结果记到 `reply.contextTrim` |
| `components/messages/AssistantMessage.tsx` | 渲染提示条 |

## 验证

### 单元测试（`tests/context-budget.test.ts`，10 条）

估算系数、从最早丢弃、预算小于单条、空历史等边界。

### 集成测试（`tests/context-trim-request.test.ts`，3 条）

直接调真实的 `toRequestMessages()`，构造 60 轮 × 4 万汉字的会话：

- 丢弃轮次 > 0
- 裁剪后估算量 ≤ 900,000
- **第 0 轮标记已不在请求里，第 59 轮仍在**（证明丢的是最早的）

### 端到端（真实浏览器 + 拦截请求，`/.verify/context/run.py`）

造 60 轮 × 4 万字符 = **240 万字符**的会话写入 IndexedDB，点开后发送一条消息，
用 Playwright 拦截发往 `api.deepseek.com` 的请求（不真正调用、不产生费用）：

| 断言 | 结果 |
|---|---|
| 请求体大小 | 4,444,202 字节 |
| messages 条数 | 76（原 120 被裁到 76） |
| 估算输入 token | **888,134 ≤ 900,000**（当时预算；现已改 256K） |
| 第 0 轮是否丢弃 | 是 |
| 第 59 轮是否保留 | 是 |
| 界面提示 | "已省略前面 23 轮历史，本次请求约 888,150 token；模型看不到被省略的部分。" |

> 预算后来按用户要求改为 **256K**，并新增了「会话记忆」补偿被丢弃的轮次，
> 见 [session-memory.md](./session-memory.md)。界面上的「已省略 N 轮」提示已按要求移除。

## 已知取舍

- **成本**：满预算一次请求约 0.9M 输入 token，非高峰缓存未命中约 $0.13（约 ¥1）。
  预算值写死在 `contextBudget.ts` 的 `CONTEXT_INPUT_BUDGET`，如果要控成本可以调低。
- **估算误差**：±20% 量级。预算留了余量，实际不会因为估偏而超窗口。
- **没有"只看到一部分"的视觉标记**：提示是文字说明，聊天记录里没有截断线。
  如果用户需要更明确的边界，可以后续在被省略的位置画一条分隔线。
