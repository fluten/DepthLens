/**
 * components/overlay/ModeBar.tsx — 底部输入模式切换条
 *
 * DESIGN.md §6.4 明确列为"手写"组件: 交互复杂 (滚轮 + spring dot), 样式极简.
 *
 * 职责 (component 层):
 *   1. 订阅 inputStore.mode, 显示 4 个模式文字标签
 *   2. 点击标签 → setMode 切换
 *   3. 滚轮 → 前后切换模式 (Fitts: 底部边缘 + 大 hit area)
 *   4. 选中态: 文字加粗 + accent 色 + 下方 spring dot 跟随
 *
 * 视觉:
 *   - NO glass background (DESIGN.md §2 玻璃分配表: Mode Bar 文字直接浮在画面上)
 *   - 固定底部, 水平居中, height 80px (DESIGN.md §8)
 *   - 标签间距 24px, 字号 14px
 *   - dot 4px 圆, var(--accent), 在标签下方 6px
 *   - 选中标签: font-weight 600, 未选中: font-weight 400
 *   - dot 通过 Framer Motion layoutId 自动 spring 过渡 (DESIGN.md §3.7)
 *
 * 事件:
 *   - onClick 每个标签 → setMode
 *   - onWheel 整个条 → 前后切换 (deltaY > 0 下一个, < 0 上一个)
 *
 * **无障碍**:
 *   - <button> 每个标签, 键盘 Tab + Enter/Space 可用
 *   - aria-pressed 标注选中态
 */
import { motion } from 'framer-motion'
import { useCallback, useRef } from 'react'
import { useInputStore, type InputMode } from '../../stores/inputStore'

// ── 模式元数据 ──────────────────────────────────────────────────────────────
//
// 顺序决定 Mode Bar 从左到右 + 滚轮切换的前后关系. 与 SPEC §4.2 一致.

interface ModeMeta {
  id: InputMode
  label: string
}

const MODES: readonly ModeMeta[] = [
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'camera', label: '摄像头' },
  { id: '3d', label: '3D 点云' },
] as const

// ── 内部: 找到当前 mode 在 MODES 中的下标 ──────────────────────────────────

const modeIndex = (mode: InputMode): number =>
  MODES.findIndex((m) => m.id === mode)

// ── 组件 ────────────────────────────────────────────────────────────────────

export function ModeBar() {
  const mode = useInputStore((s) => s.mode)
  const setMode = useInputStore((s) => s.setMode)

  // 滚轮节流: 防止触控板连续滚动一帧内切多格. 用 ref 记录上一次滚动时间.
  const lastWheelRef = useRef<number>(0)

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // 100ms 节流. 小于这个间隔的 wheel 事件忽略.
      const now = e.timeStamp
      if (now - lastWheelRef.current < 100) return
      lastWheelRef.current = now

      const current = modeIndex(mode)
      if (current < 0) return

      // deltaY > 0 → 向下滚 → 后一个, < 0 → 向上滚 → 前一个.
      // 循环: 到尽头回绕
      const delta = e.deltaY > 0 ? 1 : -1
      const next = (current + delta + MODES.length) % MODES.length
      setMode(MODES[next]!.id)
    },
    [mode, setMode]
  )

  return (
    <div
      role="tablist"
      aria-label="输入模式"
      onWheel={handleWheel}
      // 固定底部, 水平居中. 高度 80px, flex 水平排列.
      // NO background — 文字直接浮在画面上 (DESIGN.md §2 玻璃分配表).
      // z-modebar = 40 (tailwind config 映射 DESIGN.md §9)
      //
      // **间距用 inline style 显式 24px** (DESIGN.md §8 "标签间距 24px"):
      // 不依赖 tailwind 的 gap-* 类, 避免任何 spacing extend 解析歧义.
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-modebar h-20 flex items-center justify-center select-none"
      style={{
        gap: 'var(--space-6)', // 24px — DESIGN.md §8 标签间距
        padding: '0 var(--space-6)', // 左右 24px 留呼吸空间
        pointerEvents: 'auto', // 让滚轮事件能穿透到这个条
      }}
    >
      {MODES.map((m) => {
        const isActive = m.id === mode
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            onClick={() => setMode(m.id)}
            // 纵向弹性容器: label 在上, dot 在下.
            // relative 让 dot 的 layoutId 能相对于这个 button 定位.
            className="relative flex flex-col items-center justify-center cursor-pointer bg-transparent border-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-sm"
            style={{
              // **加大 hit area** (DESIGN.md HCI Fitts: 高频操作给大目标):
              // 12px 横 + 8px 纵 padding, 让点击区域至少 ~70×40, 避免误点.
              padding: 'var(--space-2) var(--space-3)',
              fontFamily: 'var(--font-ui)',
              fontSize: '14px', // DESIGN.md §8 标签字号 14px
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap', // 防止 "3D 点云" 被换行
              transition:
                'color var(--duration-fast) var(--ease-out), font-weight var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out)',
              transform: isActive ? 'scale(1.05)' : 'scale(1)',
              textShadow: isActive ? '0 0 12px var(--accent-glow)' : 'none',
            }}
          >
            {m.label}
            {/* spring dot — 用 layoutId 让 Framer Motion 在 button 之间自动 spring 过渡 */}
            {isActive && (
              <motion.span
                layoutId="modebar-dot"
                // 4px 圆 accent 色, 在文字下方 6px
                style={{
                  position: 'absolute',
                  bottom: -10,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 0 8px var(--accent-glow)',
                }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
