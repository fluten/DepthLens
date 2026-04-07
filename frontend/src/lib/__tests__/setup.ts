/**
 * Vitest setup — 测试运行前注入的 polyfill / 全局
 *
 * 范围:
 * - ImageData polyfill — happy-dom 15.x 没实现 ImageData 构造器, 但 lib/depth.ts
 *   的 applyColormap 需要返回它. 这里提供一个最小 polyfill, 字段与浏览器一致
 *   (data / width / height / colorSpace) 足够 lib 层测试使用. 浏览器内运行时
 *   会用浏览器原生实现, 这个 polyfill 不参与 production bundle.
 * - React 19 act 环境标记 — hooks/ 层的 hook 烟雾测试需要用 React 的 act() 包
 *   渲染. React 19 通过 globalThis.IS_REACT_ACT_ENVIRONMENT 判断当前是否处于
 *   测试环境, 没有这个标记会输出 "The current testing environment is not
 *   configured to support act(...)" 警告 (功能不受影响, 只是噪音). 设为 true
 *   即可消音, 与 @testing-library/react 的内部做法一致.
 */

// React 19 测试环境标记
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    readonly data: Uint8ClampedArray
    readonly width: number
    readonly height: number
    readonly colorSpace = 'srgb' as const

    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      maybeHeight?: number
    ) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = maybeHeight ?? this.data.length / 4 / this.width
      } else {
        // ImageData(width, height) 形式
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      }
    }
  }
  // @ts-expect-error — 我们故意覆盖全局
  globalThis.ImageData = ImageDataPolyfill
}
