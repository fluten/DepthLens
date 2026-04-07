/**
 * _fileDropHelpers.ts — useFileDrop 测试套件共享助手
 *
 * 下划线前缀: vitest include 模式只匹配 *.test.ts, 这个文件不会被
 * 当成测试入口. 内容是构造 mock File / DataTransferItemList / DragEvent
 * 的 happy-dom 友好工厂.
 */
import { vi } from 'vitest'

/** 一个最小的 toast mock, 只暴露 warning 方法 (useFileDrop 用到的子集) */
export function makeToast() {
  return { warning: vi.fn<(t: string) => void>() }
}

/** 构造一个合法 jpeg File. bytes 默认 32 (大于 0 即可通过 validators) */
export function makeJpegFile(name = 'test.jpg', bytes = 32): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })
}

/**
 * 构造一个 mock DataTransferItemList. happy-dom 不提供原生构造器,
 * 这里伪造 extractFirstImageFile 实际读到的字段 (length / 索引访问 /
 * kind / type / getAsFile). 其他 DataTransferItem 字段 (getAsString
 * 等) 不需要造, hook 不读它们.
 */
export function makeItemList(
  entries: Array<{
    kind: 'file' | 'string'
    type: string
    file?: File
  }>
): DataTransferItemList {
  const items = entries.map((e) => ({
    kind: e.kind,
    type: e.type,
    getAsFile: () => e.file ?? null,
  }))
  const list: Record<string | number, unknown> = { length: items.length }
  items.forEach((it, i) => {
    list[i] = it
  })
  return list as unknown as DataTransferItemList
}

/**
 * 构造一个看起来像 DragEvent 的 Event. happy-dom 没有 DragEvent 构造器,
 * 但 hook 内部把事件 cast 成 DragEvent 后只读取 dataTransfer / preventDefault,
 * 这些都可以伪造为可枚举属性.
 */
export function makeDragEvent(
  type: string,
  dataTransfer: { types: string[]; items?: DataTransferItemList | null }
): Event {
  const evt = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(evt, 'dataTransfer', { value: dataTransfer })
  return evt
}

/** 构造一个看起来像 ClipboardEvent 的 Event. 只造 clipboardData.items. */
export function makePasteEvent(items: DataTransferItemList | null): Event {
  const evt = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(evt, 'clipboardData', { value: { items } })
  return evt
}
