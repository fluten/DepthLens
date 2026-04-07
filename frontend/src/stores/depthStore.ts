/**
 * stores/depthStore.ts — 深度数据状态
 *
 * 与 SPEC §8 DepthStore interface 严格对齐.
 *
 * 数据流:
 *   1. 用户拖入图片 → hooks/useDepthEstimation 调 lib/image.preprocessImage
 *      → 拿到 ImageBitmap → setOriginal(bitmap)
 *   2. hook 把 blob POST 到 /api/depth/image → 收到 DepthResult JSON
 *      → lib/depth.decodeDepthBase64 → Float32Array → setResult(depth, w, h, ms)
 *   3. component 订阅 depthMap 触发 DepthCanvas2D 重绘
 *
 * 注意:
 * - originalImage 是 ImageBitmap (浏览器原生位图), 不是 URL/Blob
 * - depthMap 是 row-major float32 [0,1] 数组, 长度 = width * height
 * - stats 字段类型 import 自 lib/depth (跨层向下 import 是允许的)
 */
import { create } from 'zustand'
import type { DepthStats } from '../lib/depth'

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface DepthStoreState {
  /** 原图位图. setOriginal 时存入, clear 时调 close() 释放 GPU 资源 */
  originalImage: ImageBitmap | null
  /** 后端返回的归一化深度图, row-major float32 [0,1] */
  depthMap: Float32Array | null
  /** 深度图宽 (像素), 与 depthMap.length 一致: depthMap.length === width * height */
  width: number
  /** 深度图高 (像素) */
  height: number
  /** 深度统计 (HUD 显示用), null 表示尚无结果 */
  stats: DepthStats | null
  /** 是否正在推理 (从 hook setProcessing(true) 进入, 收到结果后 false) */
  isProcessing: boolean
  /** 上一次推理耗时 (ms), 0 表示尚无结果 */
  inferenceMs: number
}

export interface DepthStoreActions {
  /**
   * 设置一次推理结果. 自动: width/height 写入, stats 由 lib/depth.computeStats
   * 在 hook 层算好后传入 (避免 store 触碰 lib), isProcessing 自动置 false.
   */
  setResult: (
    depth: Float32Array,
    width: number,
    height: number,
    inferenceMs: number,
    stats: DepthStats
  ) => void
  /**
   * 设置原图位图. 旧的 ImageBitmap 会被新的覆盖, **不自动 close 旧位图** —
   * 旧位图的释放由 clear() 或调用方负责 (避免 store 间接触发 GPU 副作用).
   */
  setOriginal: (img: ImageBitmap) => void
  setProcessing: (v: boolean) => void
  /**
   * 完全清空所有状态. **不会** 自动调 originalImage.close() — 因为 close
   * 是 GPU 副作用, store 不应触发副作用. 调用方 (hook 层) 应在 clear 前
   * 自行 close 旧 bitmap.
   */
  clear: () => void
}

export type DepthStore = DepthStoreState & DepthStoreActions

// ── 初始状态 ───────────────────────────────────────────────────────────────

export const DEPTH_STORE_INITIAL: DepthStoreState = {
  originalImage: null,
  depthMap: null,
  width: 0,
  height: 0,
  stats: null,
  isProcessing: false,
  inferenceMs: 0,
}

// ── store ──────────────────────────────────────────────────────────────────

export const useDepthStore = create<DepthStore>((set) => ({
  ...DEPTH_STORE_INITIAL,

  setResult: (depth, width, height, inferenceMs, stats) =>
    set({
      depthMap: depth,
      width,
      height,
      inferenceMs,
      stats,
      isProcessing: false,
    }),

  setOriginal: (img) => set({ originalImage: img }),

  setProcessing: (v) => set({ isProcessing: v }),

  clear: () => set({ ...DEPTH_STORE_INITIAL }),
}))
