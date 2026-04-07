/**
 * components/settings/ModelSelector.tsx — 模型三档选择器
 *
 * 视觉来源:
 *   - Stitch 生成 (projects/9861093748484174395/screens/3e0138cf29da4448bc04f2ef9597a500,
 *     title "DepthLens ModelSelector Showcase")
 *   - DESIGN.md §6.7 改造清单:
 *     ✓ 删除 Stitch 加的 SideNav/TopBar/BottomNav 装饰
 *     ✓ 只保留 .model-selector-group 核心部分
 *     ✓ 所有颜色 / 圆角 / 字号改成 CSS variable
 *     ✓ check_circle icon 换成 lucide-react
 *     ✓ 绑定 modelStore + useModelLoader hook
 *
 * 职责 (component 层 — 纯渲染 + 事件绑定):
 *   1. 显示 3 档模型 (Small/Base/Large) 作为 button segment
 *   2. 订阅 modelStore.currentModel 确定选中态
 *   3. 订阅 modelStore.status 分发状态行:
 *      - ready → ✓ 已就绪 · 设备 · 显存
 *      - loading / downloading → 进度条 + 百分比
 *      - error → errorMessage
 *      - idle → "未加载"
 *   4. 点击按钮 → useModelLoader.loadModel
 *
 * 与 backend/app/config.py MODEL_REGISTRY 保持一致. 未来可以升级成启动时
 * GET /api/models 缓存, Phase 1 硬编码足够.
 */
import { CheckCircle2 } from 'lucide-react'
import { useModelLoader } from '../../hooks/useModelLoader'
import { useModelStore } from '../../stores/modelStore'

// ── 模型元数据 (与 backend/app/config.py MODEL_REGISTRY 一致) ───────────────

interface ModelOption {
  id: string
  label: string
  size: string
}

const MODELS: readonly ModelOption[] = [
  { id: 'depth-anything-v2-small', label: 'Small', size: '120 MB' },
  { id: 'depth-anything-v2-base', label: 'Base', size: '340 MB' },
  { id: 'depth-anything-v2-large', label: 'Large', size: '1.3 GB' },
] as const

// ── 组件 ────────────────────────────────────────────────────────────────────

export function ModelSelector() {
  const currentModel = useModelStore((s) => s.currentModel)
  const status = useModelStore((s) => s.status)
  const device = useModelStore((s) => s.device)
  const vramUsage = useModelStore((s) => s.vramUsage)
  const downloadProgress = useModelStore((s) => s.downloadProgress)
  const errorMessage = useModelStore((s) => s.errorMessage)

  const { loadModel } = useModelLoader()

  // 加载中时禁用其他按钮 (只能点当前在载的那个, 且按钮显示 loading)
  const isBusy = status === 'loading' || status === 'downloading'

  return (
    <section className="flex flex-col">
      {/* 小节标题 */}
      <h3
        style={{
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-ui)',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: 0,
          marginBottom: 'var(--space-3)',
        }}
      >
        模型
      </h3>

      {/* 三档按钮 */}
      <div
        className="grid grid-cols-3"
        style={{
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {MODELS.map((m) => {
          const isSelected = m.id === currentModel
          const isLoadingThis = isBusy && m.id === currentModel
          const disabled = isBusy && !isLoadingThis

          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => void loadModel(m.id)}
              className="relative overflow-hidden flex flex-col items-center justify-center transition-all duration-200"
              style={{
                height: '56px',
                borderRadius: 'var(--radius-sm)',
                border: isSelected
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border)',
                background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                boxShadow: isSelected ? '0 0 20px var(--accent-glow)' : 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                fontFamily: 'var(--font-ui)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {m.label}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-tertiary)',
                }}
              >
                {m.size}
              </span>

              {/* loading 态: 底部 1px 进度条 */}
              {isLoadingThis && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    height: '1px',
                    width: `${status === 'downloading' ? downloadProgress : 60}%`,
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px var(--accent)',
                    transition: 'width 0.3s var(--ease-out)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 状态行 */}
      <StatusRow
        status={status}
        device={device}
        vramUsage={vramUsage}
        downloadProgress={downloadProgress}
        errorMessage={errorMessage}
      />
    </section>
  )
}

// ── 子: 状态行 ────────────────────────────────────────────────────────────

interface StatusRowProps {
  status: ReturnType<typeof useModelStore.getState>['status']
  device: ReturnType<typeof useModelStore.getState>['device']
  vramUsage: number
  downloadProgress: number
  errorMessage: string | null
}

function StatusRow({
  status,
  device,
  vramUsage,
  downloadProgress,
  errorMessage,
}: StatusRowProps) {
  // ready: 绿色 check + 已就绪 · 设备 · 显存
  if (status === 'ready') {
    const deviceLabel = device === 'cuda' ? 'CUDA' : 'CPU'
    const vramLabel = device === 'cuda' ? ` · ${vramUsage} MB` : ''
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2
          size={12}
          strokeWidth={2.5}
          style={{ color: 'var(--success)' }}
        />
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            letterSpacing: '0.02em',
          }}
        >
          已就绪 · {deviceLabel}
          {vramLabel}
        </span>
      </div>
    )
  }

  // loading / downloading: 进度条 + 百分比
  if (status === 'loading' || status === 'downloading') {
    const progress = status === 'downloading' ? downloadProgress : undefined
    const label = status === 'downloading'
      ? `下载中 · ${Math.round(progress ?? 0)}%`
      : '加载中...'
    return (
      <div className="flex items-center gap-3">
        <div
          style={{
            width: '48px',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: progress !== undefined ? `${progress}%` : '60%',
              background: 'var(--accent)',
              transition: 'width 0.3s var(--ease-out)',
            }}
          />
        </div>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent)',
            letterSpacing: '0.02em',
          }}
        >
          {label}
        </span>
      </div>
    )
  }

  // error: 红色消息
  if (status === 'error') {
    return (
      <span
        style={{
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--error)',
        }}
      >
        {errorMessage ?? '加载失败'}
      </span>
    )
  }

  // idle: 占位
  return (
    <span
      style={{
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-tertiary)',
      }}
    >
      未加载
    </span>
  )
}
