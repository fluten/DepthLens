/**
 * lib/validators.ts — 输入校验纯函数
 *
 * 设计:
 * - 纯函数, 无副作用, 无 toast / DOM 调用
 * - 返回 discriminated union 而非抛异常, 便于 hook 层用 if/else 直接驱动 UI
 * - 用户消息一律中文 (面向 toast 显示), 错误码英文 (用于日志/埋点)
 *
 * 校验顺序: file.size → MIME → 扩展名兜底
 * 这个顺序保证最便宜的检查最先执行 (size 是 file 自带属性, MIME 也是, 扩展名要 split).
 */

import {
  MAX_IMAGE_BYTES,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_IMAGE_MIME_TYPES,
} from './constants'

// ── 公共类型 ────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ValidationErrorCode; message: string }

export type ValidationErrorCode =
  /** 文件 size 为 0 或负数 (理论上不会发生, 防御性) */
  | 'EMPTY_FILE'
  /** 文件超过硬上限 */
  | 'TOO_LARGE'
  /** MIME type 不在白名单 (优先判据) */
  | 'UNSUPPORTED_MIME'
  /** MIME 为空时, 扩展名也不在白名单 */
  | 'UNSUPPORTED_EXTENSION'

// ── 工具 ────────────────────────────────────────────────────────────────────

/**
 * 提取小写扩展名, 包含点号. 例如 "photo.JPG" → ".jpg".
 *
 * 边界:
 * - 没有 "." → 返回空串
 * - 多个 "." (例如 "archive.tar.gz") → 取最后一段
 * - 隐藏文件 ".bashrc" → 返回 "" (没有真正的扩展名)
 */
export function extractExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0 || dot === filename.length - 1) return ''
  return filename.slice(dot).toLowerCase()
}

/** 把字节数格式化为可读形式 (1.5 MB / 12.3 KB), 用于错误消息 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ── 图片校验 ────────────────────────────────────────────────────────────────

/**
 * 校验上传的图片文件是否符合 DepthLens 的格式 + 大小约束.
 *
 * **不读取**文件内容, 也不验证图像可解码性 — 那是 lib/image.ts 的职责.
 * 本函数只做"零成本"的元数据检查.
 *
 * 与 SPEC §13.4 一一对齐:
 * - jpg/jpeg/png/webp/bmp/tiff 白名单
 * - 50 MB 文件硬上限
 *
 * @example
 * const result = validateImageFile(file)
 * if (!result.ok) toast.error(result.message)
 */
export function validateImageFile(file: File): ValidationResult {
  if (file.size <= 0) {
    return {
      ok: false,
      code: 'EMPTY_FILE',
      message: '文件为空, 无法处理',
    }
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `图片过大 (${formatBytes(file.size)}) · 最大支持 ${formatBytes(MAX_IMAGE_BYTES)}`,
    }
  }

  // file.type 优先 (浏览器从文件头嗅探的 MIME, 比扩展名更可靠)
  if (file.type) {
    if (SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
      return { ok: true }
    }
    return {
      ok: false,
      code: 'UNSUPPORTED_MIME',
      message: `不支持的图片格式 (${file.type}) · 请使用 JPG / PNG / WEBP / BMP / TIFF`,
    }
  }

  // 扩展名兜底
  const ext = extractExtension(file.name)
  if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
    return { ok: true }
  }
  return {
    ok: false,
    code: 'UNSUPPORTED_EXTENSION',
    message: `不支持的图片格式 (${ext || '未知'}) · 请使用 JPG / PNG / WEBP / BMP / TIFF`,
  }
}

// 注: validateVideoFile 是 Phase 3 视频任务的范围, 本文件 (Phase 1) 只实现
// 图片校验. 视频常量保留在 constants.ts 中作为单一真相源, 但校验函数等到
// Phase 3 真正用到时再加.
