import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:6001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm build && NODE_ENV=production STORAGE_DRIVER=local LOCAL_STORAGE_ROOT=test-results/e2e-data pnpm --filter server start',
    url: 'http://127.0.0.1:6001/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
