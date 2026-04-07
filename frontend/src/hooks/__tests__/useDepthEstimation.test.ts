/**
 * useDepthEstimation.test.ts — 深度推理 hook 单测
 *
 * 主要测纯逻辑函数 estimateImageLogic, 因为 useDepthEstimation 本身只是
 * useCallback + useRef + useEffect 包了一层. 烟雾级 hook 测试也加了一个.
 *
 * 关键点:
 * - happy-dom 默认提供 createImageBitmap, 但其实现不支持任意 File 输入,
 *   所以 preprocessImage 需要 mock. 直接 vi.mock('../../lib/image').
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/image', () => ({
  preprocessImage: vi.fn(),
}))

import { estimateImageLogic } from '../useDepthEstimation'
import {
  ApiClient,
  ApiError,
  type DepthResult,
} from '../../services/api'
import {
  DEPTH_STORE_INITIAL,
  useDepthStore,
} from '../../stores/depthStore'
import { preprocessImage } from '../../lib/image'

const mockedPreprocess = vi.mocked(preprocessImage)

beforeEach(() => {
  useDepthStore.setState(DEPTH_STORE_INITIAL)
  mockedPreprocess.mockReset()
})

// ── 测试助手 ────────────────────────────────────────────────────────────────

function makeToast() {
  return {
    warning: vi.fn<(t: string) => void>(),
    error: vi.fn<(t: string) => void>(),
  }
}

function makeJpegFile(name = 'test.jpg', bytes = 32): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })
}

/**
 * 构造一个合法的 DepthResult, depth_b64 编码 4 个 float32 值 [0, 0.25, 0.5, 1].
 */
function makeDepthResult(): DepthResult {
  // 4 floats × 4 bytes = 16 bytes
  const f = new Float32Array([0, 0.25, 0.5, 1])
  const u8 = new Uint8Array(f.buffer)
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!)
  const b64 = btoa(bin)
  return {
    depth_b64: b64,
    width: 2,
    height: 2,
    inference_ms: 42,
    stats: { min: 0, max: 1, mean: 0.4375, median: 0.375 },
    model_id: 'depth-anything-v2-small',
    device: 'cpu',
  }
}

// ── estimateImageLogic ─────────────────────────────────────────────────────

describe('estimateImageLogic — 校验失败', () => {
  it('文件大小为 0 → toast.warning + 不调 api', async () => {
    const client = new ApiClient('')
    const apiSpy = vi.spyOn(client, 'predictDepth')
    const toast = makeToast()
    const empty = new File([], 'empty.jpg', { type: 'image/jpeg' })

    const ok = await estimateImageLogic(
      client,
      useDepthStore.getState(),
      toast,
      empty
    )
    expect(ok).toBe(false)
    expect(toast.warning).toHaveBeenCalled()
    expect(apiSpy).not.toHaveBeenCalled()
    expect(useDepthStore.getState().isProcessing).toBe(false)
  })

  it('不支持的扩展名 → toast.warning', async () => {
    const client = new ApiClient('')
    const toast = makeToast()
    const txt = new File([new Uint8Array(8)], 'note.txt', { type: 'text/plain' })

    const ok = await estimateImageLogic(
      client,
      useDepthStore.getState(),
      toast,
      txt
    )
    expect(ok).toBe(false)
    expect(toast.warning).toHaveBeenCalled()
  })
})

