/**
 * components/viewport/ScanlineLoader.tsx — 推理扫描线动效
 *
 * DESIGN.md §6.4 明确列为"手写"组件: 就几行 CSS, 不值得调 Stitch.
 * 样式来源: DESIGN.md §3.5 原封照抄, 不加不减:
 *
 *   position: absolute; left: 0; right: 0;
 *   height: 2px;
 *   background: var(--accent);
 *   box-shadow: 0 0 12px var(--accent-glow), 0 0 40px var(--accent-glow);
 *   animation: scanline 2s var(--ease-in-out) infinite;
 *
 * ``@keyframes scanline`` 已经在 globals.css line 256 定义 (top: 0 → 100%).
 * 本组件只是把那条规则套在一个 div 上, 并用外层包一个 pointer-events: none
 * 的 absolute 容器, 避免扫描线拦截 drop/click 等事件.
 *
 * 设计:
 * - 无 props — 这是纯视觉效果, 父组件 (Viewport) 用条件渲染控制显示/隐藏
 * - pointer-events: none — 扫描线是装饰层, 用户依然能对下层深度图操作
 * - role="progressbar" aria-busy — 屏幕阅读器知道正在"加载中"
 * - inline style 引用 CSS variable 而不是硬编码颜色 — 与 "严禁硬编码" 约束一致
 */

// ── 组件 ────────────────────────────────────────────────────────────────────

/**
 * 推理中的扫描线. 父容器必须 position: relative (Viewport 自带).
 *
 * @example
 *   <div className="relative w-full h-full">
 *     <DepthCanvas2D ... />
 *     {isProcessing && <ScanlineLoader />}
 *   </div>
 */
export function ScanlineLoader() {
  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-label="正在推理深度"
      // absolute + inset 0 覆盖整个父容器, overflow hidden 避免扫描线
      // 在 top:100% 的一瞬间超出父 viewport 边界.
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        // z-index 与 DESIGN.md §9 保持: 在 depth canvas (z-0) 之上, HUD (z-20)
        // 之下, 所以给 z-5 的语义区间.
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '2px',
          background: 'var(--accent)',
          boxShadow:
            '0 0 12px var(--accent-glow), 0 0 40px var(--accent-glow)',
          // @keyframes scanline 定义在 globals.css: top 0% → 100%
          animation: 'scanline 2s var(--ease-in-out) infinite',
        }}
      />
    </div>
  )
}
