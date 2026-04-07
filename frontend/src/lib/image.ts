/**
 * lib/image.ts — 浏览器端图片预处理
 *
 * 职责 (与 SPEC §13.4 对齐):
 * 1. EXIF orientation 修正 — 手机拍摄的 jpg 不修正会让深度图显示错位
 * 2. 长边超过 4096 px 等比缩放
 * 3. 文件超过 20 MB 触发 canvas 重编码压缩
 *
 * 实现策略:
 * - 用 ``createImageBitmap(file, { imageOrientation: 'from-image' })`` 一步搞定
 *   解码 + EXIF 旋转. 比手动解析 EXIF 字节流简单 100 倍, 现代浏览器
 *   (Chrome 81+ / Firefox 77+ / Safari 13.1+) 全部支持.
 * - 缩放走 OffscreenCanvas, 失败回退到普通 canvas (例如老 Safari).
 * - **快路径**: 当原文件已经满足全部约束时直接返回原 Blob, 避免无谓重编码.
 *
 * 函数划分:
 * - ``computeResizeDimensions``: 纯函数, 可单测
 * - ``preprocessImage``:         有 DOM 副作用, 通过浏览器 / happy-dom 测试
 */

import { COMPRESS_IMAGE_BYTES, MAX_IMAGE_DIM } from './constants'

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface PreprocessedImage {
  /** 处理后的二进制 (可能就是原 file 本身, 也可能是新编码的 jpeg blob) */
  blob: Blob
  /** 处理后的像素宽 (经过 EXIF 修正 + 可能的缩放) */
  width: number
  /** 处理后的像素高 */
  height: number
  /** 是否做了重编码 (true = 走了 canvas, false = 直接透传原 blob) */
  reencoded: boolean
  /** 是否触发了缩放 */
  resized: boolean
}

// ── 1. 纯函数: 缩放尺寸计算 ─────────────────────────────────────────────────

/**
 * 计算等比缩放后的目标尺寸. 如果长边 ≤ maxDim 直接返回原值.
 *
 * @example
 * computeResizeDimensions(8000, 6000, 4096) → { width: 4096, height: 3072, resized: true }
 * computeResizeDimensions(1920, 1080, 4096) → { width: 1920, height: 1080, resized: false }
 *
 * 边界:
 * - width 或 height ≤ 0 → 抛 RangeError (无效图像)
 * - maxDim ≤ 0 → 抛 RangeError
 */
export function computeResizeDimensions(
  width: number,
  height: number,
  maxDim: number
): { width: number; height: number; resized: boolean } {
  if (width <= 0 || height <= 0) {
    throw new RangeError(
      `computeResizeDimensions: 无效尺寸 width=${width} height=${height}`
    )
  }
  if (maxDim <= 0) {
    throw new RangeError(`computeResizeDimensions: maxDim 必须 > 0, 收到 ${maxDim}`)
  }

  const longSide = Math.max(width, height)
  if (longSide <= maxDim) {
    return { width, height, resized: false }
  }

  const scale = maxDim / longSide
  // 用 round 保证至少 1 像素 (1 像素图缩 0.5x 不会变成 0)
  const newWidth = Math.max(1, Math.round(width * scale))
  const newHeight = Math.max(1, Math.round(height * scale))
  return { width: newWidth, height: newHeight, resized: true }
}

// ── 2. 纯函数: 是否需要重编码 ────────────────────────────────────────────────

/**
 * 决定是否要走 canvas 重编码. 满足任一条件就需要:
 *  a) 长边超过 maxDim (要缩放)
 *  b) 原文件大小超过 sizeThreshold (要压缩)
 *  c) 强制重编码 (例如 EXIF 修正后想要持久化朝向)
 *
 * 注意: EXIF 修正本身并不强制重编码 — 后端 Pillow 一样会再做一遍 exif_transpose,
 * 所以即使原文件带 orientation 也可以直传 (除非同时触发 a 或 b).
 */
export function shouldReencode(
  width: number,
  height: number,
  fileSize: number,
  maxDim: number = MAX_IMAGE_DIM,
  sizeThreshold: number = COMPRESS_IMAGE_BYTES
): boolean {
  if (Math.max(width, height) > maxDim) return true
  if (fileSize > sizeThreshold) return true
  return false
}

// ── 3. DOM 副作用: 实际预处理管线 ───────────────────────────────────────────

/**
 * 浏览器端图片预处理. **本函数有 DOM 副作用** (createImageBitmap + Canvas).
 *
 * 流程:
 *   1. createImageBitmap(file, { imageOrientation: 'from-image' })
 *      → 解码 + EXIF 旋转 (浏览器原生)
 *   2. 测量旋转后的真实 width/height
 *   3. computeResizeDimensions 算目标尺寸
 *   4. shouldReencode 判定是否需要重编码:
 *      - 不需要 → 返回原 file (快路径, 零拷贝)
 *      - 需要   → 画到 (Offscreen)Canvas → toBlob('image/jpeg', 0.92)
 *   5. 释放 ImageBitmap (close 防内存泄漏)
 *
 * @throws Error 如果 createImageBitmap 失败 (无效图像 / 格式不支持)
 *
 * 注意:
 * - 输出格式始终是 jpeg, 因为 jpeg 在 0.92 quality 下比 png 文件小 5-10 倍,
 *   而深度估计模型对色彩细节不敏感, jpeg 损耗可以接受.
 * - 输出 reencoded=true 的 blob 类型一定是 image/jpeg, 与原 file.type 无关.
 */
export async function preprocessImage(file: File): Promise<PreprocessedImage> {
  // Step 1: 解码 + EXIF 旋转
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (err) {
    throw new Error(
      `图片解码失败: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  try {
    const srcW = bitmap.width
    const srcH = bitmap.height

    // Step 2: 算目标尺寸
    const { width: dstW, height: dstH, resized } = computeResizeDimensions(
      srcW,
      srcH,
      MAX_IMAGE_DIM
    )

    // Step 3: 快路径 — 如果不需要缩放也不需要压缩, 直接返回原 file
    if (!shouldReencode(srcW, srcH, file.size)) {
      return {
        blob: file,
        width: srcW,
        height: srcH,
        reencoded: false,
        resized: false,
      }
    }

    // Step 4: 走 canvas 重编码
    const blob = await drawBitmapToBlob(bitmap, dstW, dstH)

    return {
      blob,
      width: dstW,
      height: dstH,
      reencoded: true,
      resized,
    }
  } finally {
    // 5. 释放 GPU 资源 (Chrome 在 ImageBitmap close 后才回收)
    bitmap.close()
  }
}

/**
 * 把 ImageBitmap 画到 (Offscreen)Canvas 并 toBlob 为 jpeg.
 * 优先用 OffscreenCanvas (不阻塞主线程), 不可用则回退普通 canvas.
 */
async function drawBitmapToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number
): Promise<Blob> {
  // 优先 OffscreenCanvas (Chrome 69+ / Firefox 105+)
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2D context 获取失败')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
  }

  // 回退: 普通 HTMLCanvasElement (老 Safari)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context 获取失败')
  ctx.drawImage(bitmap, 0, 0, width, height)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob 返回 null'))
      },
      'image/jpeg',
      0.92
    )
  })
}
