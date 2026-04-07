/**
 * GlowButton.test.tsx — accent 渐变按钮组件单测
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createRef, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GlowButton } from '../GlowButton'

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

function getButton(container: HTMLDivElement): HTMLButtonElement {
  const btn = container.querySelector('button')
  if (!btn) throw new Error('找不到 button')
  return btn
}

// ── variant ────────────────────────────────────────────────────────────────

describe('GlowButton — variant', () => {
  it('默认 variant=primary → 套 .depth-glow-btn', async () => {
    const m = await mount(createElement(GlowButton, {}, 'PROCESS'))
    const btn = getButton(m.container)
    expect(btn.className).toContain('depth-glow-btn')
    expect(btn.className).not.toContain('depth-ghost-btn')
    m.unmount()
  })

  it('variant=ghost → 套 .depth-ghost-btn', async () => {
    const m = await mount(
      createElement(GlowButton, { variant: 'ghost' }, 'CANCEL')
    )
    const btn = getButton(m.container)
    expect(btn.className).toContain('depth-ghost-btn')
    expect(btn.className).not.toContain('depth-glow-btn')
    m.unmount()
  })

  it('两个 variant class 互不重叠', async () => {
    const primary = await mount(createElement(GlowButton, {}, 'A'))
    const ghost = await mount(
      createElement(GlowButton, { variant: 'ghost' }, 'B')
    )
    const pCls = getButton(primary.container).className
    const gCls = getButton(ghost.container).className
    expect(pCls).not.toContain('ghost')
    expect(gCls).not.toContain('glow')
    primary.unmount()
    ghost.unmount()
  })
})

// ── children + 图标插槽 ───────────────────────────────────────────────────

describe('GlowButton — children + 图标插槽', () => {
  it('children 渲染在按钮内', async () => {
    const m = await mount(
      createElement(GlowButton, {}, 'PROCESS DEPTH MAP')
    )
    expect(m.container.textContent).toContain('PROCESS DEPTH MAP')
    m.unmount()
  })

  it('children 包裹在 span 里 (便于和图标插槽区分)', async () => {
    const m = await mount(createElement(GlowButton, {}, 'GO'))
    const btn = getButton(m.container)
    const span = btn.querySelector('span')
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe('GO')
    m.unmount()
  })

  it('leadingIcon 渲染在文字之前', async () => {
    const m = await mount(
      createElement(
        GlowButton,
        {
          leadingIcon: createElement(
            'svg',
            { 'data-testid': 'lead', width: 14, height: 14 }
          ),
        },
        'GO'
      )
    )
    const btn = getButton(m.container)
    // 第一个子节点应该是 svg
    // SVG 命名空间下 tagName 保持小写, 不像 HTML 元素 (DIV/SPAN) 会大写
    expect((btn.firstChild as Element)?.tagName).toBe('svg')
    m.unmount()
  })

  it('trailingIcon 渲染在文字之后', async () => {
    const m = await mount(
      createElement(
        GlowButton,
        {
          trailingIcon: createElement(
            'svg',
            { 'data-testid': 'trail', width: 14, height: 14 }
          ),
        },
        'GO'
      )
    )
    const btn = getButton(m.container)
    // 最后一个子节点应该是 svg (SVG 命名空间下 tagName 保持小写)
    expect((btn.lastChild as Element)?.tagName).toBe('svg')
    m.unmount()
  })

  it('同时有 leadingIcon + 文字 + trailingIcon → 三段顺序正确', async () => {
    const m = await mount(
      createElement(
        GlowButton,
        {
          leadingIcon: createElement('span', { 'data-marker': 'lead' }, 'L'),
          trailingIcon: createElement('span', { 'data-marker': 'trail' }, 'T'),
        },
        'MID'
      )
    )
    const btn = getButton(m.container)
    const order = Array.from(btn.children).map((c) => c.textContent)
    expect(order).toEqual(['L', 'MID', 'T'])
    m.unmount()
  })
})

// ── HTML 属性透传 + 事件 ──────────────────────────────────────────────────

describe('GlowButton — HTML 属性透传', () => {
  it('onClick 触发', async () => {
    const onClick = vi.fn()
    const m = await mount(
      createElement(GlowButton, { onClick }, 'click me')
    )
    await act(async () => {
      getButton(m.container).click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
    m.unmount()
  })

  it('disabled 透传 → 真实 disabled 属性', async () => {
    const m = await mount(
      createElement(GlowButton, { disabled: true }, 'no')
    )
    expect(getButton(m.container).disabled).toBe(true)
    m.unmount()
  })

  it('disabled 时 click 不触发 onClick', async () => {
    const onClick = vi.fn()
    const m = await mount(
      createElement(GlowButton, { onClick, disabled: true }, 'no')
    )
    await act(async () => {
      getButton(m.container).click()
    })
    expect(onClick).not.toHaveBeenCalled()
    m.unmount()
  })

  it('默认 type=button (避免在 form 中误提交)', async () => {
    const m = await mount(createElement(GlowButton, {}, 'X'))
    expect(getButton(m.container).type).toBe('button')
    m.unmount()
  })

  it('显式 type=submit 透传', async () => {
    const m = await mount(
      createElement(GlowButton, { type: 'submit' }, 'X')
    )
    expect(getButton(m.container).type).toBe('submit')
    m.unmount()
  })

  it('aria-label / id / data-* 透传', async () => {
    const m = await mount(
      createElement(
        GlowButton,
        {
          id: 'process-btn',
          'aria-label': '处理深度图',
          'data-testid': 'process',
        },
        'X'
      )
    )
    const btn = getButton(m.container)
    expect(btn.id).toBe('process-btn')
    expect(btn.getAttribute('aria-label')).toBe('处理深度图')
    expect(btn.getAttribute('data-testid')).toBe('process')
    m.unmount()
  })
})

// ── className 拼接 + ref ──────────────────────────────────────────────────

describe('GlowButton — className / ref', () => {
  it('自定义 className 追加在 variant class 之后', async () => {
    const m = await mount(
      createElement(GlowButton, { className: 'mt-4 self-center' }, 'X')
    )
    const btn = getButton(m.container)
    expect(btn.className).toBe('depth-glow-btn mt-4 self-center')
    m.unmount()
  })

  it('forwardRef 指向底层 button', async () => {
    const ref = createRef<HTMLButtonElement>()
    const m = await mount(createElement(GlowButton, { ref }, 'X'))
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('BUTTON')
    m.unmount()
  })
})
