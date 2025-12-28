import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/*.test.ts'],
    // Exclude integration tests until mock server is properly configured
    exclude: ['src/**/__tests__/integration/**'],
    passWithNoTests: true,
  },
});
