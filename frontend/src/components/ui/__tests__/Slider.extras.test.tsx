/**
 * Slider.extras.test.tsx — Slider 视觉/可访问性扩展单测
 *
 * 拆分原因 (CLAUDE.md ≤ 300 行):
 * - Slider.test.tsx: 核心受控行为 + --slider-fill 边界
 * - 本文件: label / displayValue / showTicks / showRange / disabled / a11y
 *   / forwardRef / className 透传
 */
import { describe, it, expect } from 'vitest'
import { createRef, createElement } from 'react'
import { Slider } from '../Slider'
import { mount } from './_mountHelper'

function getInput(container: HTMLDivElement): HTMLInputElement {
  const input = container.querySelector('input[type="range"]')
  if (!input) throw new Error('找不到 range input')
  return input as HTMLInputElement
}

// ── label / displayValue 渲染 ─────────────────────────────────────────────

describe('Slider — label / displayValue', () => {
  it('传 label → 渲染 label 元素 + 关联 input', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        label: 'OVERLAY ALPHA',
      })
    )
    const labelEl = m.container.querySelector('label')
    expect(labelEl).not.toBeNull()
    expect(labelEl?.textContent).toBe('OVERLAY ALPHA')
    // htmlFor 与 input id 匹配
    const input = getInput(m.container)
    expect(labelEl?.getAttribute('for')).toBe(input.id)
    m.unmount()
  })

  it('未传 label → 不渲染 label 元素', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        'aria-label': 'alpha',
      })
    )
    expect(m.container.querySelector('label')).toBeNull()
    m.unmount()
  })

  it('未传 displayValue → 自动用 toFixed(2)', async () => {
    const m = await mount(
      createElement(Slider, { value: 0.625, onChange: () => {}, label: 'X' })
    )
    expect(m.container.textContent).toContain('0.63')
    m.unmount()
  })

  it('传 displayValue 字符串 → 原样渲染', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        label: 'X',
        displayValue: '50 %',
      })
    )
    expect(m.container.textContent).toContain('50 %')
    m.unmount()
  })

  it('displayValue=null → 不渲染数值, 只渲染 label', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        label: 'X',
        displayValue: null,
      })
    )
    // header 仍存在 (因为有 label), 但不应该有 0.50
    expect(m.container.textContent).not.toContain('0.50')
    expect(m.container.textContent).toContain('X')
    m.unmount()
  })
})

// ── showTicks / showRange ────────────────────────────────────────────────

describe('Slider — showTicks / showRange', () => {
  it('showTicks=true → 渲染 11 个 tick mark div', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        showTicks: true,
      })
    )
    // 找到所有 width=1px 的 tick div
    const ticks = m.container.querySelectorAll('[aria-hidden="true"] > .w-px')
    expect(ticks.length).toBe(11)
    m.unmount()
  })

  it('showRange=true (无 ticks) → 渲染 MIN/MAX 标签', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        min: 0,
        max: 1,
        showRange: true,
      })
    )
    expect(m.container.textContent).toContain('MIN 0.00')
    expect(m.container.textContent).toContain('MAX 1.00')
    m.unmount()
  })

  it('showTicks=true 时即使传 showRange=true 也不渲染 MIN/MAX (互斥)', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        showTicks: true,
        showRange: true,
      })
    )
    expect(m.container.textContent).not.toContain('MIN')
    expect(m.container.textContent).not.toContain('MAX')
    m.unmount()
  })

  it('两个都不传 → 只渲染 input + 可选 header', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        'aria-label': 'x',
      })
    )
    expect(m.container.querySelectorAll('.w-px').length).toBe(0)
    expect(m.container.textContent).not.toContain('MIN')
    m.unmount()
  })
})

// ── disabled / a11y / ref ─────────────────────────────────────────────────

describe('Slider — disabled / a11y / forwardRef', () => {
  it('disabled=true → input.disabled', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        disabled: true,
      })
    )
    expect(getInput(m.container).disabled).toBe(true)
    m.unmount()
  })

  it('未传 label, 但传 aria-label → input 拿到 aria-label', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        'aria-label': 'overlay alpha',
      })
    )
    expect(getInput(m.container).getAttribute('aria-label')).toBe('overlay alpha')
    m.unmount()
  })

  it('传 label → input.aria-label fallback 到 label 文字', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        label: 'OVERLAY ALPHA',
      })
    )
    expect(getInput(m.container).getAttribute('aria-label')).toBe('OVERLAY ALPHA')
    m.unmount()
  })

  it('forwardRef 指向底层 input', async () => {
    const ref = createRef<HTMLInputElement>()
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        ref,
        label: 'x',
      })
    )
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('INPUT')
    expect(ref.current?.type).toBe('range')
    m.unmount()
  })

  it('className 透传到外层 wrapper div', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 0.5,
        onChange: () => {},
        className: 'mt-4',
      })
    )
    const wrapper = m.container.firstChild as HTMLElement
    expect(wrapper.className).toContain('mt-4')
    m.unmount()
  })
})
