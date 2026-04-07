/**
 * api.errors.test.ts — ApiClient 错误路径 + baseUrl 测试
 *
 * 端点测试在 api.test.ts. 拆分原因: CLAUDE.md 单文件 ≤ 300 行.
 *
 * 覆盖:
 * - 后端 ErrorResponse 形态 (4xx/5xx)
 * - 非 JSON 错误响应 (HTML 错误页等)
 * - 网络层故障 (fetch reject)
 * - 2xx 但 body 解析失败
 * - 部分 ErrorResponse (只有 message 字段)
 * - baseUrl 拼接
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiClient, ApiError } from '../api'
import {
  errorResponse,
  htmlErrorResponse,
  okResponse,
} from './_apiTestHelpers'

let client: ApiClient
let fetchMock: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  client = new ApiClient('')
  fetchMock = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ApiClient — 后端 ErrorResponse', () => {
  it('400 + ErrorResponse → ApiError 含 errorClass + userMessage', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(400, 'ModelNotLoadedError', '请先加载模型')
    )
    try {
      await client.predictDepth(new Blob([new Uint8Array(8)]))
      throw new Error('应当抛 ApiError')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const e = err as ApiError
      expect(e.statusCode).toBe(400)
      expect(e.errorClass).toBe('ModelNotLoadedError')
      expect(e.userMessage).toBe('请先加载模型')
    }
  })

  it('507 OOM → 透传 message', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(507, 'ModelOOMError', '显存不足,模型已释放')
    )
    await expect(
      client.loadModel('depth-anything-v2-large')
    ).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 507,
      errorClass: 'ModelOOMError',
      userMessage: '显存不足,模型已释放',
    })
  })

  it('413 ImageTooLarge → 透传', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(413, 'ImageTooLargeError', '图像过大')
    )
    await expect(
      client.predictDepth(new Blob([new Uint8Array(8)]))
    ).rejects.toMatchObject({
      statusCode: 413,
      errorClass: 'ImageTooLargeError',
    })
  })

  it('415 UnsupportedFormat → 透传', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(415, 'UnsupportedFormatError', '不支持的文件格式')
    )
    await expect(
      client.predictDepth(new Blob([new Uint8Array(8)]))
    ).rejects.toMatchObject({
      statusCode: 415,
      errorClass: 'UnsupportedFormatError',
    })
  })
})

describe('ApiClient — 非标准错误响应', () => {
  it('500 + 非 JSON body (HTML 错误页) → 兜底 ApiError', async () => {
    fetchMock.mockResolvedValueOnce(htmlErrorResponse(500))
    await expect(client.getHealth()).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 500,
      errorClass: 'UnknownError',
      userMessage: '请求失败 (HTTP 500)',
    })
  })

  it('部分 ErrorResponse (只有 message, 没有 error)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: '只有消息' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const err = await client.getHealth().catch((e) => e as ApiError)
    expect(err.userMessage).toBe('只有消息')
    expect(err.errorClass).toBe('UnknownError') // 默认值
  })

  it('部分 ErrorResponse (只有 error, 没有 message)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'SomeError' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const err = await client.getHealth().catch((e) => e as ApiError)
    expect(err.errorClass).toBe('SomeError')
    expect(err.userMessage).toBe('请求失败 (HTTP 400)') // 默认值
  })
})

describe('ApiClient — 网络层与解析', () => {
  it('网络层故障 (fetch reject) → ApiError statusCode=0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(client.getHealth()).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 0,
      errorClass: 'NetworkError',
    })
  })

  it('网络故障消息含原始 detail', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('CORS preflight failed'))
    const err = await client.getHealth().catch((e) => e as ApiError)
    expect(err.userMessage).toContain('CORS preflight failed')
  })

  it('2xx 但 body 不是 JSON → ParseError', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not json at all', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    await expect(client.getHealth()).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 200,
      errorClass: 'ParseError',
    })
  })

  it('422 RequestValidationError → 透传 errorClass', async () => {
    // 后端 main.py 的 RequestValidationError handler 会返回这个形态:
    // { "error": "RequestValidationError", "message": "<loc>: <msg>" }
    fetchMock.mockResolvedValueOnce(
      errorResponse(
        422,
        'RequestValidationError',
        'body.model_id: field required'
      )
    )
    await expect(client.loadModel('')).rejects.toMatchObject({
      statusCode: 422,
      errorClass: 'RequestValidationError',
      userMessage: 'body.model_id: field required',
    })
  })
})

describe('ApiClient — AbortSignal 取消支持', () => {
  it('AbortError 抛 ApiError(0, AbortError)', async () => {
    // 模拟 fetch 在 abort 时抛 DOMException name='AbortError'
    fetchMock.mockRejectedValueOnce(
      new DOMException('aborted', 'AbortError')
    )
    await expect(client.getHealth()).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 0,
      errorClass: 'AbortError',
      userMessage: '请求已取消',
    })
  })

  it('signal 透传到 fetch (getHealth)', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: 'ok', device: 'cpu', models_loaded: [] })
    )
    const controller = new AbortController()
    await client.getHealth({ signal: controller.signal })
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.signal).toBe(controller.signal)
  })

  it('signal 透传到 fetch (predictDepth)', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        depth_b64: '',
        width: 1,
        height: 1,
        inference_ms: 1,
        stats: { min: 0, max: 1, mean: 0.5, median: 0.5 },
        model_id: 'x',
        device: 'cpu',
      })
    )
    const controller = new AbortController()
    await client.predictDepth(new Blob([new Uint8Array(8)]), {
      signal: controller.signal,
    })
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.signal).toBe(controller.signal)
  })

  it('signal 透传到 fetch (loadModel)', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        status: 'ready',
        model_id: 'x',
        device: 'cpu',
        load_time_ms: 1,
        vram_used_mb: null,
      })
    )
    const controller = new AbortController()
    await client.loadModel('x', { signal: controller.signal })
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.signal).toBe(controller.signal)
  })

  it('AbortError 与 NetworkError 用 errorClass 区分 (主动取消 vs 网络故障)', async () => {
    // AbortError
    fetchMock.mockRejectedValueOnce(
      new DOMException('user cancelled', 'AbortError')
    )
    const aborted = await client.getHealth().catch((e) => e as ApiError)
    expect(aborted.errorClass).toBe('AbortError')

    // NetworkError (TypeError, 不是 DOMException)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const network = await client.getHealth().catch((e) => e as ApiError)
    expect(network.errorClass).toBe('NetworkError')
  })
})

describe('ApiClient — baseUrl', () => {
  it('non-empty baseUrl 拼到所有 URL 前面', async () => {
    const remote = new ApiClient('http://api.example.com')
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: 'ok', device: 'cpu', models_loaded: [] })
    )
    await remote.getHealth()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example.com/api/health',
      undefined
    )
  })

  it('空字符串 baseUrl (默认) 走相对路径', async () => {
    const local = new ApiClient('')
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: 'ok', device: 'cpu', models_loaded: [] })
    )
    await local.getHealth()
    expect(fetchMock).toHaveBeenCalledWith('/api/health', undefined)
  })
})
