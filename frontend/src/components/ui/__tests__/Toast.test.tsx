/**
 * Toast.test.tsx — 单条 Toast 视觉组件单测
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createRef, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Toast } from '../Toast'
import type { ToastVariant } from '../../../lib/toastTypes'

// ── 渲染助手 ────────────────────────────────────────────────────────────────

interface Mounted {
  container: HTMLDivElement
  unmount: () => void
}

async function mount(node: React.ReactElement): Promise<Mounted> {
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

// ── 渲染基础 ────────────────────────────────────────────────────────────────

describe('Toast — 基础渲染', () => {
  it('渲染 message 文字', async () => {
    const m = await mount(
      createElement(Toast, { variant: 'info', message: '后端已连接' })
    )
    expect(m.container.textContent).toContain('后端已连接')
    m.unmount()
  })

  it('渲染玻璃 heavy 容器 (className 包含 glass-heavy)', async () => {
    const m = await mount(
      createElement(Toast, { variant: 'info', message: 'x' })
    )
    const root = m.container.firstChild as HTMLElement
    expect(root.className).toContain('glass-heavy')
    m.unmount()
  })

  it('渲染 toast 圆角 token (rounded-[var(--radius-toast)])', async () => {
    const m = await mount(
      createElement(Toast, { variant: 'info', message: 'x' })
    )
    const root = m.container.firstChild as HTMLElement
    // CLAUDE.md "禁止硬编码圆角" — 应当引用 token, 不写 12px 字面量.
    // --radius-toast 在 globals.css :root 定义为 12px (DESIGN.md §2 Toast 例外).
    expect(root.className).toContain('rounded-[var(--radius-toast)]')
    expect(root.className).not.toContain('rounded-[12px]')
    m.unmount()
  })
})

// ── 4 种 variant 颜色 + role ──────────────────────────────────────────────

describe('Toast — variant', () => {
  it.each<[ToastVariant, string, 'status' | 'alert']>([
    ['success', 'var(--success)', 'status'],
    ['info', 'var(--accent)', 'status'],
    ['warning', 'var(--warning)', 'status'],
    ['error', 'var(--error)', 'alert'],
  ])(
    'variant=%s → 色条用 %s, role=%s',
    async (variant, expectedColor, expectedRole) => {
      const m = await mount(
        createElement(Toast, { variant, message: 'x' })
      )
      const root = m.container.firstChild as HTMLElement

      // role 属性
      expect(root.getAttribute('role')).toBe(expectedRole)

      // aria-live (error → assertive, 其他 → polite)
      const expectedLive = expectedRole === 'alert' ? 'assertive' : 'polite'
      expect(root.getAttribute('aria-live')).toBe(expectedLive)

      // 色条 div 是第一个 absolute 子节点, 用 inline style 设了 backgroundColor
      const bar = root.querySelector('[aria-hidden="true"]') as HTMLElement
      expect(bar).not.toBeNull()
      // happy-dom inline style 直接读 element.style.backgroundColor
      expect(bar.style.backgroundColor).toBe(expectedColor)
      m.unmount()
    }
  )

  it('error variant 用 role=alert (阻断性, 屏幕阅读器立即朗读)', async () => {
    const m = await mount(
      createElement(Toast, { variant: 'error', message: 'OOM' })
    )
    const root = m.container.firstChild as HTMLElement
    expect(root.getAttribute('role')).toBe('alert')
    expect(root.getAttribute('aria-live')).toBe('assertive')
    m.unmount()
  })
})

// ── 关闭按钮 ────────────────────────────────────────────────────────────────

describe('Toast — onClose', () => {
  it('未传 onClose → 不渲染关闭按钮', async () => {
    const m = await mount(
      createElement(Toast, { variant: 'info', message: 'x' })
    )
    expect(m.container.querySelector('button')).toBeNull()
    m.unmount()
  })

  it('传 onClose → 渲染关闭按钮 + 点击触发回调', async () => {
    const onClose = vi.fn()
    const m = await mount(
      createElement(Toast, { variant: 'info', message: 'x', onClose })
    )
    const btn = m.container.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn?.getAttribute('aria-label')).toBe('关闭通知')

    await act(async () => {
      btn?.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    m.unmount()
  })
})

// ── 图标 ────────────────────────────────────────────────────────────────────

describe('Toast — 图标', () => {
  it('每种 variant 渲染一个 SVG 图标', async () => {
    for (const variant of ['success', 'info', 'warning', 'error'] as const) {
      const m = await mount(
        createElement(Toast, { variant, message: 'x' })
      )
      // SVG 元素 (排除关闭按钮的 svg, 因为这个测试没传 onClose)
      const svgs = m.container.querySelectorAll('svg')
      expect(svgs.length).toBe(1)
      m.unmount()
    }
  })

  it('有 onClose 时渲染 2 个 SVG (severity icon + close icon)', async () => {
    const m = await mount(
      createElement(Toast, {
        variant: 'info',
        message: 'x',
        onClose: () => {},
      })
    )
    const svgs = m.container.querySelectorAll('svg')
    expect(svgs.length).toBe(2)
    m.unmount()
  })
})

// ── className / ref / props 透传 ──────────────────────────────────────────

describe('Toast — 透传', () => {
  it('自定义 className 追加', async () => {
    const m = await mount(
      createElement(Toast, {
        variant: 'info',
        message: 'x',
        className: 'mt-2',
      })
    )
    const root = m.container.firstChild as HTMLElement
    expect(root.className).toContain('glass-heavy')
    expect(root.className).toContain('mt-2')
    m.unmount()
  })

  it('forwardRef 指向底层 div', async () => {
    const ref = createRef<HTMLDivElement>()
    const m = await mount(
      createElement(Toast, { variant: 'info', message: 'x', ref })
    )
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('DIV')
    m.unmount()
  })

  it('id / data-* 透传', async () => {
    const m = await mount(
      createElement(Toast, {
        variant: 'info',
        message: 'x',
        id: 'toast-1',
        'data-testid': 'toast',
      })
    )
    const root = m.container.firstChild as HTMLElement
    expect(root.id).toBe('toast-1')
    expect(root.getAttribute('data-testid')).toBe('toast')
    m.unmount()
  })
})
