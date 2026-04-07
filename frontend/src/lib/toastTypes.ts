/**
 * lib/toastTypes.ts — Toast 通知系统的纯类型定义
 *
 * **为什么放在 lib/ 而不是 services/**:
 *
 * CLAUDE.md 硬约束: Component 不得 import services/. 但 components/ui/Toast.tsx
 * 需要知道 ToastVariant 才能渲染对应的颜色 / 图标. 解法是把这些**纯类型**
 * 抽到 lib/ 层 (lib 是项目最底层, 任何上层都可以向下 import).
 *
 * services/toast.ts 里的 ToastService 类持有这些类型的运行时实例;
 * components/ui/Toast.tsx 只 import 类型用于 props 标注;
 * 两者都从 lib/ 拿同一份契约, 不互相直接依赖.
 *
 * **零运行时副作用** — 整个文件只有 type / interface, 编译后是空模块.
 * 与 lib/ 层 "纯函数工具, 零外部依赖" 的定位一致.
 */

// ── 公共类型 ────────────────────────────────────────────────────────────────

/** Toast 严重级别. UI 用它选色条和图标; service 用它定 sticky 默认行为 */
export type ToastVariant = 'success' | 'info' | 'warning' | 'error'

/** publish() 调用方可选传入的配置 */
export interface ToastOptions {
  /**
   * 自动消失的毫秒数. 不传则用 variant 默认值:
   * - error: undefined (sticky, 不自动消失)
   * - 其他: 4000ms
   * 显式传 ``undefined`` 也表示 sticky.
   */
  durationMs?: number
}

/** 一条具象的 toast 消息, 给订阅者消费 */
export interface ToastMessage {
  /** 唯一 ID, 由 service 自增分配 */
  id: string
  variant: ToastVariant
  text: string
  /** 解析后的最终超时. undefined = sticky */
  durationMs: number | undefined
  /** 创建时间戳 (ms since epoch), 给 UI 做排序 / 排队动效用 */
  createdAt: number
}

/** 订阅回调签名 */
export type ToastSubscriber = (message: ToastMessage) => void
