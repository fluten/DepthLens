/**
 * ToastContainer.test.tsx — 全局 Toast 订阅与堆叠组件单测
 *
 * 测试范围:
 * - 订阅/反订阅 toast service
 * - 收到消息后渲染对应数量的 Toast
 * - 4 种 variant 都能渲染
 * - 用户点关闭 → 从列表移除
 * - 非 error 类型 durationMs 后自动消失
 * - error 类型 sticky (durationMs=undefined → 不自动消失)
 * - mount 容器有正确的 fixed top + z-toast 类
 *
 * 注意 Framer Motion AnimatePresence:
 * - 退场动画在 happy-dom 里没有真实 animation 支持, exit 动画基本是 0 时长
 * - 但 React state 删除 → 节点最终会从 DOM 消失, 我们能验证最终态
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Mock framer-motion: 在 happy-dom 测试环境下, AnimatePresence 会持有 exit
// 动画导致节点不及时释放, 测试断言"消息消失了"会失败. 用 passthrough 让
// 动画在测试中变成 0 时长 (实际生产代码完全不动).
//
// motion 元素需要把 framer-motion 专属 props (initial/animate/exit/transition
// /whileHover 等) 从最终 DOM 透传里剔掉, 否则 React 会报 "unknown DOM
// attribute". 用一个集合过滤而不是 destructure (避开 ESLint no-unused-vars).
const MOTION_ONLY_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileInView',
  'layout',
  'layoutId',
  'drag',
  'dragConstraints',
  'variants',
])
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        // motion.div / motion.span / motion.button 等任意标签
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ({ children, ...allRest }: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cleanProps: Record<string, any> = {}
          for (const key in allRest) {
            if (!MOTION_ONLY_PROPS.has(key)) cleanProps[key] = allRest[key]
          }
          return createElement(prop, cleanProps, children)
        }
      },
    }
  ),
}))

import { ToastContainer } from '../ToastContainer'
// 导入 toast 单例供集成测试用
import { toast as defaultToast } from '../../../services/toast'

// ── 渲染助手 ────────────────────────────────────────────────────────────────

async function mount(node: React.ReactElement): Promise<{
  container: HTMLDivElement
  unmount: () => void
}> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root
  await act(async () => {
    root = createRoot(container)
    root.render(node)
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

// 让测试间不串扰
beforeEach(() => {
  defaultToast._resetForTests()
  vi.useRealTimers()
})

// ── 容器布局 ────────────────────────────────────────────────────────────────

describe('ToastContainer — 容器', () => {
  it('渲染 fixed top-center + z-toast 容器', async () => {
    const m = await mount(createElement(ToastContainer))
    const root = m.container.firstChild as HTMLElement
    expect(root.tagName).toBe('DIV')
    // fixed 定位 + 顶部 + 居中
    expect(root.className).toContain('fixed')
    expect(root.className).toContain('top-4')
    expect(root.className).toContain('left-1/2')
    expect(root.className).toContain('z-toast')
    // DESIGN.md §8: max-width 480px (本次合规修复)
    expect(root.className).toContain('max-w-[480px]')
    // 小屏左右安全边距
    expect(root.className).toContain('px-4')
    // 屏幕阅读器 region
    expect(root.getAttribute('role')).toBe('region')
    m.unmount()
  })

  it('初始状态: 无 toast → 容器内无 Toast 节点', async () => {
    const m = await mount(createElement(ToastContainer))
    const root = m.container.firstChild as HTMLElement
    expect(root.querySelectorAll('[role="status"], [role="alert"]').length).toBe(0)
    m.unmount()
  })
})

// ── 订阅 + 渲染 ────────────────────────────────────────────────────────────

describe('ToastContainer — 订阅 + 渲染', () => {
  it('mount 后向 toast service 注册了一个订阅者', async () => {
    expect(defaultToast.subscriberCount).toBe(0)
    const m = await mount(createElement(ToastContainer))
    expect(defaultToast.subscriberCount).toBe(1)
    m.unmount()
  })

  it('unmount 后取消订阅 (subscriberCount 回到 0)', async () => {
    const m = await mount(createElement(ToastContainer))
    expect(defaultToast.subscriberCount).toBe(1)
    m.unmount()
    expect(defaultToast.subscriberCount).toBe(0)
  })

  it('调 toast.success → 容器渲染一条 success Toast', async () => {
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.success('已加载')
    })
    expect(m.container.textContent).toContain('已加载')
    expect(m.container.querySelectorAll('[role="status"]').length).toBe(1)
    m.unmount()
  })

  it('调 toast.error → 容器渲染一条 error Toast (role=alert)', async () => {
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.error('显存不足')
    })
    expect(m.container.textContent).toContain('显存不足')
    expect(m.container.querySelectorAll('[role="alert"]').length).toBe(1)
    m.unmount()
  })

  it('连续 4 条不同 variant → 全部渲染', async () => {
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.success('S')
      defaultToast.info('I')
      defaultToast.warning('W')
      defaultToast.error('E')
    })
    expect(m.container.textContent).toContain('S')
    expect(m.container.textContent).toContain('I')
    expect(m.container.textContent).toContain('W')
    expect(m.container.textContent).toContain('E')
    // 3 条 status (success/info/warning) + 1 条 alert (error)
    expect(m.container.querySelectorAll('[role="status"]').length).toBe(3)
    expect(m.container.querySelectorAll('[role="alert"]').length).toBe(1)
    m.unmount()
  })
})

// ── 关闭按钮 ────────────────────────────────────────────────────────────────

describe('ToastContainer — 关闭', () => {
  it('点 toast 的关闭按钮 → 该 toast 从列表移除', async () => {
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.error('要点才会消失')
    })
    expect(m.container.querySelectorAll('[role="alert"]').length).toBe(1)

    const closeBtn = m.container.querySelector('button')
    expect(closeBtn).not.toBeNull()
    await act(async () => {
      closeBtn?.click()
    })

    expect(m.container.querySelectorAll('[role="alert"]').length).toBe(0)
    m.unmount()
  })

  it('多条 toast 中只关掉一条, 其他仍在', async () => {
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.error('A')
      defaultToast.error('B')
      defaultToast.error('C')
    })
    expect(m.container.querySelectorAll('[role="alert"]').length).toBe(3)

    // 关掉第一个
    const firstBtn = m.container.querySelector('button')
    await act(async () => {
      firstBtn?.click()
    })

    expect(m.container.querySelectorAll('[role="alert"]').length).toBe(2)
    m.unmount()
  })
})

// ── 自动消失 (durationMs) ─────────────────────────────────────────────────

describe('ToastContainer — 自动消失', () => {
  it('success 默认 4s 后自动消失', async () => {
    vi.useFakeTimers()
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.success('GO')
    })
    expect(m.container.querySelectorAll('[role="status"]').length).toBe(1)

    // 推进 4 秒
    await act(async () => {
      vi.advanceTimersByTime(4000)
    })
    expect(m.container.querySelectorAll('[role="status"]').length).toBe(0)
    m.unmount()
    vi.useRealTimers()
  })

  it('warning 默认 4s 后自动消失', async () => {
    vi.useFakeTimers()
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.warning('小心')
    })
    expect(m.container.querySelectorAll('[role="status"]').length).toBe(1)
    await act(async () => {
      vi.advanceTimersByTime(4000)
    })
    expect(m.container.querySelectorAll('[role="status"]').length).toBe(0)
    m.unmount()
    vi.useRealTimers()
  })

  it('error sticky → 4s 后仍在 (用户必须主动关)', async () => {
    vi.useFakeTimers()
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.error('显存不足')
    })
    expect(m.container.querySelectorAll('[role="alert"]').length).toBe(1)
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(m.container.querySelectorAll('[role="alert"]').length).toBe(1)
    m.unmount()
    vi.useRealTimers()
  })

  it('显式 durationMs → 自定义超时生效', async () => {
    vi.useFakeTimers()
    const m = await mount(createElement(ToastContainer))
    await act(async () => {
      defaultToast.info('快速', { durationMs: 500 })
    })
    expect(m.container.querySelectorAll('[role="status"]').length).toBe(1)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(m.container.querySelectorAll('[role="status"]').length).toBe(0)
    m.unmount()
    vi.useRealTimers()
  })
})
