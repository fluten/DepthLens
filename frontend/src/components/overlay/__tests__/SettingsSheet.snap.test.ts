/**
 * SettingsSheet.snap.test.ts — 三吸附点切换纯函数单测
 *
 * 测试范围:
 * - computeNextSnap 在"强 fling / 中等位移 / 小位移"三档输入下的分支
 * - 覆盖所有 3 × 3 = 9 个起始状态 × 手势组合
 * - 纯函数测试, 不 mount 组件, 不依赖 Framer Motion
 */
import { describe, it, expect } from 'vitest'
import { computeNextSnap, type SheetSnap } from '../SettingsSheet'

// ── 小位移 (应该 snap 回原位) ───────────────────────────────────────────────

describe('computeNextSnap — 小位移 snap back', () => {
  const snaps: SheetSnap[] = ['full', 'half', 'closed']
  for (const current of snaps) {
    it(`${current}: 小位移 (|offset|=50, |velocity|=100) 不切换`, () => {
      expect(computeNextSnap(current, 50, 100)).toBe(current)
      expect(computeNextSnap(current, -50, -100)).toBe(current)
      expect(computeNextSnap(current, 0, 0)).toBe(current)
    })
  }
})

// ── 中等位移 (|offset| > 120) ─────────────────────────────────────────────

describe('computeNextSnap — 中等向下拖 (offset > 120)', () => {
  it('full → half', () => {
    expect(computeNextSnap('full', 150, 0)).toBe('half')
  })
  it('half → closed', () => {
    expect(computeNextSnap('half', 150, 0)).toBe('closed')
  })
  it('closed → closed (already at bottom)', () => {
    expect(computeNextSnap('closed', 150, 0)).toBe('closed')
  })
})

describe('computeNextSnap — 中等向上拖 (offset < -120)', () => {
  it('closed → half', () => {
    expect(computeNextSnap('closed', -150, 0)).toBe('half')
  })
  it('half → full', () => {
    expect(computeNextSnap('half', -150, 0)).toBe('full')
  })
  it('full → full (already at top)', () => {
    expect(computeNextSnap('full', -150, 0)).toBe('full')
  })
})

// ── 强 fling (|velocity| > 800) ────────────────────────────────────────────

describe('computeNextSnap — 向下 fling (velocity > 800)', () => {
  it('full → half (即使位移很小)', () => {
    expect(computeNextSnap('full', 10, 1000)).toBe('half')
  })
  it('half → closed', () => {
    expect(computeNextSnap('half', 10, 1000)).toBe('closed')
  })
  it('closed → closed', () => {
    expect(computeNextSnap('closed', 10, 1000)).toBe('closed')
  })
})

describe('computeNextSnap — 向上 fling (velocity < -800)', () => {
  it('closed → half (即使位移很小)', () => {
    expect(computeNextSnap('closed', -10, -1000)).toBe('half')
  })
  it('half → full', () => {
    expect(computeNextSnap('half', -10, -1000)).toBe('full')
  })
  it('full → full', () => {
    expect(computeNextSnap('full', -10, -1000)).toBe('full')
  })
})

// ── 边界 ────────────────────────────────────────────────────────────────────

describe('computeNextSnap — 边界值', () => {
  it('offset 恰好 120 (边界内, 不切换)', () => {
    expect(computeNextSnap('half', 120, 0)).toBe('half')
  })
  it('offset 刚好超过 120 (切换)', () => {
    expect(computeNextSnap('half', 121, 0)).toBe('closed')
  })
  it('velocity 恰好 800 (边界内)', () => {
    expect(computeNextSnap('half', 0, 800)).toBe('half')
  })
  it('velocity 刚好超过 800', () => {
    expect(computeNextSnap('half', 0, 801)).toBe('closed')
  })
  it('fling 优先于位移 — 向上 fling 但向下位移', () => {
    // velocity 主导: 向上 fling 虽然 offset 显示略向下, 用户意图明确
    expect(computeNextSnap('closed', 30, -1000)).toBe('half')
  })
})
