/**
 * Slider.test.tsx — Slider 核心 API 单测 (受控 / onChange / CSS 变量)
 *
 * 拆分原因 (CLAUDE.md ≤ 300 行):
 * - 本文件: 核心受控行为 + --slider-fill 边界
 * - Slider.extras.test.tsx: label / displayValue / showTicks / showRange
 *   / disabled / a11y / forwardRef
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createElement } from 'react'
import { Slider } from '../Slider'
import { mount } from './_mountHelper'

function getInput(container: HTMLDivElement): HTMLInputElement {
  const input = container.querySelector('input[type="range"]')
  if (!input) throw new Error('找不到 range input')
  return input as HTMLInputElement
}

// ── 受控值 + onChange ─────────────────────────────────────────────────────

describe('Slider — 受控值 / onChange', () => {
  it('value 透传到 input.value', async () => {
    const m = await mount(
      createElement(Slider, { value: 0.62, onChange: () => {} })
    )
    const input = getInput(m.container)
    expect(input.value).toBe('0.62')
    m.unmount()
  })

  it('input onChange → 调用 props.onChange, 参数为 number', async () => {
    const onChange = vi.fn<(v: number) => void>()
    const m = await mount(
      createElement(Slider, { value: 0.5, onChange, min: 0, max: 1, step: 0.01 })
    )
    const input = getInput(m.container)
    // React 19 对 <input type="range"> 的 onChange 实际监听 'input' 事件
    // (不是 'change'). 而且 React 通过 Object.defineProperty 拦截了 .value
    // 的 setter, 必须用 native setter 手动 set 才能让 React 看到新值.
    // 这是 @testing-library/user-event 内部也用的 trick.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    await act(async () => {
      nativeSetter?.call(input, '0.75')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(0.75)
    expect(typeof onChange.mock.calls[0]![0]).toBe('number')
    m.unmount()
  })

  it('min / max / step 透传到 input 属性', async () => {
    const m = await mount(
      createElement(Slider, {
        value: 5,
        onChange: () => {},
        min: 0,
        max: 10,
        step: 0.5,
      })
    )
    const input = getInput(m.container)
    expect(input.min).toBe('0')
    expect(input.max).toBe('10')
    expect(input.step).toBe('0.5')
    m.unmount()
  })

  it('未传 min/max/step 时使用默认 0/1/0.01', async () => {
    const m = await mount(
      createElement(Slider, { value: 0.3, onChange: () => {} })
    )
    const input = getInput(m.container)
    expect(input.min).toBe('0')
    expect(input.max).toBe('1')
    expect(input.step).toBe('0.01')
    m.unmount()
  })
})

// ── --slider-fill CSS 自定义属性 ──────────────────────────────────────────

describe('Slider — --slider-fill CSS 变量', () => {
  it('value=0.62, min=0, max=1 → --slider-fill: 62%', async () => {
    const m = await mount(
      createElement(Slider, { value: 0.62, onChange: () => {} })
    )
    const input = getInput(m.container)
    // happy-dom 把 inline style 存到 element.style.cssText
    // CSS 自定义属性需要通过 getPropertyValue 读
    const fill = input.style.getPropertyValue('--slider-fill')
    expect(fill).toBe('62%')
    m.unmount()
  })

  it('value=0, min=0, max=1 → --slider-fill: 0%', async () => {
    const m = await mount(
      createElement(Slider, { value: 0, onChange: () => {} })
    )
    const input = getInput(m.container)
    expect(input.style.getPropertyValue('--slider-fill')).toBe('0%')
    m.unmount()
  })

  it('value=1, min=0, max=1 → --slider-fill: 100%', async () => {
    const m = await mount(
      createElement(Slider, { value: 1, onChange: () => {} })
    )
    const input = getInput(m.container)
    expect(input.style.getPropertyValue('--slider-fill')).toBe('100%')
    m.unmount()
  })

  it('非默认范围 min=10, max=20, value=15 → 50%', async () => {
    const m = await mount(
      createElement(Slider, { value: 15, onChange: () => {}, min: 10, max: 20 })
    )
    const input = getInput(m.container)
    expect(input.style.getPropertyValue('--slider-fill')).toBe('50%')
    m.unmount()
  })

  it('value < min → 钳到 0%', async () => {
    const m = await mount(
      createElement(Slider, { value: -5, onChange: () => {}, min: 0, max: 1 })
    )
    const input = getInput(m.container)
    expect(input.style.getPropertyValue('--slider-fill')).toBe('0%')
    m.unmount()
  })

  it('value > max → 钳到 100%', async () => {
    const m = await mount(
      createElement(Slider, { value: 99, onChange: () => {}, min: 0, max: 1 })
    )
    const input = getInput(m.container)
    expect(input.style.getPropertyValue('--slider-fill')).toBe('100%')
    m.unmount()
  })

  it('NaN value → 0% (NaN 防御)', async () => {
    const m = await mount(
      createElement(Slider, { value: NaN, onChange: () => {} })
    )
    const input = getInput(m.container)
    expect(input.style.getPropertyValue('--slider-fill')).toBe('0%')
    m.unmount()
  })

  it('max <= min → 0% (无效范围防御)', async () => {
    const m = await mount(
      createElement(Slider, { value: 5, onChange: () => {}, min: 10, max: 10 })
    )
    const input = getInput(m.container)
    expect(input.style.getPropertyValue('--slider-fill')).toBe('0%')
    m.unmount()
  })
})
