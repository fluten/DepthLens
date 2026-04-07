/**
 * connectionStore.test.ts — 后端连接 store 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { CONNECTION_STORE_INITIAL, useConnectionStore } from '../connectionStore'

beforeEach(() => {
  useConnectionStore.setState(CONNECTION_STORE_INITIAL)
})

describe('connectionStore — 初始状态', () => {
  it('启动时假定 disconnected (避免闪烁)', () => {
    expect(useConnectionStore.getState().status).toBe('disconnected')
  })

  it('latencyMs 默认 0', () => {
    expect(useConnectionStore.getState().latencyMs).toBe(0)
  })
})

describe('connectionStore — setStatus', () => {
  it.each(['connected', 'disconnected', 'reconnecting'] as const)(
    '可设置为 "%s"',
    (status) => {
      useConnectionStore.getState().setStatus(status)
      expect(useConnectionStore.getState().status).toBe(status)
    }
  )
})

describe('connectionStore — setLatency', () => {
  it('正常延迟', () => {
    useConnectionStore.getState().setLatency(42)
    expect(useConnectionStore.getState().latencyMs).toBe(42)
  })

  it('0 ms 是合法的 (本地 loopback 极快)', () => {
    useConnectionStore.getState().setLatency(0)
    expect(useConnectionStore.getState().latencyMs).toBe(0)
  })

  it('负数被钳到 0 (防御时钟回拨)', () => {
    useConnectionStore.getState().setLatency(-50)
    expect(useConnectionStore.getState().latencyMs).toBe(0)
  })

  it('NaN → 0 (NaN 防御)', () => {
    useConnectionStore.getState().setLatency(50)
    useConnectionStore.getState().setLatency(NaN)
    expect(useConnectionStore.getState().latencyMs).toBe(0)
  })

  it('+Infinity → 0 (无穷延迟视为不可用)', () => {
    useConnectionStore.getState().setLatency(Infinity)
    expect(useConnectionStore.getState().latencyMs).toBe(0)
  })
})

describe('connectionStore — reset', () => {
  it('完全回到初始', () => {
    useConnectionStore.getState().setStatus('connected')
    useConnectionStore.getState().setLatency(123)
    useConnectionStore.getState().reset()

    const s = useConnectionStore.getState()
    expect(s.status).toBe('disconnected')
    expect(s.latencyMs).toBe(0)
  })
})
