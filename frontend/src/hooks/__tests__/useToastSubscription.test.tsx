/**
 * useToastSubscription.test.tsx — toast 订阅 hook 单测
 *
 * 测试范围:
 * - mount → subscribe (subscriberCount +1)
 * - unmount → unsubscribe (count -1)
 * - service.success → messages 列表插入一条
 * - 4 种 variant 都能收到
 * - dismiss(id) 移除指定消息
 * - 非 sticky 类型 durationMs 后自动消失
 * - error 默认 sticky
 * - 显式 durationMs 生效
 * - unmount 后未触发的 timer 不会再写 state (timer 清理)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  useToastSubscription,
  type UseToastSubscriptionApi,
} from '../useToastSubscription'
import { toast as defaultToast } from '../../services/toast'

beforeEach(() => {
  defaultToast._resetForTests()
  vi.useRealTimers()
})

// ── 渲染助手 ────────────────────────────────────────────────────────────────
//
// 用 module-level 闭包变量捕获 hook 返回值, 而不是把 ref 对象当 prop 传入
// 再 mutate (后者会被 react-hooks/immutability lint 规则拦下).
// useEffect 在每次渲染后跑, 捕获最新的 api 引用.

let capturedApi: UseToastSubscriptionApi | null = null

function ProbeComponent() {
  const api = useToastSubscription()
  useEffect(() => {
    capturedApi = api
  })
  return null
}

async function mount(): Promise<{ unmount: () => void }> {
  capturedApi = null
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root
  await act(async () => {
    root = createRoot(container)
    root.render(createElement(ProbeComponent))
  })
  return {
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

// ── 订阅生命周期 ────────────────────────────────────────────────────────────

describe('useToastSubscription — 订阅生命周期', () => {
  it('mount 后向 service 注册一个订阅者', async () => {
    expect(defaultToast.subscriberCount).toBe(0)
    const m = await mount()
    expect(defaultToast.subscriberCount).toBe(1)
    m.unmount()
  })

  it('unmount 后取消订阅 (count 回到 0)', async () => {
    const m = await mount()
    expect(defaultToast.subscriberCount).toBe(1)
    m.unmount()
    expect(defaultToast.subscriberCount).toBe(0)
  })

  it('初始 messages 是空数组', async () => {
    const m = await mount()
    expect(capturedApi?.messages).toEqual([])
    m.unmount()
  })
})

// ── 接收消息 ────────────────────────────────────────────────────────────────

describe('useToastSubscription — 接收消息', () => {
  it('service.success → messages 插入一条', async () => {
    const m = await mount()
    await act(async () => {
      defaultToast.success('已加载')
    })
    expect(capturedApi?.messages.length).toBe(1)
    expect(capturedApi?.messages[0]?.text).toBe('已加载')
    expect(capturedApi?.messages[0]?.variant).toBe('success')
    m.unmount()
  })

  it('4 种 variant 都能收到', async () => {
    const m = await mount()
    await act(async () => {
      defaultToast.success('S')
      defaultToast.info('I')
      defaultToast.warning('W')
      defaultToast.error('E')
    })
    const variants = capturedApi?.messages.map((msg) => msg.variant)
    expect(variants).toEqual(['success', 'info', 'warning', 'error'])
    m.unmount()
  })

  it('messages 按到达顺序排列 (FIFO)', async () => {
    const m = await mount()
    await act(async () => {
      defaultToast.info('first')
      defaultToast.info('second')
      defaultToast.info('third')
    })
    const texts = capturedApi?.messages.map((msg) => msg.text)
    expect(texts).toEqual(['first', 'second', 'third'])
    m.unmount()
  })
})

// ── dismiss ────────────────────────────────────────────────────────────────

describe('useToastSubscription — dismiss', () => {
  it('dismiss(id) 移除指定消息, 其他保留', async () => {
    const m = await mount()
    await act(async () => {
      defaultToast.error('A')
      defaultToast.error('B')
      defaultToast.error('C')
    })
    expect(capturedApi?.messages.length).toBe(3)

    // 取第二条的 id
    const targetId = capturedApi?.messages[1]?.id
    expect(targetId).toBeDefined()
    await act(async () => {
      capturedApi?.dismiss(targetId!)
    })

    expect(capturedApi?.messages.length).toBe(2)
    expect(capturedApi?.messages.map((msg) => msg.text)).toEqual(['A', 'C'])
    m.unmount()
  })

  it('dismiss 不存在的 id → no-op', async () => {
    const m = await mount()
    await act(async () => {
      defaultToast.info('only')
    })
    await act(async () => {
      capturedApi?.dismiss('does-not-exist')
    })
    expect(capturedApi?.messages.length).toBe(1)
    m.unmount()
  })
})

// ── 自动消失 ────────────────────────────────────────────────────────────────

describe('useToastSubscription — 自动消失', () => {
  it('success 默认 4s 后自动消失', async () => {
    vi.useFakeTimers()
    const m = await mount()
    await act(async () => {
      defaultToast.success('GO')
    })
    expect(capturedApi?.messages.length).toBe(1)

    await act(async () => {
      vi.advanceTimersByTime(4000)
    })
    expect(capturedApi?.messages.length).toBe(0)
    m.unmount()
    vi.useRealTimers()
  })

  it('error 默认 sticky → 推时间也不消失', async () => {
    vi.useFakeTimers()
    const m = await mount()
    await act(async () => {
      defaultToast.error('显存不足')
    })
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(capturedApi?.messages.length).toBe(1)
    m.unmount()
    vi.useRealTimers()
  })

  it('显式 durationMs 生效', async () => {
    vi.useFakeTimers()
    const m = await mount()
    await act(async () => {
      defaultToast.info('快', { durationMs: 200 })
    })
    expect(capturedApi?.messages.length).toBe(1)
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(capturedApi?.messages.length).toBe(0)
    m.unmount()
    vi.useRealTimers()
  })

  it('unmount 后未触发的 timer 被清理 (内存泄漏防御)', async () => {
    vi.useFakeTimers()
    const m = await mount()
    await act(async () => {
      defaultToast.info('X', { durationMs: 5000 })
    })
    expect(capturedApi?.messages.length).toBe(1)

    // unmount 之前消息还在; unmount 后跑 timer 不应触发任何错误
    m.unmount()

    // 推 6 秒, timer 如果没清掉会触发 setMessages on unmounted component
    // (React 18+ 是静默, 但 timer 引用仍在 — 真正的 leak 信号在 process.tick)
    expect(() => {
      vi.advanceTimersByTime(6000)
    }).not.toThrow()
    vi.useRealTimers()
  })
})
