/**
 * useModelLoader.test.ts — 模型加载/卸载 hook 单测
 *
 * 主要测纯逻辑函数 loadModelLogic / unloadModelLogic, 因为 useModelLoader
 * 本身只是 useCallback 包了一层. 烟雾级 hook 测试也加了一个.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadModelLogic,
  unloadModelLogic,
  useModelLoader,
} from '../useModelLoader'
import {
  ApiClient,
  ApiError,
  type ModelLoadResponse,
  type ModelUnloadResponse,
} from '../../services/api'
import {
  MODEL_STORE_INITIAL,
  useModelStore,
} from '../../stores/modelStore'

beforeEach(() => {
  useModelStore.setState(MODEL_STORE_INITIAL)
})

// ── 测试助手 ────────────────────────────────────────────────────────────────

function makeToast() {
  return {
    success: vi.fn<(t: string) => void>(),
    info: vi.fn<(t: string) => void>(),
    error: vi.fn<(t: string) => void>(),
    warning: vi.fn<(t: string) => void>(),
  }
}

// ── loadModelLogic ─────────────────────────────────────────────────────────

describe('loadModelLogic — 成功路径', () => {
  it('GPU 模式: 写 currentModel + device + vram + status=ready + toast.success', async () => {
    const client = new ApiClient('')
    const resp: ModelLoadResponse = {
      status: 'ready',
      model_id: 'depth-anything-v2-small',
      device: 'cuda',
      load_time_ms: 1234,
      vram_used_mb: 410,
    }
    vi.spyOn(client, 'loadModel').mockResolvedValueOnce(resp)
    const toast = makeToast()

    // logic 期间会观察 setStatus('loading'), 用一个 spy 包一层 store 也行,
    // 这里直接调真 store 验证最终态.
    const ok = await loadModelLogic(
      client,
      useModelStore.getState(),
      toast,
      'depth-anything-v2-small'
    )

    expect(ok).toBe(true)
    const s = useModelStore.getState()
    expect(s.currentModel).toBe('depth-anything-v2-small')
    expect(s.device).toBe('cuda')
    expect(s.vramUsage).toBe(410)
    expect(s.status).toBe('ready')
    expect(s.errorMessage).toBeNull()
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('CPU 模式: vram_used_mb=null → store.vramUsage=0', async () => {
    const client = new ApiClient('')
    vi.spyOn(client, 'loadModel').mockResolvedValueOnce({
      status: 'ready',
      model_id: 'depth-anything-v2-small',
      device: 'cpu',
      load_time_ms: 8000,
      vram_used_mb: null,
    })

    await loadModelLogic(
      client,
      useModelStore.getState(),
      makeToast(),
      'depth-anything-v2-small'
    )
    expect(useModelStore.getState().vramUsage).toBe(0)
    expect(useModelStore.getState().device).toBe('cpu')
  })

  it('过程中先把 status 切到 loading (验证状态转换)', async () => {
    const client = new ApiClient('')
    let observed: string | null = null
    vi.spyOn(client, 'loadModel').mockImplementation(async () => {
      // 在 mock 内部观察 store 当前状态 = loading
      observed = useModelStore.getState().status
      return {
        status: 'ready',
        model_id: 'depth-anything-v2-small',
        device: 'cpu',
        load_time_ms: 100,
        vram_used_mb: null,
      } as const
    })

    await loadModelLogic(
      client,
      useModelStore.getState(),
      makeToast(),
      'depth-anything-v2-small'
    )
    expect(observed).toBe('loading')
  })
})

describe('loadModelLogic — 失败路径', () => {
  it('ApiError → setError + toast.error', async () => {
    const client = new ApiClient('')
    vi.spyOn(client, 'loadModel').mockRejectedValueOnce(
      new ApiError(507, 'ModelOOMError', '显存不足')
    )
    const toast = makeToast()

    const ok = await loadModelLogic(
      client,
      useModelStore.getState(),
      toast,
      'depth-anything-v2-large'
    )
    expect(ok).toBe(false)
    const s = useModelStore.getState()
    expect(s.status).toBe('error')
    expect(s.errorMessage).toBe('显存不足')
    expect(s.currentModel).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('显存不足')
  })

  it('非 ApiError 异常 → 兜底中文消息', async () => {
    const client = new ApiClient('')
    vi.spyOn(client, 'loadModel').mockRejectedValueOnce(new TypeError('boom'))
    const toast = makeToast()

    const ok = await loadModelLogic(
      client,
      useModelStore.getState(),
      toast,
      'depth-anything-v2-small'
    )
    expect(ok).toBe(false)
    expect(useModelStore.getState().status).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('模型加载失败 · 未知错误')
  })

  it('后端返回 status=error (200 + payload) 也走错误分支', async () => {
    const client = new ApiClient('')
    vi.spyOn(client, 'loadModel').mockResolvedValueOnce({
      status: 'error',
      model_id: 'depth-anything-v2-small',
      device: 'cpu',
      load_time_ms: 0,
      vram_used_mb: null,
    })
    const toast = makeToast()

    const ok = await loadModelLogic(
      client,
      useModelStore.getState(),
      toast,
      'depth-anything-v2-small'
    )
    expect(ok).toBe(false)
    expect(useModelStore.getState().status).toBe('error')
    expect(toast.error).toHaveBeenCalled()
  })
})

// ── unloadModelLogic ───────────────────────────────────────────────────────

describe('unloadModelLogic', () => {
  it('成功 → reset + toast.info', async () => {
    // 先把 store 设成 ready 状态
    useModelStore.setState({
      currentModel: 'depth-anything-v2-small',
      status: 'ready',
      device: 'cuda',
      vramUsage: 400,
      downloadProgress: 0,
      errorMessage: null,
    })

    const client = new ApiClient('')
    const resp: ModelUnloadResponse = { status: 'ok' }
    vi.spyOn(client, 'unloadModel').mockResolvedValueOnce(resp)
    const toast = makeToast()

    const ok = await unloadModelLogic(
      client,
      useModelStore.getState(),
      toast
    )
    expect(ok).toBe(true)
    const s = useModelStore.getState()
    expect(s.currentModel).toBeNull()
    expect(s.status).toBe('idle')
    expect(s.vramUsage).toBe(0)
    expect(toast.info).toHaveBeenCalledWith('模型已卸载')
  })

  it('失败 → setError + toast.error, 不 reset', async () => {
    useModelStore.setState({
      currentModel: 'depth-anything-v2-small',
      status: 'ready',
      device: 'cpu',
      vramUsage: 0,
      downloadProgress: 0,
      errorMessage: null,
    })

    const client = new ApiClient('')
    vi.spyOn(client, 'unloadModel').mockRejectedValueOnce(
      new ApiError(500, 'InternalError', '后端错误')
    )
    const toast = makeToast()

    const ok = await unloadModelLogic(
      client,
      useModelStore.getState(),
      toast
    )
    expect(ok).toBe(false)
    expect(useModelStore.getState().status).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('后端错误')
  })
})

// ── useModelLoader hook (烟雾) ─────────────────────────────────────────────

import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

describe('useModelLoader (smoke)', () => {
  it('返回 loadModel/unloadModel 回调, 调用后真的写 store', async () => {
    const client = new ApiClient('')
    vi.spyOn(client, 'loadModel').mockResolvedValue({
      status: 'ready',
      model_id: 'depth-anything-v2-small',
      device: 'cpu',
      load_time_ms: 100,
      vram_used_mb: null,
    })
    const toast = makeToast()

    const captured: { load?: (id: string) => Promise<boolean> } = {}

    function Probe() {
      const api = useModelLoader({ client, toast })
      // 把 loadModel 暴露给外部, 让测试直接调用
      useEffect(() => {
        captured.load = api.loadModel
      }, [api.loadModel])
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(Probe))
    })

    expect(captured.load).toBeDefined()
    await act(async () => {
      await captured.load!('depth-anything-v2-small')
    })

    expect(useModelStore.getState().currentModel).toBe('depth-anything-v2-small')
    expect(toast.success).toHaveBeenCalled()
    container.remove()
  })
})
