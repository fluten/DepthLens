/**
 * _mountHelper.tsx — components/ui 测试套件共享渲染工具
 *
 * 下划线前缀: vitest 只匹配 *.test.{ts,tsx}, 这个文件不会被当成测试入口.
 *
 * 提供给所有 components/ui/__tests__/*.test.tsx 用的最小手动渲染器:
 * - 不依赖 @testing-library/react (项目没装)
 * - 用 React 19 act + createRoot 直接渲染到 happy-dom
 * - 返回 unmount 函数, 测试结尾必须调以避免内存泄漏
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

export interface Mounted {
  /** 测试用渲染容器 (已挂到 document.body) */
  container: HTMLDivElement
  /** 卸载组件 + 移除 container, 测试结尾必须调 */
  unmount: () => void
}

/**
 * 渲染一个 React 节点到新的 div, 返回容器和 unmount 函数.
 *
 * @example
 *   const m = await mount(createElement(MyComponent, { foo: 'bar' }))
 *   expect(m.container.textContent).toContain('bar')
 *   m.unmount()
 */
export async function mount(node: React.ReactElement): Promise<Mounted> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root
  await act(async () => {
    root = createRoot(container)
    root.render(node)
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}
