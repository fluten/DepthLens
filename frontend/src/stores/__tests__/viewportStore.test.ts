/**
 * viewportStore.test.ts — 视口可视化参数 store 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { VIEWPORT_STORE_INITIAL, useViewportStore } from '../viewportStore'
import { COLORMAP_IDS, DEFAULT_COLORMAP_ID } from '../../lib/constants'

beforeEach(() => {
  useViewportStore.setState(VIEWPORT_STORE_INITIAL)
})

describe('viewportStore — 初始状态', () => {
  it('viewMode 默认 "2d"', () => {
    expect(useViewportStore.getState().viewMode).toBe('2d')
  })

  it('colormap 默认 = DEFAULT_COLORMAP_ID', () => {
    expect(useViewportStore.getState().colormap).toBe(DEFAULT_COLORMAP_ID)
  })

  it('depthRange 默认 [0, 1]', () => {
    expect(useViewportStore.getState().depthRange).toEqual([0, 1])
  })

  it('其他默认值', () => {
    const s = useViewportStore.getState()
    expect(s.invertDepth).toBe(false)
    expect(s.overlayAlpha).toBe(0.5)
    expect(s.pointSize).toBe(1)
    expect(s.showHUD).toBe(false)
  })
})

describe('viewportStore — setViewMode', () => {
  it.each(['2d', '3d', 'split', 'overlay'] as const)('可设置为 "%s"', (m) => {
    useViewportStore.getState().setViewMode(m)
    expect(useViewportStore.getState().viewMode).toBe(m)
  })
})

describe('viewportStore — setColormap', () => {
  it.each([...COLORMAP_IDS])('可设置为 "%s"', (id) => {
    useViewportStore.getState().setColormap(id)
    expect(useViewportStore.getState().colormap).toBe(id)
  })

  /**
   * **契约锁定**: store 层不做运行时白名单校验.
   *
   * 设计动机:
   * - "Store: 纯数据 + 同步 action" — store 不该判断业务有效性
   * - 校验责任在 lib/colormaps.getColormapLUT() 边界 — 它会查 COLORMAP_STOPS
   *   表, 找不到 ID 时抛错
   * - TypeScript 编译期已经把 setColormap 类型签名锁到 ColormapId 联合,
   *   正常代码路径无法传入非法值
   * - 唯一可能逃逸的场景: localStorage 还原 / 服务端配置注入 — 这些场景
   *   的责任在还原器层做白名单校验, 不在 store 内
   *
   * 这个测试用 `as any` 故意绕过 TS 验证, 锁定运行时行为:
   * 任何字符串都会被原样接受存储.
   */
  it('store 不做运行时白名单校验 (validation 在 lib/colormaps 边界)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useViewportStore.getState().setColormap('not-a-real-colormap' as any)
    expect(useViewportStore.getState().colormap).toBe('not-a-real-colormap')
    // 注意: 此时调用 lib/colormaps.getColormapLUT(state.colormap) 会因
    // COLORMAP_STOPS 找不到 key 而拿到 undefined → buildColormapLUT 抛错.
    // 这是 *有意的* 责任边界划分.
  })
})

describe('viewportStore — setDepthRange', () => {
  it('正常区间', () => {
    useViewportStore.getState().setDepthRange([0.2, 0.8])
    expect(useViewportStore.getState().depthRange).toEqual([0.2, 0.8])
  })

  it('反向区间被自动 swap', () => {
    useViewportStore.getState().setDepthRange([0.7, 0.3])
    const r = useViewportStore.getState().depthRange
    expect(r[0]).toBe(0.3)
    expect(r[1]).toBe(0.7)
  })

  it('负数被 clamp 到 0', () => {
    useViewportStore.getState().setDepthRange([-0.5, 0.5])
    expect(useViewportStore.getState().depthRange[0]).toBe(0)
  })

  it('> 1 被 clamp 到 1', () => {
    useViewportStore.getState().setDepthRange([0.2, 1.5])
    expect(useViewportStore.getState().depthRange[1]).toBe(1)
  })

  it('low === high 时强制保留至少 1/256 间距', () => {
    useViewportStore.getState().setDepthRange([0.5, 0.5])
    const [low, high] = useViewportStore.getState().depthRange
    expect(high).toBeGreaterThan(low)
  })

  it('NaN 输入 → 0 (NaN 防御)', () => {
    useViewportStore.getState().setDepthRange([NaN, NaN])
    const [low, high] = useViewportStore.getState().depthRange
    expect(low).toBe(0)
    expect(high).toBeGreaterThan(0) // 1/256 间距规则触发
  })

  it('单边 NaN → 该边变 0', () => {
    useViewportStore.getState().setDepthRange([NaN, 0.6])
    expect(useViewportStore.getState().depthRange[0]).toBe(0)
  })

  it('Infinity → fallback 0, 然后 [0,0] 触发 1/256 间距规则', () => {
    useViewportStore.getState().setDepthRange([0, Infinity])
    const [low, high] = useViewportStore.getState().depthRange
    // clamp01(Infinity) → 0 (NaN/Inf fallback), 此时 low=high=0,
    // 触发 1/256 间距规则 → high = 1/256
    expect(low).toBe(0)
    expect(high).toBeCloseTo(1 / 256, 6)
  })
})