describe('estimateImageLogic — 预处理失败', () => {
  it('preprocessImage 抛错 → toast.error + 不调 api', async () => {
    mockedPreprocess.mockRejectedValueOnce(new Error('图片解码失败: bad data'))

    const client = new ApiClient('')
    const apiSpy = vi.spyOn(client, 'predictDepth')
    const toast = makeToast()

    const ok = await estimateImageLogic(
      client,
      useDepthStore.getState(),
      toast,
      makeJpegFile()
    )
    expect(ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('图片解码失败: bad data')
    expect(apiSpy).not.toHaveBeenCalled()
  })
})

describe('estimateImageLogic — 完整成功流程', () => {
  it('写 depth + width + height + stats + isProcessing=false', async () => {
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    mockedPreprocess.mockResolvedValueOnce({
      blob,
      width: 2,
      height: 2,
      reencoded: false,
      resized: false,
    })

    const client = new ApiClient('')
    const result = makeDepthResult()
    vi.spyOn(client, 'predictDepth').mockResolvedValueOnce(result)
    const toast = makeToast()

    const ok = await estimateImageLogic(
      client,
      useDepthStore.getState(),
      toast,
      makeJpegFile()
    )
    expect(ok).toBe(true)

    const s = useDepthStore.getState()
    expect(s.depthMap).toBeInstanceOf(Float32Array)
    expect(s.depthMap!.length).toBe(4)
    expect(Array.from(s.depthMap!)).toEqual([0, 0.25, 0.5, 1])
    expect(s.width).toBe(2)
    expect(s.height).toBe(2)
    expect(s.inferenceMs).toBe(42)
    expect(s.stats).not.toBeNull()
    expect(s.stats!.min).toBe(0)
    expect(s.stats!.max).toBe(1)
    expect(s.isProcessing).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('过程中 isProcessing 先变 true (验证状态机)', async () => {
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    mockedPreprocess.mockResolvedValueOnce({
      blob,
      width: 2,
      height: 2,
      reencoded: false,
      resized: false,
    })

    const client = new ApiClient('')
    let observedProcessing: boolean | null = null
    vi.spyOn(client, 'predictDepth').mockImplementation(async () => {
      observedProcessing = useDepthStore.getState().isProcessing
      return makeDepthResult()
    })

    await estimateImageLogic(
      client,
      useDepthStore.getState(),
      makeToast(),
      makeJpegFile()
    )
    expect(observedProcessing).toBe(true)
  })
})

describe('estimateImageLogic — API 失败', () => {
  it('ApiError → toast.error + isProcessing=false', async () => {
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    mockedPreprocess.mockResolvedValueOnce({
      blob,
      width: 2,
      height: 2,
      reencoded: false,
      resized: false,
    })

    const client = new ApiClient('')
    vi.spyOn(client, 'predictDepth').mockRejectedValueOnce(
      new ApiError(507, 'ModelOOMError', '显存不足')
    )
    const toast = makeToast()

    const ok = await estimateImageLogic(
      client,
      useDepthStore.getState(),
      toast,
      makeJpegFile()
    )
    expect(ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('显存不足')
    expect(useDepthStore.getState().isProcessing).toBe(false)
  })

  it('AbortError → 静默 (不 toast) + isProcessing=false', async () => {
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    mockedPreprocess.mockResolvedValueOnce({
      blob,
      width: 2,
      height: 2,
      reencoded: false,
      resized: false,
    })

    const client = new ApiClient('')
    vi.spyOn(client, 'predictDepth').mockRejectedValueOnce(
      new ApiError(0, 'AbortError', '请求已取消')
    )
    const toast = makeToast()

    const ok = await estimateImageLogic(
      client,
      useDepthStore.getState(),
      toast,
      makeJpegFile()
    )
    expect(ok).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
    expect(useDepthStore.getState().isProcessing).toBe(false)
  })
})

describe('estimateImageLogic — 取消信号', () => {
  it('signal 在预处理后已 abort → 不调 api 直接返回', async () => {
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    mockedPreprocess.mockResolvedValueOnce({
      blob,
      width: 2,
      height: 2,
      reencoded: false,
      resized: false,
    })

    const client = new ApiClient('')
    const apiSpy = vi.spyOn(client, 'predictDepth')

    const controller = new AbortController()
    controller.abort()

    const ok = await estimateImageLogic(
      client,
      useDepthStore.getState(),
      makeToast(),
      makeJpegFile(),
      controller.signal
    )
    expect(ok).toBe(false)
    expect(apiSpy).not.toHaveBeenCalled()
    expect(useDepthStore.getState().isProcessing).toBe(false)
  })
})
