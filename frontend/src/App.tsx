/**
 * App.tsx — Phase 1 根布局
 *
 * 把 Phase 1 的全部前端零件拼成一个可运行的沉浸式界面:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ Viewport (100vw × 100vh, z-0)               │
 *   │   ├─ EmptyState / DepthCanvas2D             │
 *   │   └─ ScanlineLoader (推理中)                │
 *   │                                              │
 *   │ ConnectionBar      (固定底部 z-30, 离线时)  │
 *   │ ModeBar            (固定底部 z-40)          │
 *   │ SettingsSheet      (底部上滑  z-50)         │
 *   │ ToastContainer     (顶部居中  z-60)         │
 *   │ DropOverlay        (全屏      z-100, 拖拽时)│
 *   └─────────────────────────────────────────────┘
 *
 * 职责 (component 层):
 *   1. 调用 useConnection() 启动 /api/health 轮询 → 驱动 ConnectionBar
 *   2. 调用 useDepthEstimation() 拿 estimateImage 回调
 *   3. 调用 useFileDrop(estimateImage) 拿 isDraggingOver → 驱动 DropOverlay
 *   4. 本地 useState 管理 SettingsSheet 的 snap ('closed' / 'half' / 'full')
 *   5. Space 键 toggle SettingsSheet (closed <-> half) — 唯一的快捷键,
 *      Phase 2 会用 hooks/useKeyboard.ts 统一注册全部快捷键
 *
 * **CLAUDE.md 合规**:
 *   - component 只调 hook + 管本地 UI state, 不 import services/
 *   - 不嵌套 <div> 包围全布局 — 各子组件自己处理定位 (fixed / absolute),
 *     根节点用 Fragment 保持 DOM 扁平
 *
 * **设计参考**: CLAUDE.md §布局约束 "全沉浸式: 无顶栏/无 Logo/无常驻侧边栏"
 */
import { useCallback, useEffect, useState } from 'react'

// 布局组件
import { Viewport } from './components/viewport/Viewport'
import { ModeBar } from './components/overlay/ModeBar'
import {
  SettingsSheet,
  type SheetSnap,
} from './components/overlay/SettingsSheet'
import { DropOverlay } from './components/overlay/DropOverlay'
import { ConnectionBar } from './components/overlay/ConnectionBar'
import { ToastContainer } from './components/ui/ToastContainer'

// Hooks (业务编排)
import { useConnection } from './hooks/useConnection'
import { useDepthEstimation } from './hooks/useDepthEstimation'
import { useFileDrop } from './hooks/useFileDrop'

// ── 组件 ────────────────────────────────────────────────────────────────────

function App() {
  // ── 后端健康轮询 ────────────────────────────────────────────────────
  // 挂载后立即开始 5s 一次轮询, unmount 时自动停止.
  // 驱动 ConnectionBar: disconnected / reconnecting / connected.
  useConnection()

  // ── 深度推理编排 ────────────────────────────────────────────────────
  // estimateImage(file) 会走 validate → preprocess → api → decode →
  // stats → setResult 的全流程, 并自动管理 isProcessing 状态
  // (驱动 Viewport 显示 ScanlineLoader), 永不抛异常 (失败内部 toast).
  const { estimateImage } = useDepthEstimation()

  // ── 全局拖拽 / 粘贴文件入口 ─────────────────────────────────────────
  // 监听 window 级 dragenter/over/leave/drop + Ctrl+V paste,
  // 拿到 file 后直接喂给 estimateImage.
  // isDraggingOver → 驱动 DropOverlay 的显示/隐藏.
  const onFile = useCallback(
    (file: File) => {
      void estimateImage(file)
    },
    [estimateImage]
  )
  const { isDraggingOver } = useFileDrop(onFile)

  // ── Settings Sheet snap state ────────────────────────────────────────
  // Phase 1 默认关闭, Space 键 toggle (closed <-> half).
  // Phase 2 会在 useKeyboard.ts 统一注册全部快捷键并扩展 S 切换.
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('closed')

  // Space 键 toggle SettingsSheet — Phase 1 临时入口
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 避免在输入框里按空格也触发 (未来如果加了 input/textarea)
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        setSheetSnap((prev) => (prev === 'closed' ? 'half' : 'closed'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── 渲染 ─────────────────────────────────────────────────────────────
  // 根节点用 Fragment, 各组件自己负责 fixed / absolute 定位.
  // z-index 顺序由 tailwind.config 的 zIndex token 保证 (DESIGN.md §9).
  return (
    <>
      {/* 主视口 — z-0, 100vw × 100vh, 自带暗角 vignette */}
      <Viewport />

      {/* 离线状态条 — z-30, 仅在 status !== 'connected' 时渲染 */}
      <ConnectionBar />

      {/* 模式切换条 — z-40, 固定底部 */}
      <ModeBar />

      {/* 设置面板 — z-50, 受控 snap 状态, 关闭时不渲染 */}
      <SettingsSheet snap={sheetSnap} onSnapChange={setSheetSnap} />

      {/* Toast 通知 — z-60, 订阅 toast service */}
      <ToastContainer />

      {/* 拖拽覆盖层 — z-100, 最顶层, 拖动时显示 */}
      <DropOverlay visible={isDraggingOver} />
    </>
  )
}

export default App
