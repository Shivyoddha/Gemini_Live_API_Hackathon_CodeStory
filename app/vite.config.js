import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: set by VITE_BASE_PATH in GitHub Actions for Pages (e.g. /repo-name/ for project sites)
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
