import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      // AI 生成的项目工作区由后端管理，避免 Vite 监听导致整页刷新
      ignored: ['**/backend/workspaces/**', '**/backend/data/**'],
    },
    proxy: {
      // Java 业务服务：用户权限 / Agent / 模型 / 项目 / 费用审计，并代理 SSE 到 Python 引擎
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
