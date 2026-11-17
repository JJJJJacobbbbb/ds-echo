import { defineConfig } from 'vitest/config'

/**
 * 单元测试配置。
 *
 * __API_ORIGIN__ 是 rspack 的 DefinePlugin 在构建时注入的全局量（见 rspack.config.ts），
 * 测试环境没有构建步骤，必须在这里显式给一个值，否则导入 api/client.ts 会直接抛
 * ReferenceError。用真实地址而不是假地址：测试要能反映生产环境的实际取值。
 */
export default defineConfig({
  define: {
    __API_ORIGIN__: JSON.stringify('https://api.deepseek.com'),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
