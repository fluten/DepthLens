/**
 * hooks/useToastSubscription.ts — 订阅全局 toast service 的 React 桥
 *
 * 职责 (hook 层):
 * 1. mount 时向 services/toast 单例注册 subscriber
 * 2. 收到新消息插入本地 list state
 * 3. 非 sticky 类型 (durationMs !== undefined) 在到期时自动从 list 移除
 * 4. 暴露 dismiss(id) 让 UI 主动移除一条 (例如用户点 X)
 * 5. unmount 时清理订阅 + clearTimeout 所有在飞的 dismiss 计时器
 *
 * **为什么单独抽 hook**:
 * CLAUDE.md 硬约束: components/ 不得 import services/. 之前 ToastContainer
 * 直接 import toast 单例是分层违反, 现在通过 hook 中转 — Component → Hook
 * → Service 是合规链路.
 *
 * **timer 清理细节**:
 * setTimeout 在组件 unmount 时**不**自动清理 — 旧实现里这是个内存泄漏
 * (定时器持有 setMessages 闭包引用, 直到触发后才释放). 这里用一个 Set
 * 跟踪所有在飞的 timer id, unmount 时一次性 clearTimeout.
 *
 * 不做:
 * - 不暴露任何 publish 方法 (那是 service 的职责, 不是 hook)
 * - 不做 toast 排序 / 限流 (Phase 1 范围之外)
 */

import { useCallback, useEffect, useState } from 'react'
import type { ToastMessage } from '../lib/toastTypes'
import { toast as defaultToast } from '../services/toast'

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface UseToastSubscriptionApi {
  /** 当前活跃的 toast 列表, 按到达时间排序 */
  messages: ToastMessage[]
  /** 主动移除一条 toast (用户点 X 时调用) */
  dismiss: (id: string) => void
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * 订阅 toast service 并返回当前活跃的消息列表.
 *
 * @param toastService 注入点 — 测试可传 mock service. 默认用全局单例.
 *
 * @example (in ToastContainer.tsx)
 *   const { messages, dismiss } = useToastSubscription()
 *   return <>{messages.map(m => <Toast {...m} onClose={() => dismiss(m.id)} />)}</>
 */
export function useToastSubscription(
  toastService: typeof defaultToast = defaultToast
): UseToastSubscriptionApi {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  useEffect(() => {
    // 跟踪所有在飞的 dismiss timer, unmount 时一次性清理避免泄漏
    const timers = new Set<ReturnType<typeof setTimeout>>()

    const unsubscribe = toastService.subscribe((msg) => {
      setMessages((prev) => [...prev, msg])

      // 非 sticky 才安排自动移除. error 默认 sticky (durationMs=undefined)
      if (msg.durationMs !== undefined) {
        const t = setTimeout(() => {
          setMessages((prev) => prev.filter((m) => m.id !== msg.id))
          timers.delete(t)
        }, msg.durationMs)
        timers.add(t)
      }
    })

    return () => {
      unsubscribe()
      // 清掉所有还没触发的自动移除 timer, 避免 unmount 后的 setMessages 警告
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [toastService])

  // 主动移除. ref 稳定 (空依赖), 调用方可以放心当 prop 传给子组件
  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { messages, dismiss }
}
