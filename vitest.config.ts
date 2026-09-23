import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'tests/**/*.test.ts'],
    // Threads, not forks: forks spawn one node process per core and outlive a dead
    // parent; threads share the process and die with it. Same fix as brain #97.
    pool: 'threads',
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 } },
    teardownTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/__tests__/*', 'v0/'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
