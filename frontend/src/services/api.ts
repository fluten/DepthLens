/**
 * services/api.ts — DepthLens REST API 客户端
 *
 * **职责** (services 层):
 * - 副作用 (HTTP 调用)
 * - 无状态, 可 mock
 * - 统一错误拦截 → ApiError, 由调用方 (hook) 决定如何展示 (toast)
 *
 * **不做**:
 * - 不读 / 写 store
 * - 不调 toast (那是 hook 的责任)
 * - 不做业务编排 (那是 hook 的责任)
 *
 * **类型**:
 * - 字段名一律 snake_case, 与 backend/app/core/schemas.py 字面对齐
 * - 这样后端 JSON 直接 `as` 类型断言, 不需要任何转换层
 */

import { API_PATHS } from '../lib/constants'

// ── Backend schema 镜像 (与 backend/app/core/schemas.py 一一对应) ──────────

export type DeviceLiteral = 'cpu' | 'cuda'
export type ModelStatusLiteral = 'idle' | 'loading' | 'ready' | 'error'
export type ModelSize = 'small' | 'base' | 'large'

/** GET /api/health 响应 */
export interface HealthResponse {
  status: 'ok'
  device: DeviceLiteral
  models_loaded: string[]
}

/** GET /api/system/info 响应 */
export interface SystemInfo {
  gpu_name: string | null
  gpu_vram_mb: number | null
  gpu_vram_used_mb: number | null
  cpu: string
  ram_mb: number
  cuda_available: boolean
  torch_version: string
}

/** GET /api/models 数组的元素 */
export interface ModelInfo {
  id: string
  name: string
  size: ModelSize
  estimated_vram_mb: number
  loaded: boolean
}

/** POST /api/models/load 请求 body */
export interface ModelLoadRequest {
  model_id: string
}

/** POST /api/models/load 响应 */
export interface ModelLoadResponse {
  status: ModelStatusLiteral
  model_id: string
  device: DeviceLiteral
  load_time_ms: number
  vram_used_mb: number | null
}

/** POST /api/models/unload 响应 */
export interface ModelUnloadResponse {
  status: 'ok'
}

/** 深度图统计, 与 backend DepthStats 对齐 */
export interface DepthStatsResponse {
  min: number
  max: number
  mean: number
  median: number
}

/** POST /api/depth/image 响应 */
export interface DepthResult {
  depth_b64: string
  width: number
  height: number
  inference_ms: number
  stats: DepthStatsResponse
  model_id: string
  device: DeviceLiteral
}

/** 后端 ErrorResponse 形态 — 所有非 2xx 都遵循这个 */
export interface ErrorResponseBody {
  error: string
  message: string
}

/**
 * 公共方法都接受的可选请求参数. 目前只有 signal, 未来可扩展 (timeout, retry 等).
 */
export interface RequestOpts {
  /**
   * 取消信号. 传入后, 调用方可以通过 controller.abort() 中断网络层 fetch.
   * 被取消的请求会抛 ApiError(statusCode=0, errorClass='AbortError').
   */
  signal?: AbortSignal
}

// ── ApiError ────────────────────────────────────────────────────────────────

/**
 * 统一前端 API 错误类型. 包装一切非 2xx / 网络故障 / parse 失败.
 *
 * - `userMessage` 是面向用户的中文文案 (已由后端写好), 可直接 toast.error()
 * - `errorClass` 是后端 ErrorResponse.error (例如 "ModelOOMError"), 用于
 *   日志与埋点; 也可以让 hook 根据类名做更细的 UI 反应
 * - `statusCode` 是 HTTP 状态码; 0 = 网络层故障 (fetch 抛错前没拿到响应)
 */
export class ApiError extends Error {
  readonly statusCode: number
  readonly errorClass: string
  readonly userMessage: string

  constructor(statusCode: number, errorClass: string, userMessage: string) {
    super(userMessage)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.errorClass = errorClass
    this.userMessage = userMessage
  }
}

// ── 内部助手 ────────────────────────────────────────────────────────────────

/**
 * 把 RequestOpts 转换为可选的 RequestInit. 没有 signal 时返回 undefined,
 * 这样 GET 端点的 fetch 调用不会被无意义的 `{ signal: undefined }` 包装,
 * 也让测试可以用 `toHaveBeenCalledWith(url, undefined)` 锁定"零额外配置"形态.
 */
function withSignal(opts: RequestOpts): RequestInit | undefined {
  return opts.signal ? { signal: opts.signal } : undefined
}

// ── ApiClient ──────────────────────────────────────────────────────────────

/**
 * REST 客户端. 通常通过单例 ``apiClient`` 使用; 测试时可以 ``new ApiClient(mockBaseUrl)``.
 *
 * 所有方法的错误路径都抛 ApiError, 不返回 union 类型 — 这样调用方可以用
 * try/catch 一次拦截所有失败.
 */
export class ApiClient {
  // 注意: 这里不用 TS 的 "构造器参数属性" 语法 (`private readonly baseUrl`),
  // 因为 tsconfig.app.json 启用了 erasableSyntaxOnly, 它禁止任何不能被
  // 简单 erase 到纯 JS 的 TS-only 语法.
  private readonly baseUrl: string

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  // ── 系统 ────────────────────────────────────────────
  async getHealth(opts: RequestOpts = {}): Promise<HealthResponse> {
    return this.request<HealthResponse>(API_PATHS.health, withSignal(opts))
  }

