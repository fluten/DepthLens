/**
 * useFileDrop.test.ts — useFileDrop 纯函数单测
 *
 * 拆分原因 (CLAUDE.md ≤ 300 行):
 * - 本文件: extractFirstImageFile + handleDroppedFile 纯函数
 * - useFileDrop.hook.test.ts: hook 烟雾测试 (DOM 事件 + 状态)
 *
 * 测试范围:
 * - extractFirstImageFile: items 中的优先匹配规则 (file 优于 string,
 *   image/* 优于其他 file 类型, 空 type 兜底)
 * - handleDroppedFile: 校验通过/失败, 异步 onFile 等待
 */
import { describe, it, expect, vi } from 'vitest'
import { extractFirstImageFile, handleDroppedFile } from '../useFileDrop'
import { makeItemList, makeJpegFile, makeToast } from './_fileDropHelpers'

// ── extractFirstImageFile ──────────────────────────────────────────────────

describe('extractFirstImageFile', () => {
  it('null/undefined → null', () => {
    expect(extractFirstImageFile(null)).toBeNull()
    expect(extractFirstImageFile(undefined)).toBeNull()
  })

  it('空 list → null', () => {
    expect(extractFirstImageFile(makeItemList([]))).toBeNull()
  })

  it('只有 string 类型 → null', () => {
    const list = makeItemList([{ kind: 'string', type: 'text/plain' }])
    expect(extractFirstImageFile(list)).toBeNull()
  })

  it('找到第一个 image/* file', () => {
    const file = makeJpegFile()
    const list = makeItemList([
      { kind: 'string', type: 'text/plain' },
      { kind: 'file', type: 'image/jpeg', file },
    ])
    expect(extractFirstImageFile(list)).toBe(file)
  })

  it('多个 file 取第一个 image (跳过 PDF)', () => {
    const f1 = new File([new Uint8Array(4)], 'doc.pdf', {
      type: 'application/pdf',
    })
    const f2 = makeJpegFile()
    const list = makeItemList([
      { kind: 'file', type: 'application/pdf', file: f1 },
      { kind: 'file', type: 'image/jpeg', file: f2 },
    ])
    expect(extractFirstImageFile(list)).toBe(f2)
  })

  it('type 为空字符串的 file 也接受 (剪贴板兜底)', () => {
    const file = new File([new Uint8Array(4)], 'pasted.png', { type: '' })
    const list = makeItemList([{ kind: 'file', type: '', file }])
    expect(extractFirstImageFile(list)).toBe(file)
  })
})

// ── handleDroppedFile ──────────────────────────────────────────────────────

describe('handleDroppedFile', () => {
  it('合法 jpg → 调 onFile, 返回 true', async () => {
    const onFile = vi.fn()
    const toast = makeToast()
    const ok = await handleDroppedFile(makeJpegFile(), toast, onFile)
    expect(ok).toBe(true)
    expect(onFile).toHaveBeenCalledTimes(1)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('空文件 → toast.warning, 不调 onFile', async () => {
    const onFile = vi.fn()
    const toast = makeToast()
    const empty = new File([], 'e.jpg', { type: 'image/jpeg' })
    const ok = await handleDroppedFile(empty, toast, onFile)
    expect(ok).toBe(false)
    expect(onFile).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalled()
  })

  it('错误格式 → toast.warning, 不调 onFile', async () => {
    const onFile = vi.fn()
    const toast = makeToast()
    const txt = new File([new Uint8Array(8)], 'note.txt', {
      type: 'text/plain',
    })
    const ok = await handleDroppedFile(txt, toast, onFile)
    expect(ok).toBe(false)
    expect(onFile).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalled()
  })

  it('await onFile (异步回调被等待)', async () => {
    let resolved = false
    const onFile = vi.fn(async () => {
      await new Promise<void>((res) => setTimeout(res, 5))
      resolved = true
    })
    await handleDroppedFile(makeJpegFile(), makeToast(), onFile)
    expect(resolved).toBe(true)
  })
})
