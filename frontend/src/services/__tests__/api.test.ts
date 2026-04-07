/**
 * api.test.ts — ApiClient 端点测试 (请求形态 + 响应解析)
 *
 * 错误路径测试在 api.errors.test.ts. 拆分原因: CLAUDE.md 单文件 ≤ 300 行.
 *
 * 测试策略:
 * - 用 vi.spyOn(globalThis, 'fetch') 替换 fetch, 不发真实网络请求
 * - 每个端点验证两个维度: 请求形态 + 响应解析
 * - 用 new ApiClient('') 构造, 不依赖单例 — 避免测试间状态污染
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ApiClient,
  ApiError,
  type DepthResult,
  type HealthResponse,
  type ModelInfo,
  type ModelLoadResponse,
  type SystemInfo,
} from '../api'
import { okResponse } from './_apiTestHelpers'

let client: ApiClient
let fetchMock: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  client = new ApiClient('')
  fetchMock = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── ApiError 类 ────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('继承 Error, 字段保留', () => {
    const err = new ApiError(507, 'ModelOOMError', '显存不足')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.statusCode).toBe(507)
    expect(err.errorClass).toBe('ModelOOMError')
    expect(err.userMessage).toBe('显存不足')
    expect(err.message).toBe('显存不足') // super(userMessage)
    expect(err.name).toBe('ApiError')
  })
})

// ── GET /api/health ────────────────────────────────────────────────────────

describe('ApiClient.getHealth', () => {
  it('请求形态正确', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: 'ok', device: 'cpu', models_loaded: [] })
    )
    await client.getHealth()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/health', undefined)
  })

  it('响应解析正确', async () => {
    const body: HealthResponse = {
      status: 'ok',
      device: 'cuda',
      models_loaded: ['depth-anything-v2-small'],
    }
    fetchMock.mockResolvedValueOnce(okResponse(body))
    const r = await client.getHealth()
    expect(r).toEqual(body)
  })
})

// ── GET /api/system/info ───────────────────────────────────────────────────

describe('ApiClient.getSystemInfo', () => {
  it('请求 + 解析', async () => {
    const body: SystemInfo = {
      gpu_name: 'RTX 4090',
      gpu_vram_mb: 24576,
      gpu_vram_used_mb: 1024,
      cpu: 'Intel i9',
      ram_mb: 32768,
      cuda_available: true,
      torch_version: '2.4.0',
    }
    fetchMock.mockResolvedValueOnce(okResponse(body))
    const r = await client.getSystemInfo()
    expect(fetchMock).toHaveBeenCalledWith('/api/system/info', undefined)
    expect(r).toEqual(body)
  })

  it('CPU-only 模式 gpu 字段为 null', async () => {
    const body: SystemInfo = {
      gpu_name: null,
      gpu_vram_mb: null,
      gpu_vram_used_mb: null,
      cpu: 'Apple M1',
      ram_mb: 16384,
      cuda_available: false,
      torch_version: '2.4.0',
    }
    fetchMock.mockResolvedValueOnce(okResponse(body))
    const r = await client.getSystemInfo()
    expect(r.gpu_name).toBeNull()
    expect(r.cuda_available).toBe(false)
  })
})

// ── GET /api/models ────────────────────────────────────────────────────────

describe('ApiClient.listModels', () => {
  it('解析数组', async () => {
    const body: ModelInfo[] = [
      {
        id: 'depth-anything-v2-small',
        name: 'Depth Anything V2 · Small',
        size: 'small',
        estimated_vram_mb: 400,
        loaded: false,
      },
      {
        id: 'depth-anything-v2-base',
        name: 'Depth Anything V2 · Base',
        size: 'base',
        estimated_vram_mb: 900,
        loaded: true,
      },
    ]
    fetchMock.mockResolvedValueOnce(okResponse(body))
    const r = await client.listModels()
    expect(fetchMock).toHaveBeenCalledWith('/api/models', undefined)
    expect(r).toHaveLength(2)
    expect(r[1]!.loaded).toBe(true)
  })
})

// ── POST /api/models/load ──────────────────────────────────────────────────

describe('ApiClient.loadModel', () => {
  it('请求 body 是 { model_id }', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        status: 'ready',
        model_id: 'depth-anything-v2-small',
        device: 'cuda',
        load_time_ms: 1234,
        vram_used_mb: 410,
      })
    )
    await client.loadModel('depth-anything-v2-small')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/models/load',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: 'depth-anything-v2-small' }),
      })
    )
  })

  it('响应解析', async () => {
    const body: ModelLoadResponse = {
      status: 'ready',
      model_id: 'depth-anything-v2-base',
      device: 'cuda',
      load_time_ms: 5678,
      vram_used_mb: 920,
    }
    fetchMock.mockResolvedValueOnce(okResponse(body))
    const r = await client.loadModel('depth-anything-v2-base')
    expect(r).toEqual(body)
  })

  it('CPU 模式 vram_used_mb 是 null', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        status: 'ready',
        model_id: 'depth-anything-v2-small',
        device: 'cpu',
        load_time_ms: 8000,
        vram_used_mb: null,
      })
    )
    const r = await client.loadModel('depth-anything-v2-small')
    expect(r.vram_used_mb).toBeNull()
  })
})

// ── POST /api/models/unload ────────────────────────────────────────────────

describe('ApiClient.unloadModel', () => {
  it('请求 + 解析', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ status: 'ok' }))
    const r = await client.unloadModel()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/models/unload',
      expect.objectContaining({ method: 'POST' })
    )
    expect(r.status).toBe('ok')
  })
})

// ── POST /api/depth/image ──────────────────────────────────────────────────

describe('ApiClient.predictDepth', () => {
  const sampleResult: DepthResult = {
    depth_b64: 'AAAAQA==', // 4 bytes
    width: 2,
    height: 1,
    inference_ms: 42,
    stats: { min: 0, max: 1, mean: 0.5, median: 0.5 },
    model_id: 'depth-anything-v2-small',
    device: 'cpu',
  }

  it('multipart 请求 + 不设 Content-Type (浏览器自动加 boundary)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(sampleResult))
    const file = new File([new Uint8Array(8)], 'test.jpg', {
      type: 'image/jpeg',
    })
    await client.predictDepth(file)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/depth/image')
    expect(init).toBeDefined()
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBeInstanceOf(FormData)
    // 关键: headers 应该没有 Content-Type, 让浏览器加 multipart boundary
    expect((init as RequestInit).headers).toBeUndefined()
  })

  it('FormData 包含 image 字段, 文件名透传', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(sampleResult))
    const file = new File([new Uint8Array(8)], 'photo.png', {
      type: 'image/png',
    })
    await client.predictDepth(file)
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const form = init.body as FormData
    const imageField = form.get('image')
    expect(imageField).toBeInstanceOf(File)
    expect((imageField as File).name).toBe('photo.png')
  })

  it('Blob 输入 (无 name) 自动包成 image.jpg', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(sampleResult))
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    await client.predictDepth(blob)
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const form = init.body as FormData
    const imageField = form.get('image') as File
    expect(imageField.name).toBe('image.jpg')
  })

  it('invertDepth=true 加 query string', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(sampleResult))
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    await client.predictDepth(blob, { invertDepth: true })
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/depth/image?invert_depth=true')
  })

  it('invertDepth=false 不加 query string', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(sampleResult))
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    await client.predictDepth(blob, { invertDepth: false })
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/depth/image')
  })

  it('响应解析', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(sampleResult))
    const blob = new Blob([new Uint8Array(8)], { type: 'image/jpeg' })
    const r = await client.predictDepth(blob)
    expect(r).toEqual(sampleResult)
  })
})
