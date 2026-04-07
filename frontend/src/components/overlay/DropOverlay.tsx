/**
 * components/overlay/DropOverlay.tsx — 全局拖拽覆盖层
 *
 * DESIGN.md §6.4 明确列为手写组件 ("全屏遮罩 + 虚线边框, 3 行 CSS").
 *
 * 职责 (component 层 — 纯渲染, 不含业务):
 * - 根据 props.visible 显示/隐藏全屏引导层
 * - 淡入淡出动画 (DESIGN.md "禁止硬切")
 * - accent 虚线内框 + "释放以分析深度" 大字提示
 *
 * **事件穿透**: pointer-events: none — useFileDrop hook 监听 window 级
 * dragenter/dragover/drop, 覆盖层必须不拦截事件, 否则 drop 会打在覆盖层
 * 而不是 window, drop 完成后的回调拿不到文件.
 *
 * **z-index**: z-drop = 100 (DESIGN.md §9 最高层, 盖住所有其他 UI)
 *
 * 不订阅 inputStore / depthStore — 调用方 (App 根组件) 通过 useFileDrop
 * 取 isDraggingOver 再传 visible.
 */
import { AnimatePresence, motion } from 'framer-motion'

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface DropOverlayProps {
  /** 是否显示. 通常绑定 useFileDrop().isDraggingOver */
  visible: boolean
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export function DropOverlay({ visible }: DropOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="drop-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          // - fixed inset-0: 覆盖整个视口
          // - z-drop: tailwind.config 映射到 100 (DESIGN.md §9)
          // - pointer-events-none: 不拦截拖拽事件
          // - flex center: 中央文案
          className="fixed inset-0 z-drop pointer-events-none flex items-center justify-center"
          role="presentation"
          aria-hidden="true"
          style={{
            // 半透明深色背景 — 与 --bg-primary 同色系但更暗以区分"接受区域"
            background: 'rgba(10, 10, 15, 0.75)',
            // backdrop blur 让下层画面虚化, 视觉聚焦
            backdropFilter: 'blur(8px) saturate(1.1)',
            WebkitBackdropFilter: 'blur(8px) saturate(1.1)',
          }}
        >
          {/* accent 虚线内框 — inset 24px, 全屏覆盖的剧场框 */}
          <div
            style={{
              position: 'absolute',
              inset: 'var(--space-6)',
              border: '2px dashed var(--accent)',
              borderRadius: 'var(--radius-lg)',
              boxShadow:
                '0 0 60px var(--accent-glow), inset 0 0 60px var(--accent-glow)',
            }}
          />

          {/* 中央文字 — 大标题 + 副标题 */}
          <div
            style={{
              position: 'relative',
              textAlign: 'center',
              fontFamily: 'var(--font-ui)',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '0.02em',
                marginBottom: 'var(--space-3)',
                textShadow: '0 2px 20px rgba(0, 0, 0, 0.6)',
              }}
            >
              释放以分析深度
            </div>
            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                letterSpacing: '0.05em',
              }}
            >
              支持 JPEG / PNG / WEBP / BMP / TIFF
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
