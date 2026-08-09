import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react() as PluginOption],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
} as any);
