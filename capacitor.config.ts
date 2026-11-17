/**
 * Capacitor 配置：把 src/ 打出的静态站点（dist/）包进 Android WebView。
 *
 * 关键约束（改之前先读 docs/code-map.md 与 docs/p0-findings.md）：
 * - webDir 必须与 rspack.config.ts 的 output.path 一致（dist/），否则 cap sync 拷不到资源。
 * - 不设置 server.url，生产包禁止从远端加载页面（否则等于把用户 Key 交给任意页面）。
 * - androidScheme 保持默认 https，WebView 的 origin 为 https://localhost，
 *   已实测 DeepSeek API 会反射该 Origin 且允许携带凭证（见 docs/p0-findings.md 2.4）。
 */
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.dsecho.app',
  appName: 'DS Echo',
  webDir: 'dist',
  android: {
    // 允许 WebView 使用 http 明文仅限调试期；正式版资源走 app 内置，不涉及明文流量。
    allowMixedContent: false,
  },
}

export default config
