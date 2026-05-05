import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // Force all react imports (including from ../shared) to resolve from the
  // root node_modules — mirrors the vite.config.ts dedupe used by the SPAs,
  // and keeps a single React copy so hooks work in tsx component tests.
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['api/_lib/**/__tests__/**/*.test.ts', 'api/__tests__/**/*.test.{js,ts}', 'shared/**/__tests__/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'node',
  },
})
