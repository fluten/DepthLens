/**
 * useFileDrop.hook.test.ts — useFileDrop React hook 烟雾测试
 *
 * 拆分原因 (CLAUDE.md ≤ 300 行): 纯函数测试在 useFileDrop.test.ts.
 * 本文件只验证 hook 在 mount/unmount + DOM 事件下的行为.
 *
 * 测试策略:
 * - 不引入 @testing-library/react. 用 React 19 act + react-dom/client
 *   手动渲染一个调用 hook 的小组件
 * - 用真实 window 作为 target, dispatchEvent 触发 hook 内绑定的监听器
 * - DragEvent / ClipboardEvent 在 happy-dom 中不存在, 用 Event 子集伪造
 *   (见 _fileDropHelpers)
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useFileDrop } from '../useFileDrop'
import {
  makeDragEvent,
  makeItemList,
  makeJpegFile,
  makePasteEvent,
  makeToast,
} from './_fileDropHelpers'

describe('useFileDrop (smoke)', () => {
  it('dragenter (含 Files) 后 isDraggingOver=true, dragleave 后回到 false', async () => {
    const target = window
    const onFile = vi.fn()
    const states: boolean[] = []

    function Probe() {
      const { isDraggingOver } = useFileDrop(onFile, { target })
      states.push(isDraggingOver)
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(Probe))
    })

    // 初始 false
    expect(states[0]).toBe(false)

    // dragenter (with Files)
    await act(async () => {
      target.dispatchEvent(
        makeDragEvent('dragenter', { types: ['Files'] })
      )
    })
    expect(states.at(-1)).toBe(true)

    // dragleave
    await act(async () => {
      target.dispatchEvent(
        makeDragEvent('dragleave', { types: ['Files'] })
      )
    })
    expect(states.at(-1)).toBe(false)

    container.remove()
  })

  it('drop 一张图片 → onFile 被调用', async () => {
    const target = window
    const onFile = vi.fn()
    const file = makeJpegFile()

    function Probe() {
      useFileDrop(onFile, { target })
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(Probe))
    })

    await act(async () => {
      target.dispatchEvent(
        makeDragEvent('drop', {
          types: ['Files'],
          items: makeItemList([{ kind: 'file', type: 'image/jpeg', file }]),
        })
      )
    })
    // handleDroppedFile 是 async, flush 一下
    await act(async () => {})

    expect(onFile).toHaveBeenCalledTimes(1)
    expect(onFile).toHaveBeenCalledWith(file)
    container.remove()
  })

  it('drop 非图片 → toast.warning, 不调 onFile', async () => {
    const target = window
    const onFile = vi.fn()
    const toast = makeToast()
    const pdf = new File([new Uint8Array(4)], 'doc.pdf', {
      type: 'application/pdf',
    })

    function Probe() {
      useFileDrop(onFile, { target, toast })
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(Probe))
    })

    await act(async () => {
      target.dispatchEvent(
        makeDragEvent('drop', {
          types: ['Files'],
          items: makeItemList([
            { kind: 'file', type: 'application/pdf', file: pdf },
          ]),
        })
      )
    })
    await act(async () => {})

    expect(onFile).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalled()
    container.remove()
  })

  it('paste 一张图片 → onFile 被调用', async () => {
    const target = window
    const onFile = vi.fn()
    const file = makeJpegFile('clipboard.jpg')

    function Probe() {
      useFileDrop(onFile, { target })
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(Probe))
    })

    await act(async () => {
      target.dispatchEvent(
        makePasteEvent(
          makeItemList([{ kind: 'file', type: 'image/jpeg', file }])
        )
      )
    })
    await act(async () => {})

    expect(onFile).toHaveBeenCalledTimes(1)
    expect(onFile).toHaveBeenCalledWith(file)
    container.remove()
  })

  it('paste 文本 → 静默忽略, 不调 onFile, 不 toast', async () => {
    const target = window
    const onFile = vi.fn()
    const toast = makeToast()

    function Probe() {
      useFileDrop(onFile, { target, toast })
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(createElement(Probe))
    })

    await act(async () => {
      target.dispatchEvent(
        makePasteEvent(
          makeItemList([{ kind: 'string', type: 'text/plain' }])
        )
      )
    })
    await act(async () => {})

    expect(onFile).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    container.remove()
  })

  it('unmount 后 dispatch 不再触发 onFile (事件已解绑)', async () => {
    const target = window
    const onFile = vi.fn()

    function Probe() {
      useFileDrop(onFile, { target })
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root: ReturnType<typeof createRoot>
    await act(async () => {
      root = createRoot(container)
      root.render(createElement(Probe))
    })

    await act(async () => {
      root!.unmount()
    })

    target.dispatchEvent(
      makeDragEvent('drop', {
        types: ['Files'],
        items: makeItemList([
          { kind: 'file', type: 'image/jpeg', file: makeJpegFile() },
        ]),
      })
    )
    await act(async () => {})

    expect(onFile).not.toHaveBeenCalled()
    container.remove()
  })
})
