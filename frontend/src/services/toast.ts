/**
 * services/toast.ts — 全局 Toast 通知服务接口
 *
 * **本文件不实现 UI**, 只定义"发布 / 订阅"协议.
 *   - 业务代码 (hook) 调 `toast.error('显存不足')`
 *   - UI 组件 (ui/ToastContainer.tsx, Phase 1 后续) `toast.subscribe(fn)`
 *     接收消息并渲染
 *
 * 这种解耦的好处:
 *   - hook 不需要知道 ToastContainer 是否挂载
 *   - 测试 hook 时只需 mock toast 方法, 不需要 mock React 组件树
 *   - 一份消息可以被多个订阅者消费 (例如 UI + 埋点)
 *
 * **错误等级语义** (与 SPEC §13.1 / DESIGN.md §2 玻璃面板 Toast 一致):
 *   - success: 操作成功 (绿色色条, 4s 自动消失)
 *   - info:    中性提示 (蓝色色条, 4s 自动消失)
 *   - warning: 用户输入有问题但未阻断 (黄色色条, 4s 自动消失)
 *   - error:   阻断性失败 (红色色条, **不自动消失**, 用户必须手动关掉)
 */

// ── 类型 ────────────────────────────────────────────────────────────────────
//
// 类型定义在 lib/toastTypes.ts (CLAUDE.md 分层规则: 任何上层 component 都
// 可以向下 import lib/, 但不能 import services/). 我们这里 re-export 它们,
// 让历史调用方 (用 `from '../services/toast'` 的) 不需要改 import 路径.

export type {
  ToastVariant,
  ToastOptions,
  ToastMessage,
  ToastSubscriber,
} from '../lib/toastTypes'
import type {
  ToastMessage,
  ToastOptions,
  ToastSubscriber,
  ToastVariant,
} from '../lib/toastTypes'

// ── ToastService ───────────────────────────────────────────────────────────

const DEFAULT_DURATION_MS = 4000

class ToastService {
  private subscribers = new Set<ToastSubscriber>()
  private nextId = 1

  /**
   * 注册订阅者. 返回反订阅函数, **务必在组件 unmount 时调用**, 否则会
   * 内存泄漏 (Set 持有 React state setter 引用).
   *
   * @example (in ToastContainer effect)
   *   useEffect(() => toast.subscribe(setMessages), [])
   */
  subscribe(fn: ToastSubscriber): () => void {
    this.subscribers.add(fn)
    return () => {
      this.subscribers.delete(fn)
    }
  }

  /** 当前订阅者数量 (主要给测试用) */
  get subscriberCount(): number {
    return this.subscribers.size
  }

  // ── 公共 API ───────────────────────────────────────
  success(text: string, opts?: ToastOptions): void {
    this.publish('success', text, opts)
  }

  info(text: string, opts?: ToastOptions): void {
    this.publish('info', text, opts)
  }

  warning(text: string, opts?: ToastOptions): void {
    this.publish('warning', text, opts)
  }

  /**
   * 错误 toast 默认 sticky — 不自动消失. 因为错误消息往往是用户需要采取行动
   * 的关键信息, 自动消失会让用户错过.
   */
  error(text: string, opts?: ToastOptions): void {
    this.publish('error', text, opts)
  }

  // ── 内部 ────────────────────────────────────────────
  private publish(
    variant: ToastVariant,
    text: string,
    opts: ToastOptions = {}
  ): void {
    // error 默认 sticky (undefined), 其他默认 4s.
    // 注意: 调用方显式传 undefined 也代表 sticky, 不能用 ?? 因为它不能
    // 区分 "未传" 和 "传了 undefined". 这里用 'durationMs' in opts 判断.
    let resolvedDuration: number | undefined
    if ('durationMs' in opts) {
      resolvedDuration = opts.durationMs
    } else {
      resolvedDuration = variant === 'error' ? undefined : DEFAULT_DURATION_MS
    }

    const message: ToastMessage = {
      id: `toast-${this.nextId++}`,
      variant,
      text,
      durationMs: resolvedDuration,
      createdAt: Date.now(),
    }

    // 广播给所有订阅者. 单个订阅者抛错不影响其他订阅者 (try/catch 隔离).
    for (const fn of this.subscribers) {
      try {
        fn(message)
      } catch {
        // 静默吞掉. 真实场景里 hook 不会抛, ToastContainer 也只是 setState.
        // 这里防御只是为了避免一个坏订阅者拖垮整条广播链.
      }
    }
  }

  /**
   * 仅测试用 — 清空全部订阅者并重置 ID 计数器.
   * 生产代码不应调用 (反订阅请用 subscribe 返回的 unsubscribe 函数).
   */
  _resetForTests(): void {
    this.subscribers.clear()
    this.nextId = 1
  }
}

// ── 单例 ────────────────────────────────────────────────────────────────────

/**
 * 全局 toast 单例. 整个 app 共享一个实例, 由 ui/ToastContainer 订阅.
 */
export const toast = new ToastService()
