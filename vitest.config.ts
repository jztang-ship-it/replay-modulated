import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['api/_lib/**/__tests__/**/*.test.ts', 'api/__tests__/**/*.test.{js,ts}', 'shared/**/__tests__/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
})
