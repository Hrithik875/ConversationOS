/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      // Exclude large ONNX runtime WASM files (from @huggingface/transformers)
      // from the Workbox precache manifest. These files are 20+ MB and should
      // be served via normal HTTP browser caching, not SW precaching.
      workbox: {
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024, // 25 MB limit
        globIgnores: ['**/*.wasm'],
      },
      manifest: {
        name: 'ConversationOS',
        short_name: 'ConversationOS',
        description: 'Privacy-first, offline-first conversation archive platform.',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
