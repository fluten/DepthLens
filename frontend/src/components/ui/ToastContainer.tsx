/**
 * components/ui/ToastContainer.tsx — 顶部居中堆叠的 Toast 渲染容器
 *
 * 职责 (component 层 — 纯渲染 + 事件绑定):
 * 1. 通过 useToastSubscription hook 拿到当前活跃消息列表
 * 2. 按到达顺序在屏幕顶部居中渲染
 * 3. 每条 Toast 配合 framer-motion 入场 / 退场 spring 动画
 * 4. 用户点 X → 调 hook 暴露的 dismiss
 *
 * **架构合规** (CLAUDE.md 分层硬约束):
 * - 不 import services/  ✓ — 订阅逻辑全部委托给 hooks/useToastSubscription
 * - 不含业务逻辑 ✓ — 自动消失计时、订阅生命周期都在 hook 里
 * - 只做"渲染 + 事件绑定" ✓ — 把 list 喂给 Toast, 把 onClose 绑到 dismiss
 *
 * **z-index**: --z-toast (60) — 在 SettingsSheet 之上, DropOverlay 之下
 * **位置 (DESIGN.md §8)**: top-center, max-width 480px
 *
 * **不实现** (Phase 1 范围之外):
 * - 队列模式 (超过 N 条隐藏旧的)
 * - 按位置分组 (top-left/bottom-right 等), DESIGN.md §13.1 锁死了 top-center
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useToastSubscription } from '../../hooks/useToastSubscription'
import { Toast } from './Toast'

// ── 组件 ────────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const { messages, dismiss } = useToastSubscription()

  return (
    <div
      // - fixed top-4 left-1/2 -translate-x-1/2: 顶部居中, 距顶 16px
      // - w-full max-w-[480px] px-4: DESIGN.md §8 Toast max-width 480, 小屏
      //   有 16px 左右安全边距
      // - z-toast: tailwind config 映射到 60 (DESIGN.md §9 z-index 表)
      // - flex flex-col items-stretch gap-2: 垂直堆叠, toast 各占满容器宽
      // - pointer-events-none: 让外层不阻挡 viewport, 内部 toast 自己开 auto
      className="fixed top-4 left-1/2 -translate-x-1/2 z-toast w-full max-w-[480px] px-4 flex flex-col items-stretch gap-2 pointer-events-none"
      // 给屏幕阅读器一个 region 标识
      aria-label="通知"
      role="region"
    >
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            // 入场: 从顶部上方 100% 滑下 (DESIGN.md §3.7 toast 进入)
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            // 退场: 上滑 + 淡出
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{
              type: 'spring',
              stiffness: 380,
              damping: 30,
              mass: 0.8,
            }}
            // toast 内部允许点击, 让 close 按钮可用
            className="pointer-events-auto"
          >
            <Toast
              variant={msg.variant}
              message={msg.text}
              onClose={() => dismiss(msg.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
