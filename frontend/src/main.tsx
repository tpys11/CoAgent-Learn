import React, { Component, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

/** 全局错误可见化：渲染崩溃/未捕获错误 → 显示错误文字而非白屏（调试用，稳定后可去掉） */
class Boundary extends Component<{ children: ReactNode }, { err: Error | null; info: string }> {
  state = { err: null as Error | null, info: '' }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error, info: any) {
    try { localStorage.setItem('coagent-last-error', (err && err.message ? err.message : String(err)) + ' || ' + (info?.componentStack || '')) } catch { }
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', color: '#b91c1c' }}>
          <p style={{ fontSize: 14, fontWeight: 700 }}>界面崩溃（错误已存 localStorage.coagent-last-error）</p>
          <p>{this.state.err.message}</p>
          <p style={{ color: '#666', marginTop: 8 }}>{this.state.info.slice(0, 1200)}</p>
        </div>
      )
    }
    return this.props.children
  }
}

window.addEventListener('error', e => {
  try {
    const msg = (e && e.message) || (e && e.error && e.error.message) || 'unknown error'
    localStorage.setItem('coagent-last-error', msg)
    console.error('[global-error]', e)
  } catch { }
})
window.addEventListener('unhandledrejection', e => {
  try {
    localStorage.setItem('coagent-last-error', 'unhandledrejection: ' + String((e && e.reason && e.reason.message) || e.reason))
  } catch { }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary><App /></Boundary>
  </React.StrictMode>,
)
