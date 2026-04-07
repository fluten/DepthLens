/**
 * hooks/useFileDrop.ts — 全局拖拽 + 粘贴文件入口
 *
 * 职责 (hook 层 — 业务编排):
 * - 监听 window 级 dragenter / dragover / dragleave / drop
 * - 监听 window 级 Ctrl+V (clipboard paste)
 * - 拿到 File 后:
 *     1. validateImageFile 校验
 *     2. 失败 → toast.warning
 *     3. 成功 → 调 onFile 回调 (通常是 useDepthEstimation 的 estimateImage)
 * - 维护 isDraggingOver 状态 (UI: DropOverlay 显示/隐藏)
 *
 * 关键 UX (与 SPEC §13.2 一致):
 * - dragenter/dragleave 用 counter 而非 boolean: 因为子元素 enter 会触发
 *   父元素的 leave 假信号, 用计数器才能正确判断"真正离开窗口"
 * - dragover 必须 preventDefault, 否则浏览器默认会"在新标签页打开图片"
 * - 一次性只接收第一个 file (拖拽多文件场景下), Phase 1 不支持批处理
 *
 * 设计:
 * - 主体逻辑抽成纯函数 ``handleDroppedFile`` 可单测
 * - hook 本身负责绑定/解绑事件 + 维护 isDraggingOver state
 *
 * 注意 — Phase 1 范围:
 * - 视频文件 (mp4 等) 不在本 hook 处理, 等 Phase 3 加 useFileDrop 的 mode 参数
 * - 多文件批处理也是后续阶段
 */

import { useCallback, useEffect, useState } from 'react'
import { validateImageFile } from '../lib/validators'
import { toast as defaultToast } from '../services/toast'

// ── 注入点类型 ──────────────────────────────────────────────────────────────

interface ToastLike {
  warning: (text: string) => void
}

/** 收到合法图片文件后的回调. 由调用方 (Viewport) 提供 estimateImage. */
export type OnFileCallback = (file: File) => void | Promise<void>

// ── 纯函数: 处理一个候选 file ──────────────────────────────────────────────

/**
 * 校验 + 分发. 不抛异常, 不读 store, 不操作 DOM.
 *
 * @returns 是否成功传给 onFile (true = 通过校验)
 */
export async function handleDroppedFile(
  file: File,
  toast: ToastLike,
  onFile: OnFileCallback
): Promise<boolean> {
  const validation = validateImageFile(file)
  if (!validation.ok) {
    toast.warning(validation.message)
    return false
  }
  await onFile(file)
  return true
}

// ── 纯函数: 从 DataTransfer / ClipboardData 取第一个图片 file ───────────────

/**
 * 从 DataTransferItemList 中取第一个 kind='file' 且 type 以 image/ 开头的 File.
 * 找不到返回 null. 这个函数兼顾 drop event 和 paste event 两种场景 —
 * 它们都暴露 DataTransferItemList (DataTransfer.items / ClipboardEvent.clipboardData.items).
 *
 * 注意: 不能直接用 DataTransfer.files, 因为剪贴板粘贴时 files 字段在某些
 * 浏览器下是空的, 必须走 items.
 */
export function extractFirstImageFile(
  items: DataTransferItemList | null | undefined
): File | null {
  if (!items) return null
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    if (item.kind !== 'file') continue
    // type 可能是 'image/jpeg' 或空字符串 (某些剪贴板). 空字符串也接受,
    // validateImageFile 内部会用扩展名兜底.
    if (item.type && !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}

// ── React Hook ──────────────────────────────────────────────────────────────

export interface UseFileDropApi {
  /** 是否有 file 正在被拖到窗口上方 (UI: DropOverlay visibility) */
  isDraggingOver: boolean
}

export function useFileDrop(
  onFile: OnFileCallback,
  options: { toast?: ToastLike; target?: Window | HTMLElement } = {}
): UseFileDropApi {
  const toast = options.toast ?? defaultToast
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  // onFile 通过 ref 转发, 避免每次 onFile 引用变化都重新绑事件
  // 但同时保证回调内部读到最新的 onFile.
  const onFileCb = useCallback(onFile, [onFile])
  const toastCb = useCallback(
    (msg: string) => toast.warning(msg),
    [toast]
  )

  useEffect(() => {
    // happy-dom / SSR 防御: target 默认 window, 但要确保它存在
    const target =
      options.target ?? (typeof window !== 'undefined' ? window : null)
    if (!target) return

    // 用 counter 而非 boolean 跟踪 dragenter/leave —
    // 子元素切换时 enter 会先于 leave 触发, 普通 boolean 会闪烁.
    let dragCounter = 0

    const handleDragEnter = (e: Event) => {
      const evt = e as DragEvent
      // 只有携带 file 的拖拽才进入"准备接收"状态.
      // 拖文本/链接的 e.dataTransfer.types 不含 'Files'.
      if (!evt.dataTransfer?.types.includes('Files')) return
      evt.preventDefault()
      dragCounter++
      if (dragCounter === 1) setIsDraggingOver(true)
    }

    const handleDragOver = (e: Event) => {
      const evt = e as DragEvent
      if (!evt.dataTransfer?.types.includes('Files')) return
      // 关键: 必须 preventDefault, 否则浏览器默认在新标签打开
      evt.preventDefault()
    }

    const handleDragLeave = (e: Event) => {
      const evt = e as DragEvent
      if (!evt.dataTransfer?.types.includes('Files')) return
      dragCounter = Math.max(0, dragCounter - 1)
      if (dragCounter === 0) setIsDraggingOver(false)
    }

    const handleDrop = (e: Event) => {
      const evt = e as DragEvent
      if (!evt.dataTransfer?.types.includes('Files')) return
      evt.preventDefault()
      dragCounter = 0
      setIsDraggingOver(false)

      const file = extractFirstImageFile(evt.dataTransfer.items)
      if (!file) {
        // 拖了非图片文件 (例如 .txt) — 给个提示, 不静默
        toastCb('未识别到图片文件')
        return
      }
      void handleDroppedFile(file, { warning: toastCb }, onFileCb)
    }

    const handlePaste = (e: Event) => {
      const evt = e as ClipboardEvent
      const file = extractFirstImageFile(evt.clipboardData?.items)
      if (!file) return // 粘贴文本/其他内容, 静默忽略 (不打扰用户)
      evt.preventDefault()
      void handleDroppedFile(file, { warning: toastCb }, onFileCb)
    }

    target.addEventListener('dragenter', handleDragEnter)
    target.addEventListener('dragover', handleDragOver)
    target.addEventListener('dragleave', handleDragLeave)
    target.addEventListener('drop', handleDrop)
    target.addEventListener('paste', handlePaste)

    return () => {
      target.removeEventListener('dragenter', handleDragEnter)
      target.removeEventListener('dragover', handleDragOver)
      target.removeEventListener('dragleave', handleDragLeave)
      target.removeEventListener('drop', handleDrop)
      target.removeEventListener('paste', handlePaste)
    }
  }, [onFileCb, toastCb, options.target])

  return { isDraggingOver }
}
