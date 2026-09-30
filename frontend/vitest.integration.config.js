import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Runs only *.integration.test.js, against the local Supabase from .env.local.
// Standalone (not merged with vite.config.js): merging would concatenate the
// base config's exclude list, which excludes these very files.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.integration.test.js'],
    testTimeout: 30_000,
  },
})
