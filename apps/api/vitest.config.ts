import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
    // Mock environment variables for tests
    env: {
      NODE_ENV: 'test',
      GWI_STORE_BACKEND: 'memory',
    },
  },
});
