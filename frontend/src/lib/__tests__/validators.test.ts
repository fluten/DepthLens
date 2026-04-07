/**
 * validators.ts 单元测试
 *
 * 用 happy-dom 提供的 File 构造器模拟上传场景.
 */
import { describe, it, expect } from 'vitest'
import {
  extractExtension,
  formatBytes,
  validateImageFile,
} from '../validators'
import { MAX_IMAGE_BYTES } from '../constants'

// ── 工具 ────────────────────────────────────────────────────────────────────

/**
 * 构造一个指定大小的虚拟 File. happy-dom 的 File 构造器要求一个 BlobPart[],
 * 我们传一个 ArrayBuffer 占位即可 — validateXxx 不读内容.
 */
function fakeFile(name: string, type: string, size: number): File {
  // happy-dom 不会真的为 ArrayBuffer 分配内存到 file.size, 它把 size 设为参数长度
  const buf = new Uint8Array(size)
  return new File([buf], name, { type })
}

// ── extractExtension ───────────────────────────────────────────────────────

describe('extractExtension', () => {
  it('正常扩展名', () => {
    expect(extractExtension('photo.jpg')).toBe('.jpg')
    expect(extractExtension('image.PNG')).toBe('.png') // 小写化
    expect(extractExtension('video.WebM')).toBe('.webm')
  })

  it('多段名取最后一段', () => {
    expect(extractExtension('archive.tar.gz')).toBe('.gz')
  })

  it('无扩展名', () => {
    expect(extractExtension('README')).toBe('')
  })

  it('隐藏文件 (无真实扩展名)', () => {
    expect(extractExtension('.bashrc')).toBe('')
  })

  it('点号在末尾 (空扩展名)', () => {
    expect(extractExtension('weird.')).toBe('')
  })
})

// ── formatBytes ─────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('< 1KB 用 B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('< 1MB 用 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('< 1GB 用 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(50 * 1024 * 1024)).toBe('50.0 MB')
  })

  it('>= 1GB 用 GB', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB')
  })
})

// ── validateImageFile ──────────────────────────────────────────────────────

describe('validateImageFile', () => {
  it('合法 jpg 通过', () => {
    const f = fakeFile('photo.jpg', 'image/jpeg', 1024)
    const r = validateImageFile(f)
    expect(r.ok).toBe(true)
  })

  it('合法 png 通过', () => {
    const f = fakeFile('photo.png', 'image/png', 1024)
    expect(validateImageFile(f).ok).toBe(true)
  })

  it('合法 webp 通过', () => {
    const f = fakeFile('photo.webp', 'image/webp', 1024)
    expect(validateImageFile(f).ok).toBe(true)
  })

  it('空文件被拒 EMPTY_FILE', () => {
    const f = fakeFile('photo.jpg', 'image/jpeg', 0)
    const r = validateImageFile(f)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('EMPTY_FILE')
  })

  it('过大文件被拒 TOO_LARGE', () => {
    const f = fakeFile('big.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1)
    const r = validateImageFile(f)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('TOO_LARGE')
      expect(r.message).toContain('图片过大')
    }
  })

  it('正好等于上限的文件通过', () => {
    const f = fakeFile('edge.jpg', 'image/jpeg', MAX_IMAGE_BYTES)
    expect(validateImageFile(f).ok).toBe(true)
  })

  it('GIF 被拒 UNSUPPORTED_MIME', () => {
    const f = fakeFile('anim.gif', 'image/gif', 1024)
    const r = validateImageFile(f)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('UNSUPPORTED_MIME')
  })

  it('SVG 被拒 UNSUPPORTED_MIME', () => {
    const f = fakeFile('icon.svg', 'image/svg+xml', 1024)
    const r = validateImageFile(f)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('UNSUPPORTED_MIME')
  })

  it('PDF 被拒 UNSUPPORTED_MIME', () => {
    const f = fakeFile('doc.pdf', 'application/pdf', 1024)
    const r = validateImageFile(f)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('UNSUPPORTED_MIME')
  })

  it('MIME 为空时用扩展名兜底 — 合法', () => {
    const f = fakeFile('photo.jpg', '', 1024)
    expect(validateImageFile(f).ok).toBe(true)
  })

  it('MIME 为空且扩展名也不在白名单 — 拒', () => {
    const f = fakeFile('weird.xyz', '', 1024)
    const r = validateImageFile(f)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('UNSUPPORTED_EXTENSION')
  })

  it('MIME 为空且无扩展名 — 拒 (extension 为空串, 不在白名单)', () => {
    const f = fakeFile('NOEXT', '', 1024)
    const r = validateImageFile(f)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('UNSUPPORTED_EXTENSION')
  })

  it('SPEC §13.4 全部 6 种支持格式', () => {
    const cases: Array<[string, string]> = [
      ['a.jpg', 'image/jpeg'],
      ['a.jpeg', 'image/jpeg'],
      ['a.png', 'image/png'],
      ['a.webp', 'image/webp'],
      ['a.bmp', 'image/bmp'],
      ['a.tiff', 'image/tiff'],
    ]
    for (const [name, type] of cases) {
      const f = fakeFile(name, type, 100)
      expect(validateImageFile(f).ok, `${name} 应通过`).toBe(true)
    }
  })
})

// 注: validateVideoFile 测试随着函数本体一并延后到 Phase 3
