import type { Config } from 'tailwindcss'

/**
 * DepthLens Tailwind 配置
 *
 * 设计 token 完全引用 src/styles/globals.css 中的 CSS Variables，
 * 与 docs/DESIGN.md §1 保持一致，由 Stitch 设计系统 (asset 106301548753211269) 锁定。
 *
 * 约定：
 * - 严禁在组件中硬编码颜色 / 圆角 / 间距 / 字号，必须通过本配置或 var(--xxx) 引用
 * - 所有数值通过 var() 引用 CSS 变量，便于运行时主题切换
 */
export default {
  darkMode: 'class', // DepthLens 永远暗色，但保留 class 钩子以便未来扩展
  content: ['./index.html', './src/**/*.{ts,tsx}'],

  // 强制保留：DepthLens 核心基础设施类，可能通过动态 className 拼接使用，
  // 必须避免被 purge 掉。
  // 注意：safelist 的 pattern regex 只对 Tailwind 已注册的 utility 类生效；
  //      glass-* 是我们在 globals.css @layer components 中自定义的类，
  //      因此必须显式列出，不能用正则。
  safelist: [
    'glass-heavy',
    'glass-heavy--sheet',
    'glass-medium',
    'glass-light',
    'viewport',
  ],

  theme: {
    extend: {
      colors: {
        // 背景
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',

        // 文字
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',

        // 强调色（全局唯一）
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-glow': 'var(--accent-glow)',

        // 功能色
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',

        // 边框（rgba 形式，写在 CSS 变量里以便 backdrop 上叠加）
        border: 'var(--border)',
        'border-hover': 'var(--border-hover)',
        'border-active': 'var(--border-active)',
      },

      borderRadius: {
        sm: 'var(--radius-sm)', //   6px button/input
        md: 'var(--radius-md)', //  10px card
        lg: 'var(--radius-lg)', //  16px panel
        xl: 'var(--radius-xl)', //  20px sheet 顶部
        full: 'var(--radius-full)',
      },

      spacing: {
        1: 'var(--space-1)', //  4px
        2: 'var(--space-2)', //  8px
        3: 'var(--space-3)', // 12px
        4: 'var(--space-4)', // 16px
        5: 'var(--space-5)', // 20px
        6: 'var(--space-6)', // 24px
        8: 'var(--space-8)', // 32px
        10: 'var(--space-10)', // 40px
      },

      fontFamily: {
        ui: 'var(--font-ui)',
        mono: 'var(--font-mono)',
      },

      // SPEC §3.5 — fontSize 必须连同 line-height 一起绑定，避免开发时漏写 leading
      fontSize: {
        xs: ['var(--text-xs)', { lineHeight: 'var(--leading-xs)' }], //   11 / 1.4
        sm: ['var(--text-sm)', { lineHeight: 'var(--leading-sm)' }], //   13 / 1.5
        base: ['var(--text-base)', { lineHeight: 'var(--leading-base)' }], // 15 / 1.6
        lg: ['var(--text-lg)', { lineHeight: 'var(--leading-lg)' }], //   18 / 1.4
        xl: ['var(--text-xl)', { lineHeight: 'var(--leading-xl)' }], //   24 / 1.3
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-2xl)' }], // 32 / 1.2
      },

      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        spring: 'var(--ease-spring)',
      },

      transitionDuration: {
        fast: 'var(--duration-fast)', // 120ms
        normal: 'var(--duration-normal)', // 200ms
        slow: 'var(--duration-slow)', // 400ms
      },

      // z-index 层级（与 DESIGN.md §9 一致）
      zIndex: {
        viewport: '0',
        vignette: '1',
        tooltip: '10',
        hud: '20',
        timeline: '30',
        modebar: '40',
        sheet: '50',
        toast: '60',
        drop: '100',
      },

      boxShadow: {
        // 玻璃面板内部光边 / 暗边（供组件按需组合）
        'glass-edge-top': 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'glass-edge-bottom': 'inset 0 -1px 0 rgba(0, 0, 0, 0.1)',

        // 强调色发光
        'accent-glow-sm': '0 0 8px var(--accent-glow)',
        'accent-glow-md': '0 0 20px var(--accent-glow)',
        'accent-glow-lg': '0 0 40px var(--accent-glow)',
      },

      backdropBlur: {
        glass: '24px',
        'glass-heavy': '40px',
        'glass-light': '12px',
      },

      backdropSaturate: {
        glass: '120',
        'glass-heavy': '130',
        'glass-light': '110',
      },
    },
  },
  plugins: [],
} satisfies Config
