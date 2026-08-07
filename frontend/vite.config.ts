import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      // Docker 挂载卷下文件事件不传播，必须轮询保证热更新
      usePolling: true,
      interval: 800,
    },
    proxy: {
      '/api': 'http://guashuai-backend:8000',
      '/ws': {
        target: 'ws://guashuai-backend:8000',
        ws: true,
      },
    },
  },
})
