import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path para GitHub Pages: https://easy-ia.github.io/busca-ton/
  base: '/busca-ton/',
})

