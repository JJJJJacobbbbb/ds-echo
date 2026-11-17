# P1（上半）：连接向导 · 余额 · 充值

> 记录 2026-11-17 这一轮新增的东西、为什么这么设计、以及**真的跑过**的验证。
> 代码地图（`docs/code-map.md`）已同步补上这三个新模块。

## 1. 这一轮解决了什么

改造前，用户第一次打开 App 会被直接甩一个「设置」对话框，
里面是主题、语言、朗读音色、位置信息……API Key 输入框还藏在「数据管理」页签里。
目标是：**只出现三件该做的事**——去官方建 Key、粘贴、连接。

| 新增 | 作用 |
|---|---|
| `src/components/onboarding/SetupGuide.tsx` | 三步式连接向导，未连接时取代聊天界面 |
| `src/services/api/balance.ts` | `GET /user/balance` + 响应形状校验 |
| `src/services/account/balance.ts` | 余额状态机（idle/loading/ready/error），供多处共享 |
| `src/services/external.ts` | 官方外链白名单 + 用系统浏览器打开 |
| `src/components/settings/AccountPanel.tsx` | 设置里的余额区块：金额、赠送/充值明细、刷新、充值 |

## 2. 几个刻意的设计决定

**余额不轮询。** 只在三个时机查：打开设置、用户点刷新、从充值页返回 App。
余额是计费状态不是行情，轮询只会白烧请求。

**金额按字符串原样显示，不做数值运算。** 服务端返回 `"9.84"` 这样的字符串，
转成 number 再格式化会引入浮点误差；多币种也不合并（CNY 与 USD 是独立账本）。

**响应形状不符时报错，而不是返回空。** 如果解析失败静默返回空列表，
界面会显示「余额 0」，用户会以为钱没了。现在抛 `protocol` 错误走错误分支。

**外链必须过白名单。** `services/external.ts` 只放行 https + DeepSeek 官方域名
（含子域），并拒绝 `platform.deepseek.com.evil.com` 这类仿冒写法。
顺带把上游 `AssistantMessage.tsx` 里那个裸 `<a target="_blank">` 也收编了——
在 WebView 里 `target="_blank"` 行为不可控，还可能绕开白名单。

**防旧响应覆盖。** 余额 store 里带请求序号：用户连点刷新、或刚换 Key 时，
先发后到的旧结果会被丢弃。

## 3. 顺带修掉的上游问题

- **切换设置页签时没有回到顶部**：两个分组高度不同，保留上次滚动位置会把新分组
  第一行滚出可视区（实测 `scrollTop` 残留 65.7px，正好把「账户余额」标题和按钮切掉）。
  现在切页签会 `scrollTo({ top: 0 })`。

## 4. 验证（都是实际跑出来的）

### 4.1 单元测试：`pnpm test` → 15 个用例全过

`tests/balance-parse.test.ts`（8 个）
- 正常响应能解析；金额保持字符串；多币种顺序保留；余额 0 是合法数据
- 缺 `is_available` / `balance_infos` 不是数组 / 金额是数字 / 传 null —— 都报 protocol 错误

`tests/external-link.test.ts`（7 个）
- 放行官方三页与子域
- 拒绝 http、仿冒域名、把官方域名塞进路径或参数、js 协议、无法解析的字符串

测试基建：`vitest` + `vitest.config.ts`（必须 `define __API_ORIGIN__`，
否则导入 `api/client.ts` 直接 ReferenceError——这个坑已经踩过）。

### 4.2 浏览器端：`scripts/check-setup-guide.py` → PASS

全新 profile（等于首次安装）下：进的是向导不是设置框、三步齐全、
不暴露任何开发者参数、假 Key 明确报「API Key 无效」且**没有写进 localStorage**、
控制台除预期 401 外无错误。

### 4.3 真机：`scripts/device-check-balance.py` → PASS

- 设置里余额显示为 `¥8.52`（真实余额），未卡在加载态，有充值入口
- 点「充值」→ 前台变成 `com.vivo.browser`（系统浏览器真的被拉起）
- 返回 App 后余额仍在显示，`更新于` 时间戳刷新

### 4.4 真机：`scripts/device-check-setup-guide.py` → PASS

做法是临时把 Key 从 localStorage 移除 → 重载 → 截图 → **原样写回**（全程不打印 Key，
用 try/finally 保证一定恢复）。结果：
向导在真机上正常渲染、三步说明齐全、「前往创建密钥」能拉起系统浏览器、
恢复后回到聊天界面且 Key 与原来一致。

截图：`.verify/p1-device/{4-guide-device,1-account-panel}.png`

## 5. 这一轮**没做**的（留给下一轮）

| 项 | 为什么推迟 |
|---|---|
| Key 从 localStorage 移到 Android Keystore | 迁移写错会让用户丢 Key，风险最高，单独一轮做并单独验证 |
| 401 时自动引导到「换 Key」 | 需要和现有错误提示串起来，属于 P1 收尾 |
| 「导入旧聊天」做成向导里的完整分支 | 现在向导里只是入口按钮，点击打开设置的数据管理 |

## 6. 已知局限

- 余额只在打开设置/点刷新/切回 App 时更新，聊天过程中不会自动变（这是设计，不是 bug）。
- `--dsw-alias-bg-layer-1` 这类**不存在**的主题变量会静默失效（CSS 不报错），
  写新样式时只能用 `theme.css` 里真实存在的名字；本项目里可用的层级色是
  `bg-base` / `bg-layer-2` / `bg-layer-3`，边框是 `border-l2`。
