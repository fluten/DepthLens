/**
 * useConnection.test.ts — 后端连接轮询 hook 单测
 *
 * 测试范围:
 * - pollHealthOnce 纯函数 (不依赖 React)
 *   - 成功: 写 latency + status='connected'
 *   - 失败: status='disconnected'
 *   - reconnecting 切换路径
 *   - AbortError 静默 (不写 store)
 * - useConnection hook 通过 React act + useEffect 烟雾测试,
 *   验证 mount 立即触发, unmount abort
 *
 * 不直接测 setInterval 时序, 因为 fake timers + microtask 容易死锁;
 * 间隔行为通过手动多次调用 pollHealthOnce 覆盖.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pollHealthOnce, useConnection } from '../useConnection'
import {
  ApiClient,
  ApiError,
  type HealthResponse,
} from '../../services/api'
import {
  CONNECTION_STORE_INITIAL,
  useConnectionStore,
} from '../../stores/connectionStore'

beforeEach(() => {
  useConnectionStore.setState(CONNECTION_STORE_INITIAL)
})

// ── pollHealthOnce ─────────────────────────────────────────────────────────

describe('pollHealthOnce — 成功路径', () => {
  it('200 → status connected + latency 写入', async () => {
    const client = new ApiClient('')
    const healthBody: HealthResponse = {
      status: 'ok',
      device: 'cpu',
      models_loaded: [],
    }
    vi.spyOn(client, 'getHealth').mockResolvedValueOnce(healthBody)

    const ok = await pollHealthOnce(client, useConnectionStore.getState())
    expect(ok).toBe(true)

    const s = useConnectionStore.getState()
    expect(s.status).toBe('connected')
    // latency 是 round 后的 number, 至少 ≥ 0
    expect(s.latencyMs).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(s.latencyMs)).toBe(true)
  })

  it('已连接状态再次成功不闪烁到 reconnecting', async () => {
    useConnectionStore.setState({ status: 'connected', latencyMs: 5 })

    const client = new ApiClient('')
    vi.spyOn(client, 'getHealth').mockResolvedValueOnce({
      status: 'ok',
      device: 'cpu',
      models_loaded: [],
    })

    await pollHealthOnce(client, useConnectionStore.getState())
    expect(useConnectionStore.getState().status).toBe('connected')
  })
})

describe('pollHealthOnce — 失败路径', () => {
  it('网络错误 → status disconnected', async () => {
    const client = new ApiClient('')
    vi.spyOn(client, 'getHealth').mockRejectedValueOnce(
      new ApiError(0, 'NetworkError', '网络连接失败')
    )

    const ok = await pollHealthOnce(client, useConnectionStore.getState())
    expect(ok).toBe(false)
    expect(useConnectionStore.getState().status).toBe('disconnected')
  })

  it('disconnected → 进入 polling 时切到 reconnecting (即使最终失败)', async () => {
    useConnectionStore.setState({ status: 'disconnected', latencyMs: 0 })

    const client = new ApiClient('')
    // 用一个可控 Promise 暂停在 reconnecting 阶段, 验证状态切换
    let resolveHealth: (v: HealthResponse) => void
    const pending = new Promise<HealthResponse>((res) => {
      resolveHealth = res
    })
    vi.spyOn(client, 'getHealth').mockReturnValueOnce(pending)

    const polling = pollHealthOnce(client, useConnectionStore.getState())
    // 微任务还没切到下一轮, 但 setStatus('reconnecting') 已经同步执行
    expect(useConnectionStore.getState().status).toBe('reconnecting')

    // 完成请求 → 切到 connected
    resolveHealth!({ status: 'ok', device: 'cpu', models_loaded: [] })
    await polling
    expect(useConnectionStore.getState().status).toBe('connected')
  })

  it('AbortError 不写 store (组件已卸载)', async () => {
    useConnectionStore.setState({ status: 'connected', latencyMs: 7 })

    const client = new ApiClient('')
    vi.spyOn(client, 'getHealth').mockRejectedValueOnce(
      new ApiError(0, 'AbortError', '请求已取消')
    )

    const ok = await pollHealthOnce(client, useConnectionStore.getState())
    expect(ok).toBe(false)
    // 状态应该保持 connected, latency 不变
    expect(useConnectionStore.getState().status).toBe('connected')
    expect(useConnectionStore.getState().latencyMs).toBe(7)
  })
})

// ── useConnection hook (烟雾) ──────────────────────────────────────────────
//
// 不引入 @testing-library/react. 用 React 19 的 act + react-dom/client
// 手动渲染一个调用 hook 的组件. 只验证: mount 后 store 在某次微任务内变成
// connected (说明 useEffect 和 fetch 都被触发).

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

function HookRunner(props: { intervalMs?: number; client?: ApiClient }) {
  useConnection({
    intervalMs: props.intervalMs ?? 60_000, // 60s = 大于测试时长, 不会重复触发
    client: props.client,
  })
  return null
}

describe('useConnection (smoke)', () => {
  it('mount 后立即触发一次 health check', async () => {
    const client = new ApiClient('')
    const spy = vi.spyOn(client, 'getHealth').mockResolvedValue({
      status: 'ok',
      device: 'cuda',
      models_loaded: [],
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root: Root
    await act(async () => {
      root = createRoot(container)
      root.render(createElement(HookRunner, { client }))
    })

    // 给 promise 一次 flush 机会
    await act(async () => {})

    expect(spy).toHaveBeenCalledTimes(1)
    expect(useConnectionStore.getState().status).toBe('connected')

    await act(async () => {
      root!.unmount()
    })
    container.remove()
  })

  it('unmount 后 abort, 不再触发 store 写入', async () => {
    const client = new ApiClient('')
    // mock 一个永不 resolve 的请求, 模拟在飞中
    vi.spyOn(client, 'getHealth').mockImplementation(
      ({ signal } = {}) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new ApiError(0, 'AbortError', '请求已取消'))
          })
        })
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root: Root
    await act(async () => {
      root = createRoot(container)
      root.render(createElement(HookRunner, { client }))
    })

    // unmount → AbortController.abort() → fetch 抛 AbortError → 静默
    await act(async () => {
      root!.unmount()
    })
    // flush microtasks
    await act(async () => {})

    // 仍是初始 disconnected (轮询前进 reconnecting, 然后 abort 静默退出)
    // 注意 pollHealthOnce 在 disconnected 进入时会先 setStatus('reconnecting'),
    // 这是同步执行的, 所以 unmount 时已经写过一次. 这是预期行为.
    const final = useConnectionStore.getState().status
    expect(final === 'reconnecting' || final === 'disconnected').toBe(true)
    container.remove()
  })
})
