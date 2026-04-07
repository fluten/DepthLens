import { defineConfig } from 'vitest/config'

/**
 * Vitest 配置 — 与 vite.config.ts 分离
 *
 * 为什么不复用 vite.config.ts:
 * - vite.config.ts 是 production / dev server 的配置, 不应该混入 test 字段
 * - 分离后跑 `pnpm build` 不会被测试相关的 import 影响
 *
 * 测试范围: lib/ 层全部纯函数 + image.ts 的 DOM 部分通过 happy-dom 模拟
 */
export default defineConfig({
  test: {
    // happy-dom 比 jsdom 快约 2-3x, 对 DepthLens lib 层用到的 API
    // (createImageBitmap / Canvas / atob) 支持都足够
    environment: 'happy-dom',

    // happy-dom 不实现 ImageData, 在 setup 中 polyfill
    setupFiles: ['./src/lib/__tests__/setup.ts'],

    include: ['src/**/*.test.ts'],

    // 不需要 DOM 的纯函数测试可以用 node env, 但全局用 happy-dom 更省心
    globals: false,

    // 控制台输出更紧凑
    reporters: ['default'],
  },
})