  async getSystemInfo(opts: RequestOpts = {}): Promise<SystemInfo> {
    return this.request<SystemInfo>(API_PATHS.systemInfo, withSignal(opts))
  }

  // ── 模型 ────────────────────────────────────────────
  async listModels(opts: RequestOpts = {}): Promise<ModelInfo[]> {
    return this.request<ModelInfo[]>(API_PATHS.modelsList, withSignal(opts))
  }

  async loadModel(
    modelId: string,
    opts: RequestOpts = {}
  ): Promise<ModelLoadResponse> {
    const body: ModelLoadRequest = { model_id: modelId }
    return this.request<ModelLoadResponse>(API_PATHS.modelLoad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  }

  async unloadModel(opts: RequestOpts = {}): Promise<ModelUnloadResponse> {
    return this.request<ModelUnloadResponse>(API_PATHS.modelUnload, {
      method: 'POST',
      signal: opts.signal,
    })
  }

  // ── 推理 ────────────────────────────────────────────
  /**
   * 上传图片做深度推理.
   *
   * - `image`: File 或 Blob (preprocessImage 的输出, 通常是 jpeg)
   * - `options.invertDepth`: 是否反转深度方向, 默认 false
   * - `options.signal`: AbortSignal, 用于取消进行中的请求
   *
   * **不要** 手动设置 multipart Content-Type — 必须让浏览器自己加 boundary.
   *
   * **取消支持**: 传入 signal 后, 调用方可以 abort 中断网络层 fetch.
   * 这对应 SPEC §13.3 "并发推理 (未完成又拖入新图)" 场景 — hook 层可以
   * 用同一个 AbortController 在新请求开始时 abort 旧请求.
   */
  async predictDepth(
    image: Blob,
    options: { invertDepth?: boolean; signal?: AbortSignal } = {}
  ): Promise<DepthResult> {
    const form = new FormData()
    // 后端 multipart 字段名 'image' 与 routers/depth.py 对齐.
    //
    // 把输入归一化为 File 而不是依赖 FormData.append 的第三参数 filename —
    // 后者在不同 FormData 实现 (真实浏览器 / happy-dom / undici) 行为不一致.
    // 强制 wrap 为 File 后, 文件名通过 File.name 字段带过去, 行为确定.
    const fileToUpload =
      image instanceof File
        ? image
        : new File([image], 'image.jpg', { type: image.type || 'image/jpeg' })
    form.append('image', fileToUpload)

    const url = options.invertDepth
      ? `${API_PATHS.depthImage}?invert_depth=true`
      : API_PATHS.depthImage

    return this.request<DepthResult>(url, {
      method: 'POST',
      body: form,
      signal: options.signal,
      // 故意不设 Content-Type, 浏览器会自动加 boundary
    })
  }

  // ── 内部: 统一 fetch 包装 ───────────────────────────

  /**
   * 所有 HTTP 调用的唯一入口. 四类错误统一抛 ApiError:
   *   1. 取消 (AbortError) → statusCode=0, errorClass='AbortError'
   *      调用方可以用 err.errorClass === 'AbortError' 区分主动取消与网络故障
   *   2. 网络层故障 (DNS / 拒接 / CORS preflight 失败) → statusCode=0
   *   3. 非 2xx 响应 → 解析后端 ErrorResponse 抛
   *   4. 2xx 但 body 不是合法 JSON → statusCode=响应码, errorClass='ParseError'
   */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`

    let response: Response
    try {
      response = await fetch(url, init)
    } catch (err) {
      // AbortError: 调用方主动取消. 区别于网络故障, 给独立 errorClass.
      // DOMException name === 'AbortError' 是 fetch 标准行为
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError(0, 'AbortError', '请求已取消')
      }
      // 网络故障. err 通常是 TypeError("Failed to fetch")
      const detail = err instanceof Error ? err.message : String(err)
      throw new ApiError(0, 'NetworkError', `网络连接失败: ${detail}`)
    }

    if (!response.ok) {
      // 试图按 ErrorResponse 形态解析 body, 失败时退回到 HTTP 状态码作为消息
      let errorClass = 'UnknownError'
      let userMessage = `请求失败 (HTTP ${response.status})`
      try {
        const body = (await response.json()) as Partial<ErrorResponseBody>
        if (typeof body.error === 'string') errorClass = body.error
        if (typeof body.message === 'string') userMessage = body.message
      } catch {
        // body 不是 JSON, 用默认值
      }
      throw new ApiError(response.status, errorClass, userMessage)
    }

    // 2xx — 解析 JSON
    try {
      return (await response.json()) as T
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new ApiError(
        response.status,
        'ParseError',
        `响应解析失败: ${detail}`
      )
    }
  }
}

// ── 单例 ────────────────────────────────────────────────────────────────────

/**
 * 默认 API 客户端. baseUrl 为空字符串 = 走 Vite proxy (/api → 127.0.0.1:8000).
 * 测试或非浏览器场景应当 new ApiClient('http://...') 自己实例化.
 */
export const apiClient = new ApiClient()
