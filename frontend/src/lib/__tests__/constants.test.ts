/**
 * constants.ts 单元测试
 *
 * 主要保证: 与 backend/app/config.py 的关键数值对齐, 防止有人改了一边忘了
 * 改另一边 (静默 bug, 表现为前端拒了某个文件, 后端却接受).
 */
import { describe, it, expect } from 'vitest'
import {
  API_BASE,
  API_PATHS,
  COLORMAP_IDS,
  DEFAULT_COLORMAP_ID,
  DEPTH_VALUE_MAX,
  DEPTH_VALUE_MIN,
  HEALTH_POLL_INTERVAL_MS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIM,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DIM,
  MAX_VIDEO_SECONDS,
  COMPRESS_IMAGE_BYTES,
  MIN_IMAGE_DIM_WARN,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_VIDEO_MIME_TYPES,
  WS_HEARTBEAT_INTERVAL_MS,
  WS_RECONNECT_BACKOFF_MS,
} from '../constants'

describe('constants — backend 对齐', () => {
  it('MAX_IMAGE_DIM 与 backend config 一致', () => {
    expect(MAX_IMAGE_DIM).toBe(4096)
  })

  it('MAX_IMAGE_BYTES 与 backend config 一致 (50MB)', () => {
    expect(MAX_IMAGE_BYTES).toBe(50 * 1024 * 1024)
  })

  it('MAX_VIDEO_BYTES 与 backend config 一致 (500MB)', () => {
    expect(MAX_VIDEO_BYTES).toBe(500 * 1024 * 1024)
  })

  it('MAX_VIDEO_SECONDS 与 backend config 一致 (5min)', () => {
    expect(MAX_VIDEO_SECONDS).toBe(5 * 60)
  })

  it('MAX_VIDEO_DIM 与 SPEC §13.5 一致 (1280)', () => {
    expect(MAX_VIDEO_DIM).toBe(1280)
  })

  it('压缩阈值 < 硬上限', () => {
    expect(COMPRESS_IMAGE_BYTES).toBeLessThan(MAX_IMAGE_BYTES)
  })

  it('MIN_IMAGE_DIM_WARN < MAX_IMAGE_DIM', () => {
    expect(MIN_IMAGE_DIM_WARN).toBeLessThan(MAX_IMAGE_DIM)
  })
})

describe('constants — API endpoint', () => {
  it('API_BASE 是 /api', () => {
    expect(API_BASE).toBe('/api')
  })

  it('所有 API_PATHS 都以 /api 开头', () => {
    for (const [name, path] of Object.entries(API_PATHS)) {
      expect(path, `${name} 应该以 /api 开头`).toMatch(/^\/api/)
    }
  })

  it('包含全部 SPEC §6.1 必需端点', () => {
    expect(API_PATHS).toMatchObject({
      health: '/api/health',
      systemInfo: '/api/system/info',
      modelsList: '/api/models',
      modelLoad: '/api/models/load',
      modelUnload: '/api/models/unload',
      depthImage: '/api/depth/image',
      depthStream: '/api/depth/stream',
    })
  })
})

describe('constants — 格式白名单', () => {
  it('图片 MIME 至少包含主流格式', () => {
    expect(SUPPORTED_IMAGE_MIME_TYPES).toContain('image/jpeg')
    expect(SUPPORTED_IMAGE_MIME_TYPES).toContain('image/png')
    expect(SUPPORTED_IMAGE_MIME_TYPES).toContain('image/webp')
  })

  it('图片扩展名带点号且小写', () => {
    for (const ext of SUPPORTED_IMAGE_EXTENSIONS) {
      expect(ext).toMatch(/^\.[a-z]+$/)
    }
  })

  it('视频 MIME 至少包含主流格式', () => {
    expect(SUPPORTED_VIDEO_MIME_TYPES).toContain('video/mp4')
    expect(SUPPORTED_VIDEO_MIME_TYPES).toContain('video/webm')
  })

  it('视频扩展名带点号且小写', () => {
    for (const ext of SUPPORTED_VIDEO_EXTENSIONS) {
      expect(ext).toMatch(/^\.[a-z0-9]+$/)
    }
  })
})

describe('constants — Colormap', () => {
  it('恰好 7 个 colormap', () => {
    expect(COLORMAP_IDS).toHaveLength(7)
  })

  it('包含 SPEC 列出的 7 个 ID', () => {
    expect([...COLORMAP_IDS].sort()).toEqual(
      ['bone', 'cividis', 'inferno', 'magma', 'plasma', 'turbo', 'viridis'].sort()
    )
  })

  it('DEFAULT_COLORMAP_ID 在白名单内', () => {
    expect(COLORMAP_IDS).toContain(DEFAULT_COLORMAP_ID)
  })
})

describe('constants — 深度值域', () => {
  it('DEPTH_VALUE_MIN === 0', () => {
    expect(DEPTH_VALUE_MIN).toBe(0)
  })

  it('DEPTH_VALUE_MAX === 1', () => {
    expect(DEPTH_VALUE_MAX).toBe(1)
  })
})

describe('constants — 连接参数', () => {
  it('心跳轮询都是正数', () => {
    expect(HEALTH_POLL_INTERVAL_MS).toBeGreaterThan(0)
    expect(WS_HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0)
  })

  it('WS 重连退避序列严格递增', () => {
    for (let i = 1; i < WS_RECONNECT_BACKOFF_MS.length; i++) {
      expect(WS_RECONNECT_BACKOFF_MS[i]).toBeGreaterThan(
        WS_RECONNECT_BACKOFF_MS[i - 1]!
      )
    }
  })

  it('WS 重连退避符合 SPEC §13.6 (1/2/4/8/16 秒)', () => {
    expect(WS_RECONNECT_BACKOFF_MS).toEqual([1000, 2000, 4000, 8000, 16000])
  })
})
