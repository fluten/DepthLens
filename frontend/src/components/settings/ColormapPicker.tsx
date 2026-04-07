/**
 * components/settings/ColormapPicker.tsx — 色彩映射卡片选择器
 *
 * 视觉来源:
 *   - Stitch 生成 (projects/9861093748484174395/screens/eae78357ce004ac4b01199236c2c0363,
 *     title "DepthLens ColormapPicker")
 *   - DESIGN.md §6.7 改造清单:
 *     ✓ 删除 Stitch 加的 SideNav/TopNav/FAB 装饰
 *     ✓ 只保留 7 张 card 的主体列表
 *     ✓ gradient 定义挪到组件内 const 而非 :root CSS 变量 (避免污染全局)
 *     ✓ check_circle 替换为 lucide-react CheckCircle2
 *     ✓ 所有颜色 / 圆角 / 字号改 CSS variable
 *     ✓ 绑定 viewportStore.colormap + setColormap
 *
 * 职责 (component 层 — 纯渲染 + 事件):
 *   - 显示 7 张 colormap card (与 lib/constants.COLORMAP_IDS 一一对应)
 *   - 订阅 viewportStore.colormap 确定选中态
 *   - 点击 card → setColormap
 *
 * **为什么 gradient 硬编码**:
 *   lib/colormaps.ts 生成的是 Uint8Array LUT (256×4 RGBA), 不是 CSS gradient.
 *   要从 LUT 生成 CSS gradient 需要额外的 lut→hex conversion 函数, 且在 UI
 *   预览这种低精度场景下 6-7 个 stop 已足够. 硬编码的颜色值直接取自 anchor
 *   stop 表 (lib/colormaps.ts COLORMAP_STOPS), 来源相同, 视觉一致.
 */
import { CheckCircle2 } from 'lucide-react'
import { COLORMAP_IDS, type ColormapId } from '../../lib/constants'
import { useViewportStore } from '../../stores/viewportStore'

// ── 色带预览 gradient (与 lib/colormaps.ts COLORMAP_STOPS 视觉同源) ─────────

const COLORMAP_GRADIENTS: Record<ColormapId, string> = {
  inferno:
    'linear-gradient(to right, #000004, #420a68, #ae305c, #f1605d, #febd2a, #fcfdbf)',
  plasma:
    'linear-gradient(to right, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)',
  magma:
    'linear-gradient(to right, #000004, #3b0f70, #8c2981, #de4968, #fe9f6d, #fcfdbf)',
  turbo:
    'linear-gradient(to right, #30123b, #28bbec, #a2fc3c, #fb8022, #7a0403)',
  viridis:
    'linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)',
  bone: 'linear-gradient(to right, #000000, #4c4c4c, #999999, #ffffff)',
  cividis: 'linear-gradient(to right, #00224e, #5a5d6d, #949591, #fdea45)',
}

// 首字母大写显示名
const COLORMAP_LABELS: Record<ColormapId, string> = {
  inferno: 'Inferno',
  plasma: 'Plasma',
  magma: 'Magma',
  turbo: 'Turbo',
  viridis: 'Viridis',
  bone: 'Bone',
  cividis: 'Cividis',
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export function ColormapPicker() {
  const colormap = useViewportStore((s) => s.colormap)
  const setColormap = useViewportStore((s) => s.setColormap)

  return (
    <section className="flex flex-col">
      {/* 小节标题 */}
      <label
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 'var(--space-3)',
        }}
      >
        色彩映射
      </label>

      {/* 7 张卡片垂直堆叠 */}
      <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        {COLORMAP_IDS.map((id) => {
          const isSelected = id === colormap
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setColormap(id)}
              className="w-full flex items-center transition-all duration-150"
              style={{
                height: '44px',
                borderRadius: 'var(--radius-sm)',
                border: isSelected
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border)',
                background: isSelected ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
                boxShadow: isSelected ? '0 0 24px rgba(59, 130, 246, 0.2)' : 'none',
                padding: '0 var(--space-4)',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--border-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--border)'
                }
              }}
            >
              {/* 左侧: 渐变色带 120 × 16 */}
              <div
                aria-hidden="true"
                style={{
                  width: '120px',
                  height: '16px',
                  borderRadius: '3px',
                  background: COLORMAP_GRADIENTS[id],
                  flexShrink: 0,
                }}
              />

              {/* 中: 名称 */}
              <span
                style={{
                  marginLeft: 'var(--space-4)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: isSelected
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                }}
              >
                {COLORMAP_LABELS[id]}
              </span>

              <div style={{ flexGrow: 1 }} />

              {/* 右: 选中标记 */}
              {isSelected && (
                <CheckCircle2
                  size={14}
                  strokeWidth={2.5}
                  style={{ color: 'var(--accent)' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
