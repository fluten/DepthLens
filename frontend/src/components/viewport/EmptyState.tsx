/**
 * components/viewport/EmptyState.tsx — 全屏空状态引导页
 *
 * 视觉来源:
 *   - Stitch 生成 (projects/9861093748484174395/screens/49a65b7f6091492fa973b7a70f240fd8,
 *     title "DepthLens EmptyState")
 *   - DESIGN.md §6.7 改造清单执行:
 *     ✓ 删除 Stitch 自带的 <style> 块和 CSS reset
 *     ✓ 删除 Stitch 加的 SideNavBar/TopAppBar (违反 DESIGN.md "全沉浸式无顶栏")
 *     ✓ 删除 Stitch 生成的背景色 (用 transparent, 交给 Viewport 的 .viewport bg)
 *     ✓ 所有颜色替换为 CSS Variables / tailwind extend tokens
 *     ✓ 所有圆角替换为 --radius-sm / --radius-md
 *     ✓ 字体替换为 var(--font-ui) / var(--font-mono)
 *     ✓ Material Symbols 替换为 lucide-react (项目已依赖)
 *     ✓ HTML 转 React TSX
 *     ✓ 打开摄像头 button 绑定 inputStore.setMode
 *
 * 职责 (component 层 — 纯渲染 + 简单事件绑定):
 *   - 渲染 "拖入图片查看深度" 引导文案 + 三层深度抽象图标
 *   - "打开摄像头" 按钮 → setMode('camera')
 *   - 上滑箭头暗示 (在 Mode Bar 之上, 提示用户上滑打开 Settings)
 *   - 没有粒子背景 (Phase 2 才做, Phase 1 专注功能)
 *
 * **不渲染键盘快捷键提示行**:
 *   早期版本曾在 fixed bottom-10 渲染过 Space/H/Esc 三个 KeyHint pill, 但
 *   bottom 40px 直接落在 ModeBar (bottom 0, height 80px) 内部, 与模式标签
 *   视觉重叠. 修复: 删除 EmptyState 的键盘 hints, 快捷键提示统一在
 *   SettingsSheet 底部展示 (`Space 关闭 · S 切换 · 1-4 模式`).
 *
 * **z-index**: 这个组件总是被 Viewport 包在 z-0 层内, 不需要自己 fixed
 */
import { motion } from 'framer-motion'
import { ChevronUp, Video } from 'lucide-react'
import { useInputStore } from '../../stores/inputStore'

// ── 组件 ────────────────────────────────────────────────────────────────────

export function EmptyState() {
  const setMode = useInputStore((s) => s.setMode)

  return (
    <div
      // 铺满父 Viewport, 内容整体垂直水平居中.
      // absolute 而非 fixed — 父 Viewport 已经 100vw × 100vh 撑满,
      // 让它处理相对坐标, EmptyState 自己不脱离文档.
      className="absolute inset-0 flex flex-col items-center justify-center px-6 pointer-events-none"
      role="region"
      aria-label="空状态引导"
    >
      {/* ── 主内容区 (相对居中, 略偏上以让键盘提示有呼吸空间) ────────── */}
      {/* pointer-events-auto 让内部的 button 可点, 外层 none 不挡 drop 事件 */}
      <div
        className="flex flex-col items-center"
        style={{ pointerEvents: 'auto' }}
      >
        {/* 三层抽象深度图标 (72px) — 三个嵌套 rounded 方框, 越内圈 opacity 越高.
            来自 Stitch 设计稿, 暗示"深度层次".
            最外层透明度 0.25 恰好等于 --accent-glow token, 直接引用避免硬编码. */}
        <div className="relative w-[72px] h-[72px] flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-[14px]"
            style={{
              border: '1.5px solid var(--accent-glow)',
            }}
          />
          <div
            className="absolute inset-[6px] rounded-[10px]"
            style={{
              border: '1.5px solid rgba(59, 130, 246, 0.5)',
            }}
          />
          <div
            className="absolute inset-[12px] rounded-[6px]"
            style={{
              border: '1.5px solid var(--accent)',
              boxShadow: '0 0 20px var(--accent-glow)',
            }}
          />
        </div>

        {/* ── 标题区 ─────────────────────────────────────────────── */}
        <h1
          className="mt-8"
          style={{
            fontSize: 'var(--text-2xl)',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '0.01em',
            margin: 0,
            marginTop: 'var(--space-8)',
          }}
        >
          拖入图片以查看深度
        </h1>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-secondary)',
            margin: 0,
            marginTop: 'var(--space-3)',
          }}
        >
          或点击选择文件 · 也支持 Ctrl+V 粘贴
        </p>

        {/* ── 分隔线 ─────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-4"
          style={{ marginTop: 'var(--space-8)' }}
        >
          <div
            style={{
              height: '1px',
              width: '40px',
              background: 'var(--border)',
            }}
          />
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            或
          </span>
          <div
            style={{
              height: '1px',
              width: '40px',
              background: 'var(--border)',
            }}
          />
        </div>

        {/* ── Ghost button "打开摄像头" ──────────────────────────── */}
        <button
          type="button"
          onClick={() => setMode('camera')}
          className="group inline-flex items-center gap-2 transition-all duration-fast"
          style={{
            marginTop: 'var(--space-6)',
            height: '44px',
            padding: '0 var(--space-5)',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-hover)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <Video size={16} strokeWidth={1.8} />
          <span>打开摄像头</span>
        </button>
      </div>

      {/* ── 上滑箭头暗示 (TODO.md "上滑箭头暗示") ──────────────────────
          位置: ModeBar (height 80px, bottom 0) 之上 20px, 即 bottom 100px.
          脉冲 fade + 上下浮动, 暗示"从底部上滑打开设置".
          UX (SPEC §13.2): 静态版本, 不依赖 onboarding storage —
          onboarding 跟踪是 Phase 4 任务, Phase 1 让所有会话都显示. */}
      <motion.div
        className="fixed left-1/2 -translate-x-1/2 pointer-events-none select-none"
        style={{
          // ModeBar 占 0-80px, 上方 20px 间隙 = 100px
          bottom: '100px',
          color: 'var(--text-tertiary)',
        }}
        aria-hidden="true"
        animate={{
          opacity: [0.3, 0.9, 0.3],
          y: [0, -4, 0],
        }}
        transition={{
          duration: 2.4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <ChevronUp size={20} strokeWidth={1.5} />
      </motion.div>
    </div>
  )
}
