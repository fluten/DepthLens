/**
 * lib/constants.ts — DepthLens 前端魔法数字单一真相源
 *
 * 所有数值集中在此, 业务代码 import 而非内联. 与 backend/app/config.py
 * 保持一致, 任何修改必须前后端同步.
 *
 * 分组:
 *   1. API endpoint
 *   2. 图片输入约束 (SPEC §13.4)
 *   3. 视频输入约束 (SPEC §13.5)
 *   4. Colormap 注册表
 *   5. 深度数据约束
 *   6. 连接 / 心跳
 */

// ── 1. API ─────────────────────────────────────────────────────────────────

/** 所有 REST 调用的前缀, 通过 Vite proxy 转发到 backend (127.0.0.1:8000) */
export const API_BASE = '/api' as const

export const API_PATHS = {
  health: '/api/health',
  systemInfo: '/api/system/info',
  modelsList: '/api/models',
  modelLoad: '/api/models/load',
  modelUnload: '/api/models/unload',
  depthImage: '/api/depth/image',
  depthStream: '/api/depth/stream', // WebSocket
} as const

// ── 2. 图片输入约束 (SPEC §13.4 + backend config.MAX_IMAGE_*) ──────────────

/** 长边像素上限. 超出后前端等比缩放后再上传 (与 backend MAX_IMAGE_DIM 同值) */
export const MAX_IMAGE_DIM = 4096

/**
 * 文件大小硬上限 (50 MB). 与 backend MAX_IMAGE_BYTES 一致.
 * 超出 → validateImageFile 直接拒绝并 toast.
 */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024

/**
 * 触发"前端压缩后再发送"的阈值 (20 MB). SPEC §13.4 规定:
 * 文件 > 20 MB 前端压缩后发送, 文件 ≤ 20 MB 直传.
 */
export const COMPRESS_IMAGE_BYTES = 20 * 1024 * 1024

/** 长边低于此值会出 toast 警告 "图片过小, 效果可能不佳", 但不阻断 (SPEC §13.4) */
export const MIN_IMAGE_DIM_WARN = 64

/**
 * 图片格式白名单 — MIME type. 与后端 image_utils.SUPPORTED_FORMATS 对齐.
 *
 * 注: 后端 frozenset 名称是 "JPEG/PNG/WEBP/BMP/TIFF/MPO" (Pillow 内部命名),
 * 前端用浏览器 File.type 形式 (RFC 6838 MIME).
 */
export const SUPPORTED_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/x-tiff', // 部分浏览器/系统使用
] as const

/**
 * 扩展名兜底 — 当 file.type 为空 (例如某些拖入场景或剪贴板 paste) 时,
 * 用扩展名做二次校验.
 */
export const SUPPORTED_IMAGE_EXTENSIONS: readonly string[] = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
] as const

// ── 3. 视频输入约束 (SPEC §13.5) ────────────────────────────────────────────

/** 视频文件硬上限 500 MB, 与 backend MAX_VIDEO_BYTES 一致 */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024

/** 视频时长上限 5 分钟, 与 backend MAX_VIDEO_SECONDS 一致 */
export const MAX_VIDEO_SECONDS = 5 * 60

/** 视频长边自动缩放阈值 (1280px), SPEC §13.5 */
export const MAX_VIDEO_DIM = 1280

export const SUPPORTED_VIDEO_MIME_TYPES: readonly string[] = [
  'video/mp4',
  'video/avi',
  'video/x-msvideo',
  'video/quicktime', // .mov
  'video/webm',
] as const

export const SUPPORTED_VIDEO_EXTENSIONS: readonly string[] = [
  '.mp4',
  '.avi',
  '.mov',
  '.webm',
] as const

// ── 4. Colormap 注册表 ─────────────────────────────────────────────────────

/**
 * 7 个 colormap ID. 与 lib/colormaps.ts 中的 COLORMAP_STOPS key 一一对应.
 *
 * 顺序很重要: UI 上的 ColormapPicker 列表会按这个顺序渲染.
 */
export const COLORMAP_IDS = [
  'inferno',
  'plasma',
  'magma',
  'turbo',
  'viridis',
  'bone',
  'cividis',
] as const

/** Colormap ID 字面量类型, 用于 store / props 类型约束 */
export type ColormapId = (typeof COLORMAP_IDS)[number]

/** 默认 colormap. inferno 在深色背景下对比度最强, 适合暗色 UI */
export const DEFAULT_COLORMAP_ID: ColormapId = 'inferno'

// ── 5. 深度数据约束 ────────────────────────────────────────────────────────

/**
 * 后端返回的深度数据值域固定为 [0, 1] (已归一化, 见 backend depth_utils.normalize).
 * 前端用这两个常量做边界裁剪与初始化.
 */
export const DEPTH_VALUE_MIN = 0.0
export const DEPTH_VALUE_MAX = 1.0

// ── 6. 连接 / 心跳 ─────────────────────────────────────────────────────────

/** /api/health 轮询间隔 (ms), 用于 useConnection hook 检测后端在线状态 */
export const HEALTH_POLL_INTERVAL_MS = 5_000

/** WebSocket 重连指数退避序列 (ms) — 与 SPEC §13.6 / §13.7 一致 */
export const WS_RECONNECT_BACKOFF_MS: readonly number[] = [
  1_000, 2_000, 4_000, 8_000, 16_000,
] as const

/** WebSocket 心跳间隔 (ms) */
export const WS_HEARTBEAT_INTERVAL_MS = 15_000
