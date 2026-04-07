/**
 * hooks/useConnection.ts — 后端连接状态轮询
 *
 * 职责 (hook 层 — 业务编排):
 * - 周期性 ping `/api/health` 检测后端是否在线
 * - 把结果 (status / latency) 写入 connectionStore, 让 ConnectionBar 组件订阅渲染
 * - 状态机切换:
 *     成功     → 'connected'
 *     失败     → 'disconnected'
 *     轮询前   → (上一次成功) 保留 'connected', (上一次失败) 切到 'reconnecting'
 *
 * 不做:
 * - 不渲染 UI (那是 overlay/ConnectionBar 的职责)
 * - 不调 toast (网络抖动会刷屏, 沉默地更新 store 即可, UI 自己决定怎么展示)
 *
 * 设计:
 * - 主体逻辑抽成纯函数 ``pollHealthOnce``, 不依赖 React, 可单测
 * - hook 本身只是 useEffect 包一层 setInterval, 负责挂载/卸载生命周期
 * - 第一次轮询立即触发 (不等 5s), 否则刚挂载的 5s 内 UI 显示 "未连接" 体验差
 * - AbortController 在 unmount 时取消进行中的请求, 避免 setState on unmounted
 */

import { useEffect } from 'react'
import { HEALTH_POLL_INTERVAL_MS } from '../lib/constants'
import {
  ApiError,
  apiClient as defaultApiClient,
  type ApiClient,
} from '../services/api'
import {
  useConnectionStore,
  type ConnectionStore,
} from '../stores/connectionStore'

// ── 纯函数: 单次 health 检测 ────────────────────────────────────────────────

/**
 * 单次 ping /api/health 并把结果写入 store. 不抛任何异常 — 失败被吞掉
 * 转化为 'disconnected' 状态写入 store. 这样 setInterval 不会因为一次失败
 * 而中断, 调用方也不需要 try/catch.
 *
 * @param client  API 客户端 (生产用 defaultApiClient, 测试可注入 mock)
 * @param store   只用 store 的同步 setter, 不直接读 store
 * @param signal  可选取消信号 (unmount 时 abort)
 *
 * 返回 boolean 仅供测试断言, 生产代码不依赖.
 */
export async function pollHealthOnce(
  client: ApiClient,
  store: Pick<ConnectionStore, 'setStatus' | 'setLatency' | 'status'>,
  signal?: AbortSignal
): Promise<boolean> {
  // 进入轮询前如果是 disconnected, 切到 reconnecting (UI 显示重连图标)
  // 已经 connected 的话保持原状, 不需要闪烁到 reconnecting
  if (store.status === 'disconnected') {
    store.setStatus('reconnecting')
  }

  const startedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()

  try {
    await client.getHealth({ signal })
    const elapsed =
      (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()) - startedAt
    store.setLatency(Math.round(elapsed))
    store.setStatus('connected')
    return true
  } catch (err) {
    // AbortError 代表组件已 unmount, 不再写 store (会触发 React 警告且无意义)
    if (err instanceof ApiError && err.errorClass === 'AbortError') {
      return false
    }
    store.setStatus('disconnected')
    return false
  }
}

// ── React Hook ──────────────────────────────────────────────────────────────

/**
 * 启动后端健康检测轮询. 通常在 App 根组件挂载一次.
 *
 * @param options.intervalMs  轮询间隔, 默认 HEALTH_POLL_INTERVAL_MS (5s)
 * @param options.client      可注入的 ApiClient, 测试用
 *
 * 行为:
 * - 挂载后立即 ping 一次 (不等第一个间隔)
 * - 之后每隔 intervalMs 再 ping
 * - unmount 时清 interval + abort 进行中的 fetch
 */
export function useConnection(options: {
  intervalMs?: number
  client?: ApiClient
} = {}): void {
  const intervalMs = options.intervalMs ?? HEALTH_POLL_INTERVAL_MS
  const client = options.client ?? defaultApiClient

  useEffect(() => {
    // 同一个 controller 复用整个轮询周期, unmount 时 abort 一次性切断
    // 进行中的 fetch. 单次轮询失败不需要 abort 自身, 直接走 catch 即可.
    const controller = new AbortController()

    const tick = () => {
      // 每次 tick 都从 store 取最新 setter, 避免闭包陈旧 state.
      // 注意: 这里 getState 在 React 渲染外调用是 zustand 的标准模式.
      const store = useConnectionStore.getState()
      void pollHealthOnce(client, store, controller.signal)
    }

    // 立即触发一次, 然后启动定时器
    tick()
    const timer = setInterval(tick, intervalMs)

    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [intervalMs, client])
}
