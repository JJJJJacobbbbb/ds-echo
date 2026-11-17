# API Key 的存储（P1 收尾）

## 之前的问题

上游把 Key 明文存在 WebView 的 localStorage（`chat-demo:api-key`）。
这条链路在 Android 上落成 leveldb 文件，任何能接触应用数据的途径都能读到，
包括：root 设备、adb 备份、以及**debug 包开放的 WebView 调试端口**。

## 现在怎么做

| 环境 | 存储位置 | 说明 |
|---|---|---|
| Android（生产） | **Android Keystore**（AES-GCM，密钥材料由硬件保护） | 通过 `capacitor-secure-storage-plugin` 读写 |
| 浏览器（调试） | localStorage | 没有 Keystore，界面会明确标注"仅调试" |

选型比较：

- `@capacitor/preferences`（官方）：**明文 XML**，不能存密钥
- `capacitor-secure-storage-plugin`：✅ 采用（周下载 26 万，只依赖 `@capacitor/core`，Keystore 实现短便于审计）
- `@aparajita/capacitor-secure-storage`：也可用（周下载 59 万），但要额外拉 3 个 peer 依赖

## 迁移顺序（这段是重点）

旧版升级到新版时，必须把明文搬进 Keystore 再删掉旧值。顺序错一步就可能丢 Key：

```
1. 读安全存储 —— 已有值？ → 以它为准，顺手清掉残留明文
2. 没有？ 读旧 localStorage 明文
3. 都没有 → 结束（用户需要重新连接）
4. 有明文 → 写安全存储
5. **读回校验，内容一致** → 才删除明文
6. 写失败 / 校验不一致 → 抛错，明文保留（下次启动重试）
```

第 6 条是刻意的：宁可让明文多留一轮，也不能出现"新的没写进去、旧的已经删了"。

## 代码结构

| 文件 | 职责 |
|---|---|
| `src/services/secureKey.ts` | 只做"读写一个字符串"，按平台分流，不判断迁移 |
| `src/services/secureKeyMigration.ts` | 纯逻辑 + 依赖注入的迁移器，可单测 |
| `src/services/settings.ts` | `hydrateCredentials()` 启动时迁移并加载；`setApiKey()` 写安全存储 |
| `src/app/App.tsx` | 密钥加载完成前不渲染，避免闪一下连接向导 |
| `components/settings/AccountPanel.tsx` | 显示「密钥存储：系统安全存储（Keystore）」 |

## 验证

### 单元测试（`tests/secure-key-migration.test.ts`，6 条）

- 只有明文 → 搬进安全存储并删除明文
- 安全存储已有值 → 以它为准，清掉残留明文
- 安全存储已有值且无明文 → 什么都不做
- 两边都没有 → null
- **写入失败 → 抛错且明文保留**
- **读回不一致 → 抛错且明文保留**

### 真机（v0.2.0，用户本人确认）

1. 升级后不用重新输入 Key，余额可直接刷新 → 迁移成功
2. 设置里显示「系统安全存储（Keystore）」
3. 强杀进程后重开，Key 仍在 → 确实落在 Keystore，不是只在内存

### 验证边界（诚实记录）

"localStorage 里的明文已被删除"这一条**没有直接读取验证**：
release 包关闭了 WebView 调试端口，读不到 WebView 的 leveldb。
间接证据是：迁移成功 + 进程重启后 Key 仍可用（若仅存在于 localStorage，代码里已不再读它）。
要拿铁证需要装 debug 包（签名不同、需卸载，会丢数据），代价大于收益，暂不做。
