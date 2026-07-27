import { defineConfig } from 'vitest/config';

const REPORTS_DIR = 'reports';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // fixture repos shell out to git; the default 5s trips on cold caches
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
      reportsDirectory: REPORTS_DIR,
      include: ['src/**/*.js'],
      // pure wiring around run.js; only reachable inside the Actions runtime
      exclude: ['src/index.js'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
    reporters: ['default', ['junit', { outputFile: `${REPORTS_DIR}/junit-vitest.xml` }]],
  },
});
