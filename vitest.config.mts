import { defineConfig } from 'vitest/config';
import os from 'os';

// High-performance configuration for Vitest
// Uses parallel execution, sharding, and optimized settings
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // Include patterns
    include: [
      'test/**/*.test.ts',
      'test/**/*.e2e.test.ts',
      'packages/**/__tests__/**/*.test.ts',
      'apps/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
    ],

    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],

    // ===================================================================
    // PERFORMANCE OPTIMIZATIONS
    // ===================================================================

    // Use threads pool (faster than forks for CPU-bound tasks)
    pool: 'threads',

    // Use all available CPU cores for maximum parallelism
    poolOptions: {
      threads: {
        // Use all CPU cores (default is cpus - 1)
        maxThreads: os.cpus().length,
        minThreads: Math.max(1, Math.floor(os.cpus().length / 2)),

        // Isolate tests in separate contexts for better parallelism
        isolate: true,

        // Use worker threads for better performance
        useAtomics: true,
      },
    },

    // Run tests in parallel within files
    fileParallelism: true,

    // Test timeout (increase for integration tests)
    testTimeout: 30000,
    hookTimeout: 30000,

    // ===================================================================
    // COVERAGE CONFIGURATION
    // ===================================================================

    coverage: {
      enabled: true,
      provider: 'v8', // v8 is faster than istanbul/c8
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',

      // Coverage thresholds (enforce quality)
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },

      // Include/exclude patterns for coverage
      include: [
        'packages/*/src/**/*.ts',
        'apps/*/src/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/node_modules/**',
        '**/dist/**',
        '**/*.config.*',
        '**/generated/**',
        '**/run-prediction/**', // Epic I1 - moved to @gwi/forecasting package
      ],

      // Report uncovered files
      all: true,

      // Clean coverage directory before each run
      clean: true,
    },

    // ===================================================================
    // REPORTERS
    // ===================================================================

    reporters: [
      'default',      // Standard console output
      'json',         // JSON output for CI/CD
    ],

    // Output directory for reports
    outputFile: {
      json: './test-results/results.json',
    },

    // ===================================================================
    // WATCH MODE (for development)
    // ===================================================================

    watch: false, // Disable by default (enable with --watch flag)

    // ===================================================================
    // MOCKING & STUBBING
    // ===================================================================

    mockReset: true,        // Reset mocks between tests
    restoreMocks: true,     // Restore original implementations
    clearMocks: true,       // Clear mock history

    // ===================================================================
    // SNAPSHOT TESTING
    // ===================================================================

    snapshotFormat: {
      printBasicPrototype: false,
      escapeString: false,
    },

    // ===================================================================
    // DEBUGGING
    // ===================================================================

    // Log level for debugging
    logHeapUsage: false,

    // Silent mode (reduce noise)
    silent: false,

    // ===================================================================
    // RETRY & BAIL
    // ===================================================================

    // Retry failed tests (useful for flaky tests)
    retry: 0, // Set to 1-3 for flaky test environments

    // Bail after N failures (stop early if many failures)
    bail: 0, // Set to 1-5 to stop after N failures

    // ===================================================================
    // SHARDING (for distributed test execution)
    // ===================================================================

    // Enable sharding via environment variables or CLI args
    // Example: vitest --shard=1/4 (run 1st quarter of tests)
    // Example: vitest --shard=2/4 (run 2nd quarter of tests)

    // ===================================================================
    // BENCHMARKING
    // ===================================================================

    benchmark: {
      include: ['**/*.bench.ts'],
      exclude: ['**/node_modules/**'],
    },
  },
});
