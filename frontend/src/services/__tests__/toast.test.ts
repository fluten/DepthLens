/**
 * toast.test.ts — toast 服务单元测试
 *
 * 测试隔离: 每个 it 之前调 toast._resetForTests() 清空订阅者和 ID 计数.
 * 这样测试可以断言 ID 形式 (toast-1, toast-2, ...) 不被前一个测试污染.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { toast, type ToastMessage } from '../toast'

beforeEach(() => {
  toast._resetForTests()
})

describe('toast — subscribe / unsubscribe', () => {
  it('订阅者收到发布的消息', () => {
    const received: ToastMessage[] = []
    toast.subscribe((m) => received.push(m))
    toast.success('hello')
    expect(received).toHaveLength(1)
    expect(received[0]!.text).toBe('hello')
    expect(received[0]!.variant).toBe('success')
  })

  it('subscribe 返回 unsubscribe 函数', () => {
    const received: ToastMessage[] = []
    const unsub = toast.subscribe((m) => received.push(m))
    toast.info('first')
    unsub()
    toast.info('second')
    expect(received).toHaveLength(1)
    expect(received[0]!.text).toBe('first')
  })

  it('多个订阅者都收到广播', () => {
    const a: ToastMessage[] = []
    const b: ToastMessage[] = []
    toast.subscribe((m) => a.push(m))
    toast.subscribe((m) => b.push(m))
    toast.warning('to all')
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0]!.id).toBe(b[0]!.id) // 同一条消息
  })

  it('subscriberCount 反映当前订阅数', () => {
    expect(toast.subscriberCount).toBe(0)
    const u1 = toast.subscribe(() => undefined)
    expect(toast.subscriberCount).toBe(1)
    const u2 = toast.subscribe(() => undefined)
    expect(toast.subscriberCount).toBe(2)
    u1()
    expect(toast.subscriberCount).toBe(1)
    u2()
    expect(toast.subscriberCount).toBe(0)
  })

  it('订阅者抛错不影响其他订阅者 (隔离)', () => {
    const received: ToastMessage[] = []
    toast.subscribe(() => {
      throw new Error('boom')
    })
    toast.subscribe((m) => received.push(m))
    // 不应抛
    expect(() => toast.error('still goes through')).not.toThrow()
    expect(received).toHaveLength(1)
  })

  it('零订阅者时 publish 是 no-op (不崩)', () => {
    expect(toast.subscriberCount).toBe(0)
    expect(() => {
      toast.success('no listener')
      toast.error('no listener either')
      toast.info('still nothing')
    }).not.toThrow()
  })

  it('订阅者内部再发布消息 (重入) 不死锁不崩', () => {
    // 一个 "echo" 订阅者: 收到 success 时立刻发一条 info.
    // 危险点: 如果 publish 用 for...of 迭代 Set, 而 echo 修改了 Set 或
    // 触发递归 publish, 可能死循环或抛 Set 修改异常.
    const received: ToastMessage[] = []
    toast.subscribe((m) => {
      received.push(m)
      if (m.variant === 'success' && received.length < 3) {
        // 用 length 守卫防止真无限递归
        toast.info('echo: ' + m.text)
      }
    })

    // 不应抛, 不应死循环
    expect(() => toast.success('hello')).not.toThrow()

    // 应该收到 2 条: 原始 success + echo info
    expect(received).toHaveLength(2)
    expect(received[0]!.variant).toBe('success')
    expect(received[1]!.variant).toBe('info')
    expect(received[1]!.text).toBe('echo: hello')
  })
})

describe('toast — 4 种 variant', () => {
  it('success', () => {
    let captured: ToastMessage | null = null
    toast.subscribe((m) => {
      captured = m
    })
    toast.success('ok')
    expect(captured).not.toBeNull()
    // captured 不为 null 时类型推断
    const m = captured as ToastMessage | null
    expect(m!.variant).toBe('success')
  })

  it('info', () => {
    let captured: ToastMessage | null = null
    toast.subscribe((m) => {
      captured = m
    })
    toast.info('fyi')
    const m = captured as ToastMessage | null
    expect(m!.variant).toBe('info')
  })

  it('warning', () => {
    let captured: ToastMessage | null = null
    toast.subscribe((m) => {
      captured = m
    })
    toast.warning('careful')
    const m = captured as ToastMessage | null
    expect(m!.variant).toBe('warning')
  })

  it('error', () => {
    let captured: ToastMessage | null = null
    toast.subscribe((m) => {
      captured = m
    })
    toast.error('boom')
    const m = captured as ToastMessage | null
    expect(m!.variant).toBe('error')
  })
})

describe('toast — durationMs 默认值与覆盖', () => {
  it('success 默认 4000ms', () => {
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.success('hi')
    const captured = m as ToastMessage | null
    expect(captured!.durationMs).toBe(4000)
  })

  it('info 默认 4000ms', () => {
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.info('hi')
    const captured = m as ToastMessage | null
    expect(captured!.durationMs).toBe(4000)
  })

  it('warning 默认 4000ms', () => {
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.warning('hi')
    const captured = m as ToastMessage | null
    expect(captured!.durationMs).toBe(4000)
  })

  it('error 默认 sticky (durationMs === undefined)', () => {
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.error('boom')
    const captured = m as ToastMessage | null
    expect(captured!.durationMs).toBeUndefined()
  })

  it('显式 durationMs 覆盖默认值', () => {
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.success('quick', { durationMs: 1000 })
    const captured = m as ToastMessage | null
    expect(captured!.durationMs).toBe(1000)
  })

  it('显式 durationMs: undefined 表示 sticky (即使是非 error)', () => {
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.success('永不消失', { durationMs: undefined })
    const captured = m as ToastMessage | null
    expect(captured!.durationMs).toBeUndefined()
  })

  it('error + 显式 durationMs 覆盖 sticky 默认 (强制自动消失)', () => {
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.error('quick error', { durationMs: 2000 })
    const captured = m as ToastMessage | null
    expect(captured!.durationMs).toBe(2000)
  })
})

describe('toast — 消息字段', () => {
  it('id 自增且唯一', () => {
    const ids: string[] = []
    toast.subscribe((m) => ids.push(m.id))
    toast.info('a')
    toast.info('b')
    toast.info('c')
    expect(ids).toEqual(['toast-1', 'toast-2', 'toast-3'])
    expect(new Set(ids).size).toBe(3) // 全唯一
  })

  it('createdAt 是合理的时间戳', () => {
    const before = Date.now()
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.success('hi')
    const after = Date.now()
    const captured = m as ToastMessage | null
    expect(captured!.createdAt).toBeGreaterThanOrEqual(before)
    expect(captured!.createdAt).toBeLessThanOrEqual(after)
  })

  it('text 字段透传', () => {
    let m: ToastMessage | null = null
    toast.subscribe((x) => {
      m = x
    })
    toast.warning('深度图过大, 已自动缩放')
    const captured = m as ToastMessage | null
    expect(captured!.text).toBe('深度图过大, 已自动缩放')
  })
})

describe('toast — _resetForTests', () => {
  it('清空订阅者', () => {
    toast.subscribe(() => undefined)
    toast.subscribe(() => undefined)
    expect(toast.subscriberCount).toBe(2)
    toast._resetForTests()
    expect(toast.subscriberCount).toBe(0)
  })

  it('重置 ID 计数器', () => {
    const fn = vi.fn()
    toast.subscribe(fn)
    toast.info('first')
    toast._resetForTests()

    const ids: string[] = []
    toast.subscribe((m) => ids.push(m.id))
    toast.info('after-reset')
    expect(ids).toEqual(['toast-1']) // 计数器从 1 重新开始
  })
})