describe('viewportStore — invertDepth', () => {
  it('toggleInvertDepth 反转', () => {
    useViewportStore.getState().toggleInvertDepth()
    expect(useViewportStore.getState().invertDepth).toBe(true)
    useViewportStore.getState().toggleInvertDepth()
    expect(useViewportStore.getState().invertDepth).toBe(false)
  })

  it('setInvertDepth 直接写入', () => {
    useViewportStore.getState().setInvertDepth(true)
    expect(useViewportStore.getState().invertDepth).toBe(true)
  })
})

describe('viewportStore — setOverlayAlpha', () => {
  it('正常值', () => {
    useViewportStore.getState().setOverlayAlpha(0.7)
    expect(useViewportStore.getState().overlayAlpha).toBe(0.7)
  })

  it('< 0 → 0', () => {
    useViewportStore.getState().setOverlayAlpha(-0.5)
    expect(useViewportStore.getState().overlayAlpha).toBe(0)
  })

  it('> 1 → 1', () => {
    useViewportStore.getState().setOverlayAlpha(2)
    expect(useViewportStore.getState().overlayAlpha).toBe(1)
  })

  it('NaN → 0 (fallback)', () => {
    useViewportStore.getState().setOverlayAlpha(0.7)
    useViewportStore.getState().setOverlayAlpha(NaN)
    expect(useViewportStore.getState().overlayAlpha).toBe(0)
  })

  it('Infinity → 0 (非有限走 fallback)', () => {
    useViewportStore.getState().setOverlayAlpha(Infinity)
    expect(useViewportStore.getState().overlayAlpha).toBe(0)
  })
})

describe('viewportStore — setPointSize', () => {
  it('正常值', () => {
    useViewportStore.getState().setPointSize(3)
    expect(useViewportStore.getState().pointSize).toBe(3)
  })

  it('< 1 被钳到 1', () => {
    useViewportStore.getState().setPointSize(0)
    expect(useViewportStore.getState().pointSize).toBe(1)
    useViewportStore.getState().setPointSize(-5)
    expect(useViewportStore.getState().pointSize).toBe(1)
  })

  it('NaN → 1 (fallback 到下界)', () => {
    useViewportStore.getState().setPointSize(NaN)
    expect(useViewportStore.getState().pointSize).toBe(1)
  })

  it('Infinity → 1 (非有限值)', () => {
    useViewportStore.getState().setPointSize(Infinity)
    expect(useViewportStore.getState().pointSize).toBe(1)
  })
})

describe('viewportStore — HUD', () => {
  it('toggleHUD 反转', () => {
    useViewportStore.getState().toggleHUD()
    expect(useViewportStore.getState().showHUD).toBe(true)
    useViewportStore.getState().toggleHUD()
    expect(useViewportStore.getState().showHUD).toBe(false)
  })

  it('setShowHUD 直接写入', () => {
    useViewportStore.getState().setShowHUD(true)
    expect(useViewportStore.getState().showHUD).toBe(true)
  })
})

describe('viewportStore — reset', () => {
  it('完全回到初始', () => {
    useViewportStore.getState().setViewMode('3d')
    useViewportStore.getState().setColormap('plasma')
    useViewportStore.getState().setDepthRange([0.2, 0.8])
    useViewportStore.getState().setInvertDepth(true)
    useViewportStore.getState().setOverlayAlpha(0.9)
    useViewportStore.getState().setPointSize(5)
    useViewportStore.getState().setShowHUD(true)
    useViewportStore.getState().reset()

    const s = useViewportStore.getState()
    expect(s.viewMode).toBe('2d')
    expect(s.colormap).toBe(DEFAULT_COLORMAP_ID)
    expect(s.depthRange).toEqual([0, 1])
    expect(s.invertDepth).toBe(false)
    expect(s.overlayAlpha).toBe(0.5)
    expect(s.pointSize).toBe(1)
    expect(s.showHUD).toBe(false)
  })
})
