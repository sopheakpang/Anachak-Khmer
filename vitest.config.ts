import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['packages/shared/src/**', 'apps/bridge/src/**'],
      exclude: ['**/*.test.ts', 'apps/bridge/src/index.ts'],
      thresholds: { 'packages/shared/src/**': { lines: 90, branches: 85 } },
    },
  },
});
