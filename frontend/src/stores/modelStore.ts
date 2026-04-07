/**
 * stores/modelStore.ts — 模型生命周期状态
 *
 * 与 SPEC §8 ModelStore interface 严格对齐.
 *
 * **CLAUDE.md 硬约束**:
 * - Store 只存纯数据 + 同步 action
 * - 不含 async, 不调 API, 不操作 DOM, 不开定时器
 * - Store 间不互相 import (本文件零跨 store import)
 * - 所有副作用 (调 /api/models/load 等) 由 hooks/useModelLoader 编排
 *
 * 字段对照 SPEC §8:
 * - status 是 5 态: idle / loading / downloading / ready / error
 *   - idle: 初始, 没加载过
 *   - loading: 调 /api/models/load 中, 但模型权重已在本地 (HF cache hit)
 *   - downloading: 模型权重正在从 HuggingFace 下载 (首次使用)
 *   - ready: 已就绪可推理
 *   - error: 加载失败, 详情看 errorMessage
 * - device 默认 'cpu', 等后端响应再修正
 * - vramUsage 单位 MB, CPU 模式恒为 0
 */
import { create } from 'zustand'

// ── 数值防御助手 (NaN/Infinity 处理) ──────────────────────────────────────
//
// **教训来源**: lib/depth.ts 的 applyColormap 防御.
// `NaN < 0` 和 `NaN > 100` 都返回 false, 普通三元 clamp 会让 NaN 直接
// 写入 state, 之后任何 UI 渲染都会 NaN 传染. 必须先用 Number.isFinite 兜住.

/** 钳到 [lo, hi], 非有限值 → fallback (默认 lo) */
const clampFinite = (n: number, lo: number, hi: number, fallback = lo): number => {
  if (!Number.isFinite(n)) return fallback
  if (n < lo) return lo
  if (n > hi) return hi
  return n
}

/** 非负, NaN/-Inf → 0 */
const safeNonNegative = (n: number): number =>
  !Number.isFinite(n) || n < 0 ? 0 : n

// ── 类型 ────────────────────────────────────────────────────────────────────

export type ModelStatus = 'idle' | 'loading' | 'downloading' | 'ready' | 'error'
export type Device = 'cpu' | 'cuda'

export interface ModelStoreState {
  /** 当前已加载 / 加载中的 model_id, idle 状态时为 null */
  currentModel: string | null
  status: ModelStatus
  /** 当前推理设备. CPU 模式时 vramUsage 始终 0 */
  device: Device
  /** 显存占用 (MB), CPU 模式恒 0 */
  vramUsage: number
  /** 模型权重下载进度 0-100, 仅在 status='downloading' 时有意义 */
  downloadProgress: number
  /** 加载失败时的中文用户消息 (来自后端 ErrorResponse.message), 其他状态为 null */
  errorMessage: string | null
}

export interface ModelStoreActions {
  /** 仅更新状态机, 不改其他字段. 状态机切换由 hook 编排 */
  setStatus: (status: ModelStatus) => void
  /**
   * 模型加载成功后调用. 一次性原子地更新 currentModel + device + status='ready'
   * + 清空 errorMessage. vramUsage 单独通过 setVramUsage 设置 (后端响应里会带).
   */
  setModel: (id: string, device: Device) => void
  /** 设置显存占用. 通常和 setModel 一起调用 */
  setVramUsage: (mb: number) => void
  /** 设置下载进度 0-100 */
  setDownloadProgress: (progress: number) => void
  /** 进入 error 状态: status='error' + 写入用户消息 + 清 currentModel */
  setError: (message: string) => void
  /** 完全重置到 idle 初始态 */
  reset: () => void
}

export type ModelStore = ModelStoreState & ModelStoreActions

// ── 初始状态 (export 供测试用) ──────────────────────────────────────────────

export const MODEL_STORE_INITIAL: ModelStoreState = {
  currentModel: null,
  status: 'idle',
  device: 'cpu',
  vramUsage: 0,
  downloadProgress: 0,
  errorMessage: null,
}

// ── store ──────────────────────────────────────────────────────────────────

export const useModelStore = create<ModelStore>((set) => ({
  ...MODEL_STORE_INITIAL,

  setStatus: (status) => set({ status }),

  setModel: (id, device) =>
    set({
      currentModel: id,
      device,
      status: 'ready',
      errorMessage: null,
      downloadProgress: 0,
    }),

  setVramUsage: (mb) => set({ vramUsage: safeNonNegative(mb) }),

  setDownloadProgress: (progress) =>
    set({ downloadProgress: clampFinite(progress, 0, 100) }),

  setError: (message) =>
    set({
      status: 'error',
      errorMessage: message,
      currentModel: null,
      downloadProgress: 0,
      vramUsage: 0,
    }),

  reset: () => set({ ...MODEL_STORE_INITIAL }),
}))
