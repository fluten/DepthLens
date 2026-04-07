/**
 * modelStore.test.ts — 模型 store 单元测试
 *
 * 验证:
 * - 初始状态符合 SPEC §8 默认
 * - 每个 action 修改对应字段, 不污染其他字段 (单一职责)
 * - setError 自动清 currentModel 等关联字段
 * - reset 完全回到初始
 * - downloadProgress clamp 防御
 *
 * 测试隔离: 每个 it 用 useModelStore.setState(MODEL_STORE_INITIAL) 重置
 * (Zustand 的 setState 是浅合并, action 引用不会被覆盖).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MODEL_STORE_INITIAL, useModelStore } from '../modelStore'

beforeEach(() => {
  useModelStore.setState(MODEL_STORE_INITIAL)
})

describe('modelStore — 初始状态', () => {
  it('字段默认值与 SPEC §8 一致', () => {
    const s = useModelStore.getState()
    expect(s.currentModel).toBeNull()
    expect(s.status).toBe('idle')
    expect(s.device).toBe('cpu')
    expect(s.vramUsage).toBe(0)
    expect(s.downloadProgress).toBe(0)
    expect(s.errorMessage).toBeNull()
  })
})

describe('modelStore — setStatus', () => {
  it.each(['idle', 'loading', 'downloading', 'ready', 'error'] as const)(
    '可设置为 "%s"',
    (status) => {
      useModelStore.getState().setStatus(status)
      expect(useModelStore.getState().status).toBe(status)
    }
  )

  it('不影响其他字段', () => {
    const before = useModelStore.getState()
    useModelStore.getState().setStatus('loading')
    const after = useModelStore.getState()
    expect(after.currentModel).toBe(before.currentModel)
    expect(after.device).toBe(before.device)
    expect(after.vramUsage).toBe(before.vramUsage)
  })
})

describe('modelStore — setModel', () => {
  it('原子地更新 currentModel + device + status=ready + 清 errorMessage', () => {
    // 先制造 error 状态
    useModelStore.getState().setError('boom')
    expect(useModelStore.getState().errorMessage).toBe('boom')

    useModelStore.getState().setModel('depth-anything-v2-base', 'cuda')

    const s = useModelStore.getState()
    expect(s.currentModel).toBe('depth-anything-v2-base')
    expect(s.device).toBe('cuda')
    expect(s.status).toBe('ready')
    expect(s.errorMessage).toBeNull()
    expect(s.downloadProgress).toBe(0)
  })

  it('设置 cpu 设备', () => {
    useModelStore.getState().setModel('depth-anything-v2-small', 'cpu')
    expect(useModelStore.getState().device).toBe('cpu')
  })
})

describe('modelStore — setVramUsage / setDownloadProgress', () => {
  it('setVramUsage 写入数值', () => {
    useModelStore.getState().setVramUsage(420)
    expect(useModelStore.getState().vramUsage).toBe(420)
  })

  it('setVramUsage 负数 → 0 (NaN 防御)', () => {
    useModelStore.getState().setVramUsage(-100)
    expect(useModelStore.getState().vramUsage).toBe(0)
  })

  it('setVramUsage NaN → 0', () => {
    useModelStore.getState().setVramUsage(NaN)
    expect(useModelStore.getState().vramUsage).toBe(0)
  })

  it('setVramUsage Infinity → 0 (无穷显存无意义)', () => {
    useModelStore.getState().setVramUsage(Infinity)
    expect(useModelStore.getState().vramUsage).toBe(0)
  })

  it('setDownloadProgress 写入数值', () => {
    useModelStore.getState().setDownloadProgress(50)
    expect(useModelStore.getState().downloadProgress).toBe(50)
  })

  it('setDownloadProgress 钳到 [0,100]', () => {
    useModelStore.getState().setDownloadProgress(-10)
    expect(useModelStore.getState().downloadProgress).toBe(0)
    useModelStore.getState().setDownloadProgress(150)
    expect(useModelStore.getState().downloadProgress).toBe(100)
  })

  it('setDownloadProgress NaN → 0 (fallback 到下界)', () => {
    useModelStore.getState().setDownloadProgress(50)
    useModelStore.getState().setDownloadProgress(NaN)
    expect(useModelStore.getState().downloadProgress).toBe(0)
  })

  it('setDownloadProgress ±Infinity → 0', () => {
    useModelStore.getState().setDownloadProgress(Infinity)
    expect(useModelStore.getState().downloadProgress).toBe(0)
    useModelStore.getState().setDownloadProgress(-Infinity)
    expect(useModelStore.getState().downloadProgress).toBe(0)
  })
})

describe('modelStore — setError', () => {
  it('清 currentModel + 写 errorMessage + status=error', () => {
    useModelStore.getState().setModel('foo', 'cuda')
    useModelStore.getState().setError('显存不足')

    const s = useModelStore.getState()
    expect(s.status).toBe('error')
    expect(s.errorMessage).toBe('显存不足')
    expect(s.currentModel).toBeNull()
    expect(s.downloadProgress).toBe(0)
    expect(s.vramUsage).toBe(0)
  })

  /**
   * **契约锁定 (有意行为, 不是 bug)**:
   *
   * setError 不会重置 device 字段. 语义上: "这次模型加载失败" 不代表
   * "推理设备消失了". 设备 (cpu/cuda) 是硬件状态, 由 health check 维护;
   * 一次模型加载失败 (例如显存不足) 后, 用户重试时仍然在同一设备上.
   *
   * 如果未来需要 reset device, 应该调 modelStore.reset() 而不是改 setError.
   */
  it('保留 device 字段 (设备硬件状态不因加载失败而消失)', () => {
    useModelStore.getState().setModel('depth-anything-v2-base', 'cuda')
    expect(useModelStore.getState().device).toBe('cuda')

    useModelStore.getState().setError('OOM')

    expect(useModelStore.getState().device).toBe('cuda') // 未变
  })

  it('保留 device=cpu 的情况同样不变', () => {
    useModelStore.getState().setModel('depth-anything-v2-small', 'cpu')
    useModelStore.getState().setError('磁盘满')
    expect(useModelStore.getState().device).toBe('cpu')
  })
})

describe('modelStore — reset', () => {
  it('完全回到初始状态', () => {
    useModelStore.getState().setModel('foo', 'cuda')
    useModelStore.getState().setVramUsage(900)
    useModelStore.getState().setDownloadProgress(80)
    useModelStore.getState().reset()

    const s = useModelStore.getState()
    expect(s.currentModel).toBeNull()
    expect(s.status).toBe('idle')
    expect(s.device).toBe('cpu')
    expect(s.vramUsage).toBe(0)
    expect(s.downloadProgress).toBe(0)
    expect(s.errorMessage).toBeNull()
  })
})
