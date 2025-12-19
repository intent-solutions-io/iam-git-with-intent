import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'test/**/*.test.ts',
      'packages/**/__tests__/*.test.ts',
      'apps/**/__tests__/*.test.ts',
      'src/**/__tests__/*.test.ts', // For packages running vitest from their directory
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
