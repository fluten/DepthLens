/**
 * hooks/useDepthEstimation.ts — 图片深度推理全流程编排
 *
 * 职责 (hook 层 — 业务编排):
 *   1. 校验文件格式 / 大小 (lib/validators.validateImageFile)
 *   2. 浏览器侧预处理 (lib/image.preprocessImage — EXIF 修正 + 缩放 + 压缩)
 *   3. setProcessing(true) 通知 UI 进入扫描线状态
 *   4. POST /api/depth/image (services/api.predictDepth)
 *   5. base64 → Float32Array (lib/depth.decodeDepthBase64)
 *   6. 计算 stats (lib/depth.computeStats)
 *   7. 写入 depthStore.setResult, isProcessing 自动 false
 *   8. 同时把原图 ImageBitmap 写入 depthStore.setOriginal (供 SplitView/Overlay)
 *   9. 失败 → toast.error(用户消息) + setProcessing(false)
 *
 * 取消支持 (SPEC §13.3 "并发推理"):
 * - 内部维护一个 AbortController, 新 estimate 调用会自动 abort 旧请求
 * - unmount 时也 abort 在飞的请求, 避免 setState on unmounted
 *
 * 注意:
 * - 第 5 步 decodeDepthBase64 在主线程跑, 1080p 图~50ms 可接受 (Phase 1 范围)
 *   未来 Phase 2 如果性能不够再迁移到 worker
 * - 第 8 步 setOriginal 用 createImageBitmap 重新生成 (preprocessImage 内部
 *   close 了第一份 bitmap), 这里需要再 decode 一次原 file. 不复用 preprocessed
 *   blob 是因为它已经是 jpeg 重编码版, 失去了原图的色彩保真.
 */

import { useCallback, useEffect, useRef } from 'react'
import { computeStats, decodeDepthBase64 } from '../lib/depth'
import { preprocessImage } from '../lib/image'
import { validateImageFile } from '../lib/validators'
import {
  ApiError,
  apiClient as defaultApiClient,
  type ApiClient,
} from '../services/api'
import { toast as defaultToast } from '../services/toast'
import { useDepthStore, type DepthStore } from '../stores/depthStore'

// ── 注入点类型 ──────────────────────────────────────────────────────────────

type DepthStoreSetters = Pick<
  DepthStore,
  'setResult' | 'setOriginal' | 'setProcessing'
>

interface ToastLike {
  warning: (text: string) => void
  error: (text: string) => void
}

// ── 纯 async 逻辑 ──────────────────────────────────────────────────────────

/**
 * 单次图片深度推理. **不抛异常** — 所有失败路径都已经 toast + setProcessing(false).
 *
 * @param signal  AbortSignal, 用于取消进行中的网络请求
 * @returns       成功 true / 失败 (含取消) false
 */
export async function estimateImageLogic(
  client: ApiClient,
  store: DepthStoreSetters,
  toast: ToastLike,
  file: File,
  signal?: AbortSignal
): Promise<boolean> {
  // 1. 校验
  const validation = validateImageFile(file)
  if (!validation.ok) {
    toast.warning(validation.message)
    return false
  }

  // 2. 预处理 (失败 = 解码失败, toast.error 后退出)
  let processed: Awaited<ReturnType<typeof preprocessImage>>
  try {
    processed = await preprocessImage(file)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '图片预处理失败'
    toast.error(msg)
    return false
  }

  // 取消检查: 预处理可能很慢, 期间组件可能 unmount
  if (signal?.aborted) return false

  // 3. 进入处理状态 — 触发 UI 显示扫描线
  store.setProcessing(true)

  try {
    // 4. 调用后端
    const result = await client.predictDepth(processed.blob, { signal })

    // 5. base64 → Float32Array
    const depthArray = decodeDepthBase64(result.depth_b64)

    // 6. 计算统计 (后端也会算, 但前端 lib/depth.computeStats 跟后端等价,
    //    这里复算一次让 store.stats 与 depthArray 一一对应, 不依赖网络字段)
    const stats = computeStats(depthArray)

    // 7. 写入 store — setResult 内部会自动 setProcessing(false)
    store.setResult(
      depthArray,
      result.width,
      result.height,
      result.inference_ms,
      stats
    )

    // 8. 异步加载原图位图到 store (供 split / overlay 使用).
    //    不 await — 失败也不影响主流程, 静默吞掉
    void loadOriginalBitmap(file, store)

    return true
  } catch (err) {
    // 取消 = 静默退出, 不 toast (用户不需要知道)
    if (err instanceof ApiError && err.errorClass === 'AbortError') {
      // setProcessing 仍要复位, 否则 UI 卡在扫描线
      store.setProcessing(false)
      return false
    }
    const message =
      err instanceof ApiError ? err.userMessage : '深度推理失败 · 未知错误'
    toast.error(message)
    store.setProcessing(false)
    return false
  }
}

/**
 * 把原 file 解码成 ImageBitmap 写入 store. 失败静默 — 没有原图只是
 * SplitView / OverlayView 不可用, 主深度图依然能正常显示.
 *
 * 不放到 estimateImageLogic 主流程是为了:
 * - 不阻塞 setResult (深度图先出, 原图随后出)
 * - 失败不污染主流程错误处理
 */
async function loadOriginalBitmap(
  file: File,
  store: DepthStoreSetters
): Promise<void> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    })
    store.setOriginal(bitmap)
  } catch {
    // 静默 — 原图缺失只影响附加视图
  }
}

// ── React Hook ──────────────────────────────────────────────────────────────

export interface UseDepthEstimationApi {
  /** 跑一次深度推理. 永不抛. 多次调用会 abort 上一次进行中的请求. */
  estimateImage: (file: File) => Promise<boolean>
}

export function useDepthEstimation(options: {
  client?: ApiClient
  toast?: ToastLike
} = {}): UseDepthEstimationApi {
  const client = options.client ?? defaultApiClient
  const toast = options.toast ?? defaultToast

  // 上一次进行中的 AbortController. ref 而非 state — 不需要触发重渲染.
  const inflightRef = useRef<AbortController | null>(null)

  // 组件 unmount 时 abort 在飞的请求
  useEffect(() => {
    return () => {
      inflightRef.current?.abort()
      inflightRef.current = null
    }
  }, [])

  const estimateImage = useCallback(
    async (file: File): Promise<boolean> => {
      // 取消上一次 (如果有)
      inflightRef.current?.abort()
      const controller = new AbortController()
      inflightRef.current = controller

      const ok = await estimateImageLogic(
        client,
        useDepthStore.getState(),
        toast,
        file,
        controller.signal
      )

      // 只有当前 controller 仍是 inflight 时才清空 (避免清掉新一轮的)
      if (inflightRef.current === controller) {
        inflightRef.current = null
      }
      return ok
    },
    [client, toast]
  )

  return { estimateImage }
}
