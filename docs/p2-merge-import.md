# P2：非破坏性合并导入

> 记录 2026-11-18 这一轮的改造：把「导入 = 覆盖全部本地记录」改成「导入 = 单事务合并」。
> 对应计划书 P2 阶段与 T07–T09。

## 1. 为什么必须改

改造前上游的语义是**替换**：`db.ts` 的 `commitStaging()` 在事务里对 `sessions` / `files`
先 `clear()` 再逐条 put。用户在手机上聊了新内容，只要再导入一次旧 ZIP，新内容就没了。
计划书把这一条列为高危风险，验收要求是"已有本地聊天不丢失"。

## 2. 改成了什么

导入变成两步，中间有预览：

```
选择 ZIP
  ├─ checkArchiveFormat     校验 ZIP 与格式版本（v3）
  ├─ fingerprintFile        计算 SHA-256 指纹（>64MB 拒绝）
  ├─ importArchive          流式写入 sessionsStaging / filesStaging（不碰正式数据）
  └─ previewStaging         统计：会话数 / 重复数 / 附件数 / 消息数
        ↓ 用户看到「将导入 N 个，跳过 M 个」后确认
  └─ mergeStaging           单事务：按 ID 去重写入 → 搬附件 → 清暂存
        ↓ 取消
     clearStaging           直接丢弃暂存，正式数据从未被触碰
```

### 去重规则（`src/services/chat/mergePlan.ts`，纯函数）

- **本地已有同 ID 的会话 → 跳过**，保留本地那份（用户可能已在手机上继续聊过）
- **不按归档指纹一票否决**：用户删掉某会话后，仍应能用同一个 ZIP 把它导回来
- 归档内部同一 ID 出现两次 → 只导入一次

### 导入注册表（`importRegistry`，DB 版本 11 → 12）

记录 `归档指纹 + 源会话 ID → 本地会话 ID + 导入时间`。**只用于溯源**，不参与是否允许导入的判断。
（理由同上：用指纹拦死会让"删了再导入"永远做不到。）

## 3. 顺带加固的 ZIP 防护

`importArchive` 里逐条累计并卡三个上限，超限立即失败（此时正式数据还没被碰过）：

| 限制 | 值 | 为什么 |
|---|---|---|
| 条目数 | 20 000 | 防止几十万个空条目拖死解析 |
| 解压后总体积 | 512 MB | 防止 WebView OOM |
| 解压/压缩 比 | 200 倍 | 正常聊天归档约 2~5 倍，200 倍以上是 zip bomb 特征 |

文件选择本身仍然只做第一道筛（`isZipFile`），真正的判断在读取条目时做。

## 4. 验证

### 4.1 单元测试 `pnpm test` → 23 个用例

新增 `tests/merge-plan.test.ts`（8 个），逐条对应验收要求：
空归档、全新增、同包两次导入、本地已有不被覆盖、本地独有会话不受影响、
归档内重复 ID、顺序保留、全部重复。全部通过。

### 4.2 端到端 `scripts/check-merge-import.py` → PASS

在浏览器里跑真实数据（合并逻辑完全在页面内，与 WebView 是同一份代码）：

| 场景 | 结果 |
|---|---|
| 导入真实归档 | 预览 77 新 / 0 跳过 → 77 会话入库，注册表 77 条 |
| 导入"只含 1 个新会话"的归档 | 78 会话（**合并**，不是替换成 1） |
| 再次导入同一真实归档 | 预览 0 新 / 77 跳过，按钮禁用，78 不变（合成会话仍在） |
| 导入损坏 ZIP | 报"导入失败"，会话数仍 78 |

测试包由 `scripts/make-test-archive.py` 生成（真实归档里复制 1 个会话并换新 ID）。

### 4.3 真机 `vivo V2309A / Android 16`

| 项 | 结果 |
|---|---|
| 系统文件选择器 | 点「上传」→ `com.android.documentsui` 真的打开，能按文件名搜到 ZIP |
| 预览弹窗 | 显示「将导入 1 个会话，跳过 0 个本地已有的；含附件 0 个、消息 2 条。已有会话不会被覆盖或删除。」 |
| 合并结果 | 设备会话数 **77 → 78**，导入注册表 1 条，提示「已导入 1 个会话」 |
| 导入后续聊 | 打开导入的会话 → 发「只回复两个字：收到」→ 收到「收到」 |
| 清理 | 测试会话已删除，设备恢复 77 会话 |

截图：`.verify/p2-device/{10-downloads,12-search,14-preview,16-opened}.png`

## 5. 已知限制

- 重复判定只看**会话 ID**。同一段对话如果被导出两次且 ID 变了，会被当成两条不同会话导入。
- 归档内部的**分支历史**会完整保留，但"同一会话的本地版本比归档新"这种冲突不做合并，
  一律保留本地（这是首版规则，将来可加"按消息时间取并集"）。
- 附件按会话引用搬运；被跳过会话的图片不会落库（避免白占空间），
  所以同一个图片若只被跳过会话引用，再导入时不会重复写。
- 导入注册表目前只写不读，等将来做"来源可追溯/冲突提示"时才会用到。

## 6. 改动清单

| 文件 | 改动 |
|---|---|
| `src/services/chat/mergePlan.ts`（新） | 去重规则纯函数 |
| `src/services/chat/history/archiveFingerprint.ts`（新） | SHA-256 指纹 + 体积上限 |
| `src/services/chat/db.ts` | DB 版本 12；`importRegistry` 表；`previewStaging` / `mergeStaging`（不 clear） |
| `src/services/chat/store.ts` | `mergeHistory`：不取消生成、不清草稿、不重置当前会话 |
| `src/services/chat/backup.ts` | `stageHistoryImport` / `commitHistoryImport` / `cancelHistoryImport` |
| `src/services/chat/history/importArchive.ts` | 条目数/总体积/膨胀比三重上限 |
| `src/components/settings/SettingsDialog.tsx` | 两阶段导入 + 预览弹窗 + 结果提示 |
| `src/i18n/{zh,en}.ts` | 文案从"覆盖"改为"并入"，新增预览与结果提示 |
| `scripts/{make-test-archive,check-merge-import}.py` | 测试包生成与端到端脚本 |
