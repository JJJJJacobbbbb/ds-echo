# 修导出：从「静默失效」到可用的备份

> 记录这一轮的 bug 复现、根因与验证。对应计划书 T12（基础备份和导出）与 P3 的文件能力。

## 1. 复现（先看到它坏，再改）

在真机上点「导出所有历史对话 → 下载」，等 18 秒：

- 没有分享面板
- 系统下载通知里没有记录
- `/sdcard/Download` 没有新文件
- 界面上连「正在导出 / 导出失败」都没有——**静默失效，没有任何反馈**

## 2. 根因

上游用的是浏览器那一套：

```ts
const url = URL.createObjectURL(blob)
const link = document.createElement('a')
link.href = url
link.download = name
link.click()
```

`<a download>` 在 Android WebView 里不会被当成下载动作处理：
WebView 没有实现真正的下载管理器，而 Capacitor 也没有拦截这个行为，
于是点击被丢弃——既不报错也不产生文件。

## 3. 修法

新增 `src/services/fileSave.ts`，按运行环境分流：

| 环境 | 做法 |
|---|---|
| 原生（Android） | `Filesystem.writeFile` 写到 App 缓存目录 → `Share.share` 唤起系统分享面板，由用户决定存到「文件」、发微信还是传网盘 |
| 浏览器（桌面调试） | 保留原来的 `<a download>` |

几个刻意的选择：

- **写缓存目录而不是公共下载目录**：Android 10+ 的 scoped storage 下直接写
  `Download/` 需要额外权限与 MediaStore 调用；分享面板让用户自己选位置，
  既不用申请权限，也符合"用户的文件由用户决定放哪"。
- **不加权限**：`Directory.Cache` 是应用私有目录，不需要任何运行时权限。
  现有 `file_paths.xml` 已包含 `cache-path`，FileProvider 能正确暴露给分享目标。
- **64 MB 上限**：写文件要把 Blob 转 base64（内存里多占约 1.3 倍），
  超大导出先拒绝并给出明确错误，而不是让 WebView OOM。
- **用户取消不算失败**：分享面板按返回时返回 `cancelled`，界面不报错。

界面文案从"下载"变成「已生成导出文件，请在弹窗里选择保存位置」。

## 4. 验证

### 4.1 真机（vivo V2309A / Android 16）

| 项 | 结果 |
|---|---|
| 点导出 | 1 秒内弹出系统分享面板（前台 `com.android.intentresolver`） |
| 分享内容 | `deepseek_data-2026-11-17.zip`，3.52 MB，标准 ZIP 图标 |
| 可选去向 | 发送给朋友 / 添加微信收藏 / 浏览器 / 保存到文件 … |
| 控制台错误 | 0 |

截图：`.verify/p3-export/2-share-sheet.png`

### 4.2 导出的文件本身是否合格

从 App 缓存把文件拉出来（`run-as ... cat`，必须二进制安全，不能用 PowerShell 的 `>`）后检查：

```
大小        3,515,797 字节（与设备上的文件一致）
ZIP 完整性  OK（testzip 无损坏条目）
条目        85 个
manifest    export_format_version: 3
会话 / 附件 77 / 6，索引 77 条
```

### 4.3 导出 → 导入 闭环

`scripts/check-export-roundtrip.py`：把导出的 ZIP 喂给全新的浏览器上下文，
走完整导入流程：

```
预览 77 个会话、0 跳过 → 导入后 sessions=77 files=6 → 无异常   PASS
```

这条闭环是备份功能唯一有意义的验收标准：**导出的东西必须能导回来**。

## 5. 已知限制

- 导出内容包含本地图片原件，所以比官方导出的 ZIP 大（本机 1.9 MB → 3.5 MB）。
- 文件写在 App 缓存目录，Android 可能在某些情况下清理缓存；
  用户应当在分享面板里真正保存到「文件」或网盘，而不是只关掉面板。
- 浏览器端仍是 `<a download>`，只用于桌面调试，不是正式交付路径。

## 6. 改动清单

| 文件 | 改动 |
|---|---|
| `src/services/fileSave.ts`（新） | 原生写文件 + 分享；浏览器兜底下载；体积上限 |
| `src/components/settings/SettingsDialog.tsx` | 导出改用 `saveFileForUser`，成功/取消/失败分别处理 |
| `src/i18n/{zh,en}.ts` | 新增 `historyExported` |
| `package.json` | 新增 `@capacitor/filesystem`、`@capacitor/share`（APK 6.17 → 9.21 MB） |
| `scripts/check-export-roundtrip.py`（新） | 导出→导入 闭环脚本 |
