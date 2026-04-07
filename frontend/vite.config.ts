import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * DepthLens Vite 配置
 *
 * - 前端 dev server: localhost:5173
 * - 后端 FastAPI:    localhost:8000
 * - /api/* 全部代理到后端 (HTTP + WebSocket)
 *
 * 后端配置见 backend/app/config.py — HOST=127.0.0.1, PORT=8000
 */
export default defineConfig({
  plugins: [react()],

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // 端口被占用时直接报错而不是漂移
    proxy: {
      // REST: GET /api/health, POST /api/depth/image, ...
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // WebSocket: WS /api/depth/stream — 必须开启 ws 代理
        ws: true,
      },
    },
  },

  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
