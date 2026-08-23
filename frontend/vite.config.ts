import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // 后端地址：Docker 容器内走内网名 guashuai-backend；本地 preview 用 VITE_PROXY_TARGET 覆盖为宿主机
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://guashuai-backend:8000'
  const wsTarget = proxyTarget.replace(/^http/, 'ws')
  return {
    // root 固定为 frontend 目录（无论从项目根还是 frontend 内启动 vite）
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      watch: {
        // Docker 挂载卷下文件事件不传播，必须轮询保证热更新
        usePolling: true,
        interval: 800,
      },
      proxy: {
        '/api': proxyTarget,
        '/uploads': proxyTarget,
        '/ws': {
          target: wsTarget,
          ws: true,
        },
      },
    },
  }
})
