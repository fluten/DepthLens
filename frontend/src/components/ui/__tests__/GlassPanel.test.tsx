/**
 * GlassPanel.test.tsx — 三级玻璃面板组件单测
 *
 * 测试范围:
 * - 三档 variant 各自渲染对应的 .glass-* className
 * - 自定义 className 拼接在玻璃 class 之后 (不覆盖)
 * - children 透传
 * - HTMLAttributes 透传 (id, data-*, onClick)
 * - forwardRef 转发到底层 div
 *
 * 测试策略 (与 hooks/__tests__ 一致):
 * - 不引入 @testing-library/react. 用 React 19 act + createRoot 手动渲染,
 *   通过 container.querySelector / container.firstChild 断言 DOM
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createRef, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GlassPanel, type GlassVariant } from '../GlassPanel'

// ── 渲染助手 ────────────────────────────────────────────────────────────────

interface Mounted {
  container: HTMLDivElement
  root: Root
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
    root: root!,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

// ── variant → className ───────────────────────────────────────────────────

describe('GlassPanel — variant 映射', () => {
  it.each<[GlassVariant, string]>([
    ['heavy', 'glass-heavy'],
    ['medium', 'glass-medium'],
    ['light', 'glass-light'],
  ])('variant="%s" → className 包含 "%s"', async (variant, expectedClass) => {
    const m = await mount(
      createElement(GlassPanel, { variant }, 'content')
    )
    const div = m.container.firstChild as HTMLDivElement
    expect(div.tagName).toBe('DIV')
    expect(div.className).toContain(expectedClass)
    m.unmount()
  })

  it('三档 variant className 互不重叠', async () => {
    const heavy = await mount(createElement(GlassPanel, { variant: 'heavy' }))
    const medium = await mount(createElement(GlassPanel, { variant: 'medium' }))
    const light = await mount(createElement(GlassPanel, { variant: 'light' }))

    const heavyCls = (heavy.container.firstChild as HTMLDivElement).className
    const mediumCls = (medium.container.firstChild as HTMLDivElement).className
    const lightCls = (light.container.firstChild as HTMLDivElement).className

    expect(heavyCls).not.toContain('glass-medium')
    expect(heavyCls).not.toContain('glass-light')
    expect(mediumCls).not.toContain('glass-heavy')
    expect(mediumCls).not.toContain('glass-light')
    expect(lightCls).not.toContain('glass-heavy')
    expect(lightCls).not.toContain('glass-medium')

    heavy.unmount()
    medium.unmount()
    light.unmount()
  })
})

// ── className 拼接 ────────────────────────────────────────────────────────

describe('GlassPanel — className 拼接', () => {
  it('自定义 className 追加在玻璃 class 之后', async () => {
    const m = await mount(
      createElement(GlassPanel, {
        variant: 'heavy',
        className: 'fixed top-4 left-1/2',
      })
    )
    const div = m.container.firstChild as HTMLDivElement
    expect(div.className).toBe('glass-heavy fixed top-4 left-1/2')
    m.unmount()
  })

  it('未传 className 时只输出玻璃 class (不留尾部空格)', async () => {
    const m = await mount(createElement(GlassPanel, { variant: 'medium' }))
    const div = m.container.firstChild as HTMLDivElement
    // 严格等于 — 没有尾部空格, 没有 undefined 字符串
    expect(div.className).toBe('glass-medium')
    m.unmount()
  })

  it('className=空字符串 也不留尾部空格', async () => {
    const m = await mount(
      createElement(GlassPanel, { variant: 'light', className: '' })
    )
    const div = m.container.firstChild as HTMLDivElement
    // 空字符串走 falsy 分支, 等同于不传
    expect(div.className).toBe('glass-light')
    m.unmount()
  })
})

// ── children + props 透传 ─────────────────────────────────────────────────

describe('GlassPanel — children / props 透传', () => {
  it('children 渲染为子节点', async () => {
    const m = await mount(
      createElement(
        GlassPanel,
        { variant: 'heavy' },
        createElement('span', { 'data-testid': 'child' }, 'hello')
      )
    )
    const child = m.container.querySelector('[data-testid="child"]')
    expect(child).not.toBeNull()
    expect(child?.textContent).toBe('hello')
    m.unmount()
  })

  it('id / data-* / aria-* 等 HTML 属性透传到 div', async () => {
    const m = await mount(
      createElement(GlassPanel, {
        variant: 'medium',
        id: 'hud-panel',
        'data-testid': 'hud',
        'aria-label': '实时指标面板',
      })
    )
    const div = m.container.firstChild as HTMLDivElement
    expect(div.id).toBe('hud-panel')
    expect(div.getAttribute('data-testid')).toBe('hud')
    expect(div.getAttribute('aria-label')).toBe('实时指标面板')
    m.unmount()
  })

  it('onClick 事件透传 + 触发', async () => {
    const onClick = vi.fn()
    const m = await mount(
      createElement(GlassPanel, { variant: 'heavy', onClick }, 'click me')
    )
    const div = m.container.firstChild as HTMLDivElement
    await act(async () => {
      div.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
    m.unmount()
  })
})

// ── forwardRef ─────────────────────────────────────────────────────────────

describe('GlassPanel — forwardRef', () => {
  it('ref 指向底层 div 元素', async () => {
    const ref = createRef<HTMLDivElement>()
    const m = await mount(
      createElement(GlassPanel, { variant: 'heavy', ref }, 'with ref')
    )
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('DIV')
    expect(ref.current?.className).toContain('glass-heavy')
    m.unmount()
  })
})
