/**
 * stores/viewportStore.ts — 视口可视化参数
 *
 * 与 SPEC §8 ViewportStore interface 严格对齐.
 *
 * 所有字段都是"用户可调"的可视化偏好, 不涉及深度数据本身.
 * 例如切 colormap 不会重新触发推理 (颜色映射在前端 lib/depth.applyColormap 完成).
 */
import { create } from 'zustand'
import { DEFAULT_COLORMAP_ID, type ColormapId } from '../lib/constants'

// ── 类型 ────────────────────────────────────────────────────────────────────

/**
 * 视口显示模式. 与 SPEC §8 ViewportStore.viewMode 一致.
 * - '2d': 单张深度图 (默认)
 * - '3d': React Three Fiber 点云
 * - 'split': 左右对比, 中间拖拽分割线
 * - 'overlay': 原图 + 深度图 alpha 混合
 */
export type ViewMode = '2d' | '3d' | 'split' | 'overlay'

/** 深度范围裁剪 [low, high], 都 ∈ [0,1], low < high */
export type DepthRange = readonly [number, number]

export interface ViewportStoreState {
  viewMode: ViewMode
  colormap: ColormapId
  /** 深度范围裁剪. 默认 [0,1] 表示不裁剪 */
  depthRange: DepthRange
  /** 是否反转深度方向 (1 - depth) */
  invertDepth: boolean
  /** Overlay 模式下原图与深度图的混合比例, 0=纯原图, 1=纯深度图 */
  overlayAlpha: number
  /** 3D 点云模式下每个点的像素大小 */
  pointSize: number
  /** 是否显示左上角 HUD 数据面板, 默认隐藏, 用户按 H 切换 */
  showHUD: boolean
}

export interface ViewportStoreActions {
  setViewMode: (mode: ViewMode) => void
  setColormap: (id: ColormapId) => void
  /** 设置深度范围. 自动 clamp 到 [0,1] 并保证 low < high */
  setDepthRange: (range: DepthRange) => void
  /** 切换反转深度 (toggle) */
  toggleInvertDepth: () => void
  /** 直接设置反转深度 (用于状态恢复) */
  setInvertDepth: (v: boolean) => void
  /** 设置 overlay alpha, 自动 clamp 到 [0,1] */
  setOverlayAlpha: (alpha: number) => void
  /** 设置点大小, 自动钳到 ≥ 1 */
  setPointSize: (size: number) => void
  /** 切换 HUD 显示 (toggle), 对应快捷键 H */
  toggleHUD: () => void
  /** 直接设置 HUD 显示 */
  setShowHUD: (v: boolean) => void
  reset: () => void
}

export type ViewportStore = ViewportStoreState & ViewportStoreActions

// ── 初始状态 ───────────────────────────────────────────────────────────────

export const VIEWPORT_STORE_INITIAL: ViewportStoreState = {
  viewMode: '2d',
  colormap: DEFAULT_COLORMAP_ID,
  depthRange: [0, 1],
  invertDepth: false,
  overlayAlpha: 0.5,
  pointSize: 1,
  showHUD: false,
}

// ── store ──────────────────────────────────────────────────────────────────

// **NaN 防御**: NaN < 0 和 NaN > 1 都返回 false, 普通三元 clamp 会让 NaN
// 直接写入 state. 必须先 Number.isFinite 兜住. 教训来源: lib/depth.ts.

/** 钳到 [0,1], 非有限值 → 0 */
const clamp01 = (n: number): number => {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** 钳到 ≥ 1, 非有限值 → 1 */
const clampMinOne = (n: number): number => {
  if (!Number.isFinite(n)) return 1
  return n < 1 ? 1 : n
}

export const useViewportStore = create<ViewportStore>((set) => ({
  ...VIEWPORT_STORE_INITIAL,

  setViewMode: (mode) => set({ viewMode: mode }),

  setColormap: (id) => set({ colormap: id }),

  setDepthRange: (range) => {
    const low = clamp01(range[0])
    const high = clamp01(range[1])
    // 保证 low < high; 若用户传了反向区间, 强制保留至少 1/256 间距
    const safeLow = Math.min(low, high)
    const safeHigh = Math.max(low, high)
    const finalHigh = safeHigh === safeLow ? Math.min(1, safeLow + 1 / 256) : safeHigh
    set({ depthRange: [safeLow, finalHigh] as const })
  },

  toggleInvertDepth: () => set((s) => ({ invertDepth: !s.invertDepth })),

  setInvertDepth: (v) => set({ invertDepth: v }),

  setOverlayAlpha: (alpha) => set({ overlayAlpha: clamp01(alpha) }),

  setPointSize: (size) => set({ pointSize: clampMinOne(size) }),

  toggleHUD: () => set((s) => ({ showHUD: !s.showHUD })),

  setShowHUD: (v) => set({ showHUD: v }),

  reset: () => set({ ...VIEWPORT_STORE_INITIAL }),
}))
