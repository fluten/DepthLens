/**
 * stores/connectionStore.ts — 后端连接状态
 *
 * 与 SPEC §8 ConnectionStore interface 严格对齐.
 *
 * 由 hooks/useConnection 维护:
 * - 启动后轮询 /api/health (HEALTH_POLL_INTERVAL_MS)
 * - 200 → setStatus('connected') + setLatency(ms)
 * - 失败/超时 → setStatus('disconnected')
 * - 手动重试中 → setStatus('reconnecting')
 *
 * UI 反应:
 * - 'connected': 不显示任何 UI (沉浸式)
 * - 'disconnected': overlay/ConnectionBar 显示红脉冲点 + "后端离线"
 * - 'reconnecting': overlay/ConnectionBar 显示旋转图标 + "重连中..."
 */
import { create } from 'zustand'

// ── 类型 ────────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

export interface ConnectionStoreState {
  status: ConnectionStatus
  /** 上一次成功 ping 的延迟 (ms), 0 表示尚未成功过 */
  latencyMs: number
}

export interface ConnectionStoreActions {
  setStatus: (status: ConnectionStatus) => void
  /** 设置延迟. 自动钳到 ≥ 0 (防御负数) */
  setLatency: (ms: number) => void
  reset: () => void
}

export type ConnectionStore = ConnectionStoreState & ConnectionStoreActions

// ── 初始状态 ───────────────────────────────────────────────────────────────

/**
 * 初始 status='disconnected' 而非 'connected':
 * 应用启动时还没 ping 过, 假设未连. 第一次 health check 成功后切到 'connected'.
 * 这样避免"启动瞬间显示已连接, 紧接着发现没连而闪烁"的体验问题.
 */
export const CONNECTION_STORE_INITIAL: ConnectionStoreState = {
  status: 'disconnected',
  latencyMs: 0,
}

// ── store ──────────────────────────────────────────────────────────────────

export const useConnectionStore = create<ConnectionStore>((set) => ({
  ...CONNECTION_STORE_INITIAL,

  setStatus: (status) => set({ status }),

  // NaN/-Inf/负数 → 0; +Inf 也 → 0 (无穷延迟无意义, 用 0 占位)
  setLatency: (ms) =>
    set({
      latencyMs: !Number.isFinite(ms) || ms < 0 ? 0 : ms,
    }),

  reset: () => set({ ...CONNECTION_STORE_INITIAL }),
}))
