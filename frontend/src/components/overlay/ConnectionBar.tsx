/**
 * components/overlay/ConnectionBar.tsx — 后端连接状态条
 *
 * 视觉来源:
 *   - Stitch 生成 (projects/9861093748484174395/screens/1992bdd1a65d414fb3458ca185278b97,
 *     title "ConnectionBar Showcase")
 *   - DESIGN.md §6.7 改造清单:
 *     ✓ 删除 Stitch 额外加的 SideNav/TopBar/HUD 装饰 (违反 "全沉浸式无顶栏")
 *     ✓ 只保留底部的 glass-medium bar 主体
 *     ✓ 替换 Material Symbols 为 lucide-react
 *     ✓ 所有颜色改 CSS variable
 *     ✓ pulse / spin 动画改用 Framer Motion (不加 CSS keyframe, 保持 globals.css ≤ 300 行)
 *     ✓ HTML 转 React TSX, 状态绑定 connectionStore
 *
 * 职责 (component 层):
 *   - 订阅 connectionStore.status
 *   - status === 'connected' → 不渲染 (沉浸式 UI, 无 UI 干扰)
 *   - status === 'disconnected' → 红色脉冲点 + "后端离线 · 正在重连..."
 *   - status === 'reconnecting' → 旋转弧线 + "重连中..."
 *
 * **不实现 retry button** (Phase 2 任务):
 *   SPEC §13.6 规定 "30s 持续断连才显示 [重试]" — Phase 1 先只做被动状态条,
 *   useConnection hook 自动按 5s 间隔轮询, 用户无需手动介入.
 *
 * **z-index**: 30 (VideoTimeline 层, 在 Mode Bar 下面, DESIGN.md §9).
 *   实际位置: 固定底部, ModeBar (80px) 的正上方 = bottom 96px.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useConnectionStore } from '../../stores/connectionStore'

// ── 组件 ────────────────────────────────────────────────────────────────────

export function ConnectionBar() {
  const status = useConnectionStore((s) => s.status)

  // 'connected' → 不显示, 维持沉浸式 UI
  const visible = status !== 'connected'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="connection-bar"
          role="status"
          aria-live="polite"
          aria-label="后端连接状态"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{
            type: 'spring',
            stiffness: 380,
            damping: 30,
          }}
          // glass-medium 来自 globals.css, 自带 blur + border + shadow
          className="glass-medium fixed bottom-24 left-1/2 -translate-x-1/2 z-timeline flex items-center gap-3 pointer-events-auto"
          style={{
            height: '36px',
            padding: '0 var(--space-4)',
          }}
        >
          {status === 'disconnected' ? <DisconnectedContent /> : <ReconnectingContent />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── 子: 离线态内容 ────────────────────────────────────────────────────────

function DisconnectedContent() {
  return (
    <>
      {/* 红色脉冲点 — Framer Motion animate scale + opacity 循环 */}
      <div className="relative flex items-center justify-center w-2 h-2">
        {/* 固定实心圆 */}
        <div
          className="absolute w-2 h-2 rounded-full"
          style={{ background: 'var(--error)' }}
        />
        {/* 脉冲 halo */}
        <motion.div
          className="absolute w-2 h-2 rounded-full"
          style={{ background: 'var(--error)' }}
          animate={{
            scale: [1, 2.2, 1],
            opacity: [0.6, 0, 0.6],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      <span
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        后端离线
      </span>

      {/* 竖分隔线 */}
      <div
        style={{
          width: '1px',
          height: '12px',
          background: 'var(--border)',
        }}
      />

      <span
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        正在重连...
      </span>
    </>
  )
}

// ── 子: 重连中态内容 ──────────────────────────────────────────────────────
//
// **设计注意**: 这里**不能**用旋转菊花 spinner — CLAUDE.md "动画" 小节明令
// "禁止旋转菊花". 所以用和 disconnected 态同构的 pulse 点 (只是颜色从
// error 变 accent), 视觉语言一致、符合规范.

function ReconnectingContent() {
  return (
    <>
      {/* accent 脉冲点 — 结构与 DisconnectedContent 对称, 只是颜色不同 */}
      <div className="relative flex items-center justify-center w-2 h-2">
        <div
          className="absolute w-2 h-2 rounded-full"
          style={{ background: 'var(--accent)' }}
        />
        <motion.div
          className="absolute w-2 h-2 rounded-full"
          style={{ background: 'var(--accent)' }}
          animate={{
            scale: [1, 2.2, 1],
            opacity: [0.6, 0, 0.6],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      <span
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--accent)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        重连中...
      </span>
    </>
  )
}
