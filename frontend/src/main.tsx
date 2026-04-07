import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// CSS 加载顺序很重要:
// 1. globals.css — 设计 token (:root vars) + 三档玻璃 + 基础 reset
// 2. atomics.css — 原子组件 (.depth-slider / .depth-glow-btn 等),
//    引用 globals 里的 token, 必须在 globals 之后加载
import './styles/globals.css'
import './styles/atomics.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
