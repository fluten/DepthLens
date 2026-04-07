/**
 * stores/inputStore.ts — 输入源状态
 *
 * 与 SPEC §8 InputStore interface 严格对齐.
 *
 * 维护"用户当前在哪种输入模式 + 各模式的 session 状态". 数据流方向:
 * - ModeBar 滚轮切换 → setMode → 触发 hook 切换 viewport 渲染
 * - 摄像头权限申请成功 → setCameraDeviceId + setStreaming(true)
 * - 视频上传 → setVideoFile + setVideoStatus('processing')
 * - 视频处理进度回调 → setVideoProgress
 *
 * 注意: 真正的副作用 (打开摄像头 / 上传视频) 在 hooks/useWebcamStream
 * 和 hooks/useVideoProcessor 中完成, 本 store 只存"已经发生"的状态.
 */
import { create } from 'zustand'

// ── 数值防御助手 ────────────────────────────────────────────────────────────
//
// **NaN 防御**: NaN < 0 和 NaN > 100 都返回 false, 普通三元 clamp 会让
// NaN 直接写入 state. 教训来源: lib/depth.ts.

const clampPercent = (n: number): number => {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

// ── 类型 ────────────────────────────────────────────────────────────────────

/** 输入模式 — 与 SPEC §8 一致, 也对应 Mode Bar 的 4 个标签 */
export type InputMode = 'image' | 'video' | 'camera' | '3d'

/** 视频处理状态机 */
export type VideoStatus = 'idle' | 'processing' | 'paused' | 'done'

export interface InputStoreState {
  mode: InputMode
  /** 当前选中的摄像头设备 ID (来自 navigator.mediaDevices.enumerateDevices) */
  cameraDeviceId: string | null
  /** 摄像头是否正在推流 */
  isStreaming: boolean
  /** 用户上传的视频文件 (Phase 3 视频任务用) */
  videoFile: File | null
  /** 视频处理进度 0-100 */
  videoProgress: number
  videoStatus: VideoStatus
}

export interface InputStoreActions {
  setMode: (mode: InputMode) => void
  setCameraDeviceId: (id: string | null) => void
  setStreaming: (v: boolean) => void
  setVideoFile: (file: File | null) => void
  /** 设置视频处理进度 0-100, 自动 clamp */
  setVideoProgress: (progress: number) => void
  setVideoStatus: (status: VideoStatus) => void
  reset: () => void
}

export type InputStore = InputStoreState & InputStoreActions

// ── 初始状态 ───────────────────────────────────────────────────────────────

export const INPUT_STORE_INITIAL: InputStoreState = {
  mode: 'image',
  cameraDeviceId: null,
  isStreaming: false,
  videoFile: null,
  videoProgress: 0,
  videoStatus: 'idle',
}

// ── store ──────────────────────────────────────────────────────────────────

export const useInputStore = create<InputStore>((set) => ({
  ...INPUT_STORE_INITIAL,

  setMode: (mode) => set({ mode }),

  setCameraDeviceId: (id) => set({ cameraDeviceId: id }),

  setStreaming: (v) => set({ isStreaming: v }),

  setVideoFile: (file) => set({ videoFile: file }),

  setVideoProgress: (progress) => set({ videoProgress: clampPercent(progress) }),

  setVideoStatus: (status) => set({ videoStatus: status }),

  reset: () => set({ ...INPUT_STORE_INITIAL }),
}))
