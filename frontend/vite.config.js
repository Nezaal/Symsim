import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Integration tests need a running local Supabase: `npm run test:integration`.
    exclude: [...configDefaults.exclude, '**/*.integration.test.js'],
  },
})
