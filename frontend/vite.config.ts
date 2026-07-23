import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://guashuai-backend:8000',
      '/ws': {
        target: 'ws://guashuai-backend:8000',
        ws: true,
      },
    },
  },
})
