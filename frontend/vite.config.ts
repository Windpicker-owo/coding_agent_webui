import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      // API 请求代理到 Python 后端 HTTP 服务器
      '/api': {
        target: 'http://127.0.0.1:8681',
        changeOrigin: true,
      },
      // WebSocket 代理到 Python 后端 Coding Agent
      '/coding-agent': {
        target: 'ws://127.0.0.1:8766',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
