import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['api/_lib/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
