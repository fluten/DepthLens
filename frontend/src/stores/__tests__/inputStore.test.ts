/**
 * inputStore.test.ts — 输入源 store 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { INPUT_STORE_INITIAL, useInputStore } from '../inputStore'

beforeEach(() => {
  useInputStore.setState(INPUT_STORE_INITIAL)
})

describe('inputStore — 初始状态', () => {
  it('字段默认值与 SPEC §8 一致', () => {
    const s = useInputStore.getState()
    expect(s.mode).toBe('image')
    expect(s.cameraDeviceId).toBeNull()
    expect(s.isStreaming).toBe(false)
    expect(s.videoFile).toBeNull()
    expect(s.videoProgress).toBe(0)
    expect(s.videoStatus).toBe('idle')
  })
})

describe('inputStore — setMode', () => {
  it.each(['image', 'video', 'camera', '3d'] as const)('可设置为 "%s"', (m) => {
    useInputStore.getState().setMode(m)
    expect(useInputStore.getState().mode).toBe(m)
  })

  it('切换模式不影响其他字段', () => {
    useInputStore.getState().setStreaming(true)
    useInputStore.getState().setMode('camera')
    // 切到 camera 模式时, isStreaming 不会被自动改 — 那是 hook 的责任
    expect(useInputStore.getState().isStreaming).toBe(true)
  })
})

describe('inputStore — setCameraDeviceId', () => {
  it('写入 ID', () => {
    useInputStore.getState().setCameraDeviceId('cam-0')
    expect(useInputStore.getState().cameraDeviceId).toBe('cam-0')
  })

  it('写入 null (摄像头断开)', () => {
    useInputStore.getState().setCameraDeviceId('cam-0')
    useInputStore.getState().setCameraDeviceId(null)
    expect(useInputStore.getState().cameraDeviceId).toBeNull()
  })
})

describe('inputStore — setStreaming', () => {
  it('true / false 切换', () => {
    useInputStore.getState().setStreaming(true)
    expect(useInputStore.getState().isStreaming).toBe(true)
    useInputStore.getState().setStreaming(false)
    expect(useInputStore.getState().isStreaming).toBe(false)
  })
})

describe('inputStore — setVideoFile', () => {
  it('写入 File', () => {
    const f = new File([new Uint8Array(8)], 'clip.mp4', { type: 'video/mp4' })
    useInputStore.getState().setVideoFile(f)
    expect(useInputStore.getState().videoFile).toBe(f)
  })

  it('写入 null (取消上传)', () => {
    const f = new File([new Uint8Array(8)], 'clip.mp4', { type: 'video/mp4' })
    useInputStore.getState().setVideoFile(f)
    useInputStore.getState().setVideoFile(null)
    expect(useInputStore.getState().videoFile).toBeNull()
  })
})

describe('inputStore — setVideoProgress', () => {
  it('正常值', () => {
    useInputStore.getState().setVideoProgress(45)
    expect(useInputStore.getState().videoProgress).toBe(45)
  })

  it('< 0 → 0', () => {
    useInputStore.getState().setVideoProgress(-10)
    expect(useInputStore.getState().videoProgress).toBe(0)
  })

  it('> 100 → 100', () => {
    useInputStore.getState().setVideoProgress(150)
    expect(useInputStore.getState().videoProgress).toBe(100)
  })

  it('NaN → 0 (fallback)', () => {
    useInputStore.getState().setVideoProgress(50)
    useInputStore.getState().setVideoProgress(NaN)
    expect(useInputStore.getState().videoProgress).toBe(0)
  })

  it('Infinity → 0 (非有限值)', () => {
    useInputStore.getState().setVideoProgress(Infinity)
    expect(useInputStore.getState().videoProgress).toBe(0)
    useInputStore.getState().setVideoProgress(-Infinity)
    expect(useInputStore.getState().videoProgress).toBe(0)
  })
})

describe('inputStore — setVideoStatus', () => {
  it.each(['idle', 'processing', 'paused', 'done'] as const)(
    '可设置为 "%s"',
    (status) => {
      useInputStore.getState().setVideoStatus(status)
      expect(useInputStore.getState().videoStatus).toBe(status)
    }
  )
})

describe('inputStore — reset', () => {
  it('完全回到初始', () => {
    const f = new File([new Uint8Array(8)], 'clip.mp4', { type: 'video/mp4' })
    useInputStore.getState().setMode('camera')
    useInputStore.getState().setCameraDeviceId('cam-0')
    useInputStore.getState().setStreaming(true)
    useInputStore.getState().setVideoFile(f)
    useInputStore.getState().setVideoProgress(50)
    useInputStore.getState().setVideoStatus('processing')
    useInputStore.getState().reset()

    const s = useInputStore.getState()
    expect(s.mode).toBe('image')
    expect(s.cameraDeviceId).toBeNull()
    expect(s.isStreaming).toBe(false)
    expect(s.videoFile).toBeNull()
    expect(s.videoProgress).toBe(0)
    expect(s.videoStatus).toBe('idle')
  })
})
