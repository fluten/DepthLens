/**
 * DragHandle.test.tsx — Sheet 拖拽手柄组件单测
 *
 * 测试范围:
 * - 渲染为 div, 默认 className 包含 w-10 h-1 rounded-full + token 颜色
 * - aria-hidden 为 true (装饰性, 屏幕阅读器跳过)
 * - 自定义 className 追加在基础样式之后
 * - HTML 属性 / data-* 透传
 * - forwardRef 转发到底层 div
 */
import { describe, it, expect } from 'vitest'
import { act, createRef, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DragHandle } from '../DragHandle'

// ── 渲染助手 (与 GlassPanel.test 相同模式) ────────────────────────────────

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

// ── 渲染 + 默认样式 ───────────────────────────────────────────────────────

describe('DragHandle — 默认渲染', () => {
  it('渲染为 div', async () => {
    const m = await mount(createElement(DragHandle))
    const el = m.container.firstChild as HTMLElement
    expect(el.tagName).toBe('DIV')
    m.unmount()
  })

  it('className 包含 40×4px 尺寸 (w-10 h-1)', async () => {
    const m = await mount(createElement(DragHandle))
    const el = m.container.firstChild as HTMLElement
    expect(el.className).toContain('w-10')
    expect(el.className).toContain('h-1')
    m.unmount()
  })

  it('className 包含圆角 (rounded-full)', async () => {
    const m = await mount(createElement(DragHandle))
    const el = m.container.firstChild as HTMLElement
    expect(el.className).toContain('rounded-full')
    m.unmount()
  })

  it('className 引用 --text-tertiary token (不硬编码颜色)', async () => {
    const m = await mount(createElement(DragHandle))
    const el = m.container.firstChild as HTMLElement
    expect(el.className).toContain('bg-[var(--text-tertiary)]')
    m.unmount()
  })

  it('默认水平居中 (mx-auto)', async () => {
    const m = await mount(createElement(DragHandle))
    const el = m.container.firstChild as HTMLElement
    expect(el.className).toContain('mx-auto')
    m.unmount()
  })

  it('aria-hidden=true (纯装饰, 屏幕阅读器跳过)', async () => {
    const m = await mount(createElement(DragHandle))
    const el = m.container.firstChild as HTMLElement
    expect(el.getAttribute('aria-hidden')).toBe('true')
    m.unmount()
  })
})

// ── className 拼接 ────────────────────────────────────────────────────────

describe('DragHandle — className 拼接', () => {
  it('自定义 className 追加在基础样式之后', async () => {
    const m = await mount(
      createElement(DragHandle, { className: 'mt-3' })
    )
    const el = m.container.firstChild as HTMLElement
    // 基础类还在
    expect(el.className).toContain('w-10')
    expect(el.className).toContain('h-1')
    // 自定义类也在
    expect(el.className).toContain('mt-3')
    // 顺序: 基础类在前
    const idxBase = el.className.indexOf('w-10')
    const idxCustom = el.className.indexOf('mt-3')
    expect(idxBase).toBeLessThan(idxCustom)
    m.unmount()
  })

  it('未传 className 时不留尾部空格', async () => {
    const m = await mount(createElement(DragHandle))
    const el = m.container.firstChild as HTMLElement
    expect(el.className.endsWith(' ')).toBe(false)
    expect(el.className.startsWith(' ')).toBe(false)
    m.unmount()
  })
})

// ── 属性透传 ────────────────────────────────────────────────────────────────

describe('DragHandle — 属性透传 + ref', () => {
  it('data-* / id 透传到 div', async () => {
    const m = await mount(
      createElement(DragHandle, {
        id: 'sheet-handle',
        'data-testid': 'handle',
      })
    )
    const el = m.container.firstChild as HTMLElement
    expect(el.id).toBe('sheet-handle')
    expect(el.getAttribute('data-testid')).toBe('handle')
    m.unmount()
  })

  it('forwardRef 指向底层 div', async () => {
    const ref = createRef<HTMLDivElement>()
    const m = await mount(createElement(DragHandle, { ref }))
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('DIV')
    expect(ref.current?.className).toContain('w-10')
    m.unmount()
  })
})
