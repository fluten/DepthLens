/**
 * layout_smoke.test.tsx — Phase 1 前端布局组件冒烟测试
 *
 * 目的:
 * - 验证 10 个新布局组件 (Viewport / EmptyState / DepthCanvas2D /
 *   ScanlineLoader / ModeBar / SettingsSheet / DropOverlay / ConnectionBar /
 *   ModelSelector / ColormapPicker) 能在 happy-dom 环境下无 crash mount
 * - 因为 App.tsx 还没接线 (Phase 1 末尾任务), vite build 不会 bundle 这些
 *   组件, 冒烟测试是保证"能跑起来"的最低保障
 * - 不验证视觉细节 (那是 DESIGN.md 验收清单的事情), 只验证没有运行时错误
 *
 * 为什么是冒烟而非完整交互测试:
 * - Framer Motion + happy-dom 对 layoutId / drag 手势支持有限, 做交互断言
 *   会被框架细节卡住; Phase 1 目标是功能打通, Phase 2 再补交互测试
 * - Store 的具体行为已经在 stores/__tests__/ 覆盖, 这里只关心组件接线
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// 组件 import
import { ScanlineLoader } from '../viewport/ScanlineLoader'
import { DepthCanvas2D } from '../viewport/DepthCanvas2D'
import { EmptyState } from '../viewport/EmptyState'
import { Viewport } from '../viewport/Viewport'
import { DropOverlay } from '../overlay/DropOverlay'
import { ModeBar } from '../overlay/ModeBar'
import { ConnectionBar } from '../overlay/ConnectionBar'
import { SettingsSheet } from '../overlay/SettingsSheet'
import { ModelSelector } from '../settings/ModelSelector'
import { ColormapPicker } from '../settings/ColormapPicker'

// Store reset (避免前后测试污染)
import { useDepthStore, DEPTH_STORE_INITIAL } from '../../stores/depthStore'
import { useInputStore, INPUT_STORE_INITIAL } from '../../stores/inputStore'
import {
  useConnectionStore,
  CONNECTION_STORE_INITIAL,
} from '../../stores/connectionStore'
import { useModelStore, MODEL_STORE_INITIAL } from '../../stores/modelStore'
import {
  useViewportStore,
  VIEWPORT_STORE_INITIAL,
} from '../../stores/viewportStore'

// ── mount 辅助 ──────────────────────────────────────────────────────────────

interface Mounted {
  container: HTMLDivElement
  unmount: () => void
}

async function mount(node: React.ReactElement): Promise<Mounted> {
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

// 每个测试前重置 store 到初始态
beforeEach(() => {
  useDepthStore.setState({ ...DEPTH_STORE_INITIAL })
  useInputStore.setState({ ...INPUT_STORE_INITIAL })
  useConnectionStore.setState({ ...CONNECTION_STORE_INITIAL })
  useModelStore.setState({ ...MODEL_STORE_INITIAL })
  useViewportStore.setState({ ...VIEWPORT_STORE_INITIAL })
})

// ── viewport/* ──────────────────────────────────────────────────────────────

describe('viewport layer — smoke', () => {
  it('ScanlineLoader: 挂载渲染 progressbar role', async () => {
    const m = await mount(createElement(ScanlineLoader))
    const el = m.container.querySelector('[role="progressbar"]')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('aria-busy')).toBe('true')
    m.unmount()
  })

  it('DepthCanvas2D: 无数据时 return null (不渲染 canvas)', async () => {
    const m = await mount(createElement(DepthCanvas2D))
    expect(m.container.querySelector('canvas')).toBeNull()
    m.unmount()
  })

  it('EmptyState: 渲染主标题文字 "拖入图片以查看深度"', async () => {
    const m = await mount(createElement(EmptyState))
    expect(m.container.textContent).toContain('拖入图片以查看深度')
    m.unmount()
  })

  it('EmptyState: 包含 "打开摄像头" 按钮且点击后切到 camera 模式', async () => {
    const m = await mount(createElement(EmptyState))
    const btns = Array.from(m.container.querySelectorAll('button'))
    const camBtn = btns.find((b) => b.textContent?.includes('打开摄像头'))
    expect(camBtn).toBeDefined()

    await act(async () => {
      camBtn!.click()
    })
    expect(useInputStore.getState().mode).toBe('camera')
    m.unmount()
  })

  it('EmptyState: 不渲染键盘快捷键提示 (Space/HUD/Esc) — 防与 ModeBar 重叠回潮', async () => {
    // 早期版本曾在 fixed bottom-10 渲染过 Space/H/Esc 三个 KeyHint pill,
    // 但 bottom 40px 直接落在 ModeBar (bottom 0, height 80px) 内部, 与
    // 模式标签视觉重叠. 修复后这些提示统一在 SettingsSheet 底部展示,
    // EmptyState 不应再含这些字符. 反向断言防回潮.
    const m = await mount(createElement(EmptyState))
    const text = m.container.textContent ?? ''
    // 不能用 toContain('H') 因为 "或点击" 等中文文字里可能含 H 字符
    // (实际上不含, 但保险起见用 word boundary)
    expect(text).not.toContain('Space')
    expect(text).not.toContain('Esc')
    expect(text).not.toContain('HUD')
    m.unmount()
  })

  it('EmptyState: 渲染上滑箭头暗示 (ChevronUp icon)', async () => {
    const m = await mount(createElement(EmptyState))
    // lucide-react 的 ChevronUp 渲染为 <svg class="lucide lucide-chevron-up">
    const svgs = m.container.querySelectorAll('svg')
    const chevron = Array.from(svgs).find((s) =>
      s.getAttribute('class')?.includes('chevron-up')
    )
    expect(chevron).toBeDefined()
    m.unmount()
  })

  it('Viewport: 初始态渲染 EmptyState 而非 Canvas 或 Scanline', async () => {
    const m = await mount(createElement(Viewport))
    // 有 EmptyState 的主标题
    expect(m.container.textContent).toContain('拖入图片以查看深度')
    // 没有 canvas (无结果)
    expect(m.container.querySelector('canvas')).toBeNull()
    // 没有 scanline (未在推理)
    expect(m.container.querySelector('[role="progressbar"]')).toBeNull()
    m.unmount()
  })

  it('Viewport: isProcessing=true 时渲染 scanline', async () => {
    useDepthStore.setState({ isProcessing: true })
    const m = await mount(createElement(Viewport))
    expect(m.container.querySelector('[role="progressbar"]')).not.toBeNull()
    m.unmount()
  })
})

// ── overlay/* ───────────────────────────────────────────────────────────────

describe('overlay layer — smoke', () => {
  it('DropOverlay: visible=false 时不渲染内容', async () => {
    const m = await mount(createElement(DropOverlay, { visible: false }))
    expect(m.container.textContent).not.toContain('释放以分析深度')
    m.unmount()
  })

  it('DropOverlay: visible=true 时渲染大标题', async () => {
    const m = await mount(createElement(DropOverlay, { visible: true }))
    expect(m.container.textContent).toContain('释放以分析深度')
    m.unmount()
  })

  it('ModeBar: 渲染 4 个模式 tab, 初始选中 image', async () => {
    const m = await mount(createElement(ModeBar))
    const tabs = m.container.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBe(4)
    // 'image' 是初始 mode, 对应标签是 "图片"
    const selected = m.container.querySelector('[aria-selected="true"]')
    expect(selected?.textContent).toContain('图片')
    m.unmount()
  })

  it('ModeBar: tablist inline style gap 引用 var(--space-6) (DESIGN.md §8 = 24px)', async () => {
    // 防回潮: 早期 className 用 gap-6 依赖 tailwind extend.spacing 解析,
    // 改成 inline style 显式 var(--space-6) 后必须保持引用. 任何回退到
    // tailwind class 都会让这个断言失败.
    const m = await mount(createElement(ModeBar))
    const tablist = m.container.querySelector('[role="tablist"]') as HTMLElement
    expect(tablist.style.gap).toBe('var(--space-6)')
    m.unmount()
  })

  it('ModeBar: 点击 "视频" tab 切换 mode 到 video', async () => {
    const m = await mount(createElement(ModeBar))
    const tabs = Array.from(
      m.container.querySelectorAll('[role="tab"]')
    ) as HTMLElement[]
    const videoTab = tabs.find((t) => t.textContent?.includes('视频'))
    expect(videoTab).toBeDefined()
    await act(async () => {
      videoTab!.click()
    })
    expect(useInputStore.getState().mode).toBe('video')
    m.unmount()
  })

  it('ModeBar: 向下滚轮 (deltaY > 0) 切到下一个模式', async () => {
    const m = await mount(createElement(ModeBar))
    const bar = m.container.querySelector('[role="tablist"]') as HTMLElement
    expect(bar).toBeDefined()

    // 初始 image, 向下滚 → 期望 video
    await act(async () => {
      const evt = new WheelEvent('wheel', {
        deltaY: 100,
        bubbles: true,
      })
      bar.dispatchEvent(evt)
    })
    expect(useInputStore.getState().mode).toBe('video')
    m.unmount()
  })

  it('ModeBar: 向上滚轮 (deltaY < 0) 切到上一个模式 (回绕)', async () => {
    const m = await mount(createElement(ModeBar))
    const bar = m.container.querySelector('[role="tablist"]') as HTMLElement

    // image 向上滚 → 回绕到最后一个 (3d)
    await act(async () => {
      const evt = new WheelEvent('wheel', { deltaY: -100, bubbles: true })
      bar.dispatchEvent(evt)
    })
    expect(useInputStore.getState().mode).toBe('3d')
    m.unmount()
  })

  it('ModeBar: 100ms 内多次滚轮只切换一次 (节流)', async () => {
    const m = await mount(createElement(ModeBar))
    const bar = m.container.querySelector('[role="tablist"]') as HTMLElement

    // 连续两次 deltaY=100 (相隔 < 100ms), 应只切一次: image → video
    await act(async () => {
      // React SyntheticEvent 用 timeStamp 判定, dispatch 原生 WheelEvent
      // 浏览器会自动填充 timeStamp, happy-dom 也一样.
      bar.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))
      bar.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))
    })
    // 第二次被节流掉, 仍然停在 video
    expect(useInputStore.getState().mode).toBe('video')
    m.unmount()
  })

  it('ConnectionBar: 初始 disconnected 时渲染 "后端离线"', async () => {
    // 初始 status 就是 disconnected, 无需手动设置
    const m = await mount(createElement(ConnectionBar))
    expect(m.container.textContent).toContain('后端离线')
    m.unmount()
  })

  it('ConnectionBar: status=connected 时不渲染', async () => {
    useConnectionStore.setState({ status: 'connected' })
    const m = await mount(createElement(ConnectionBar))
    expect(m.container.textContent).not.toContain('后端离线')
    expect(m.container.textContent).not.toContain('重连中')
    m.unmount()
  })

  it('ConnectionBar: status=reconnecting 时渲染 "重连中..." 而非 "后端离线"', async () => {
    useConnectionStore.setState({ status: 'reconnecting' })
    const m = await mount(createElement(ConnectionBar))
    expect(m.container.textContent).toContain('重连中')
    expect(m.container.textContent).not.toContain('后端离线')
    m.unmount()
  })

  it('ConnectionBar: reconnecting 态不渲染旋转 arc (禁止菊花约束)', async () => {
    useConnectionStore.setState({ status: 'reconnecting' })
    const m = await mount(createElement(ConnectionBar))
    // 原来的 spinner arc 会用 border-top-color + rotate 动画, 改版后应该
    // 是两个 rounded-full 圆 (与 disconnected 相同结构, 只是颜色是 accent).
    // 验证没有 border-top-color 样式存在
    const elems = m.container.querySelectorAll('*')
    const hasBorderTopColor = Array.from(elems).some((el) => {
      const style = (el as HTMLElement).style?.borderTopColor
      return style && style !== ''
    })
    expect(hasBorderTopColor).toBe(false)
    m.unmount()
  })

  it("SettingsSheet: snap='closed' 时不渲染任何内容", async () => {
    const m = await mount(
      createElement(SettingsSheet, { snap: 'closed', onSnapChange: () => {} })
    )
    expect(m.container.textContent).not.toContain('模型')
    expect(m.container.textContent).not.toContain('色彩映射')
    m.unmount()
  })

  it("SettingsSheet: snap='half' 时渲染 MODEL + COLORMAP 小节", async () => {
    const m = await mount(
      createElement(SettingsSheet, { snap: 'half', onSnapChange: () => {} })
    )
    expect(m.container.textContent).toContain('模型')
    expect(m.container.textContent).toContain('色彩映射')
    m.unmount()
  })

  it("SettingsSheet: snap='full' 时 aria-expanded 为 true", async () => {
    const m = await mount(
      createElement(SettingsSheet, { snap: 'full', onSnapChange: () => {} })
    )
    const dialog = m.container.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-expanded')).toBe('true')
    m.unmount()
  })

  it("SettingsSheet: snap='half' 时 aria-expanded 为 false", async () => {
    const m = await mount(
      createElement(SettingsSheet, { snap: 'half', onSnapChange: () => {} })
    )
    const dialog = m.container.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-expanded')).toBe('false')
    m.unmount()
  })
})

// ── settings/* ──────────────────────────────────────────────────────────────

describe('settings layer — smoke', () => {
  it('ModelSelector: 渲染 3 个模型按钮', async () => {
    const m = await mount(createElement(ModelSelector))
    const btns = m.container.querySelectorAll('button')
    expect(btns.length).toBe(3)
    const text = m.container.textContent ?? ''
    expect(text).toContain('Small')
    expect(text).toContain('Base')
    expect(text).toContain('Large')
    m.unmount()
  })

  it('ModelSelector: 初始 idle 状态显示 "未加载"', async () => {
    const m = await mount(createElement(ModelSelector))
    expect(m.container.textContent).toContain('未加载')
    m.unmount()
  })

  it('ModelSelector: status=ready 显示设备和显存信息', async () => {
    useModelStore.setState({
      currentModel: 'depth-anything-v2-base',
      status: 'ready',
      device: 'cuda',
      vramUsage: 342,
    })
    const m = await mount(createElement(ModelSelector))
    expect(m.container.textContent).toContain('已就绪')
    expect(m.container.textContent).toContain('CUDA')
    expect(m.container.textContent).toContain('342')
    m.unmount()
  })

  it('ModelSelector: status=loading 显示 "加载中" 且其他按钮 disabled', async () => {
    useModelStore.setState({
      currentModel: 'depth-anything-v2-base',
      status: 'loading',
    })
    const m = await mount(createElement(ModelSelector))
    expect(m.container.textContent).toContain('加载中')

    // 非当前加载的按钮 (Small, Large) 应该 disabled
    const btns = Array.from(m.container.querySelectorAll('button'))
    const small = btns.find((b) => b.textContent?.includes('Small'))
    const large = btns.find((b) => b.textContent?.includes('Large'))
    expect(small?.disabled).toBe(true)
    expect(large?.disabled).toBe(true)
    m.unmount()
  })

  it('ModelSelector: status=downloading 显示下载进度百分比', async () => {
    useModelStore.setState({
      currentModel: 'depth-anything-v2-large',
      status: 'downloading',
      downloadProgress: 37,
    })
    const m = await mount(createElement(ModelSelector))
    expect(m.container.textContent).toContain('下载中')
    expect(m.container.textContent).toContain('37')
    m.unmount()
  })

  it('ModelSelector: status=error 显示 errorMessage', async () => {
    useModelStore.setState({
      status: 'error',
      errorMessage: '显存不足',
    })
    const m = await mount(createElement(ModelSelector))
    expect(m.container.textContent).toContain('显存不足')
    m.unmount()
  })

  it('ModelSelector: CPU 模式不显示 VRAM 数字', async () => {
    useModelStore.setState({
      currentModel: 'depth-anything-v2-small',
      status: 'ready',
      device: 'cpu',
      vramUsage: 0,
    })
    const m = await mount(createElement(ModelSelector))
    expect(m.container.textContent).toContain('已就绪')
    expect(m.container.textContent).toContain('CPU')
    // CPU 模式不应附加显存 " · XXX MB"
    expect(m.container.textContent).not.toMatch(/· 0 MB/)
    m.unmount()
  })

  it('ColormapPicker: 渲染 7 张 colormap 卡片', async () => {
    const m = await mount(createElement(ColormapPicker))
    const btns = m.container.querySelectorAll('button')
    expect(btns.length).toBe(7)
    const text = m.container.textContent ?? ''
    expect(text).toContain('Inferno')
    expect(text).toContain('Plasma')
    expect(text).toContain('Magma')
    expect(text).toContain('Turbo')
    expect(text).toContain('Viridis')
    expect(text).toContain('Bone')
    expect(text).toContain('Cividis')
    m.unmount()
  })

  it('ColormapPicker: 点击 Plasma 切换 viewportStore.colormap', async () => {
    const m = await mount(createElement(ColormapPicker))
    const btns = Array.from(m.container.querySelectorAll('button')) as HTMLElement[]
    const plasma = btns.find((b) => b.textContent?.includes('Plasma'))
    expect(plasma).toBeDefined()
    await act(async () => {
      plasma!.click()
    })
    expect(useViewportStore.getState().colormap).toBe('plasma')
    m.unmount()
  })

  it('ColormapPicker: 初始 colormap=inferno 时 Inferno 卡片 aria-pressed=true', async () => {
    const m = await mount(createElement(ColormapPicker))
    const btns = Array.from(m.container.querySelectorAll('button')) as HTMLElement[]
    const inferno = btns.find((b) => b.textContent?.includes('Inferno'))
    expect(inferno?.getAttribute('aria-pressed')).toBe('true')
    m.unmount()
  })
})
