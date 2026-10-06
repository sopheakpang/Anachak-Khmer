import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: { viewport: { width: 1080, height: 1920 }, baseURL: 'http://localhost:5173' },
  webServer: [
    {
      command: 'npm run build -w @temples/game && npm run preview -w @temples/game',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Test bridge with an in-memory world, so tests never touch data/temples.db.
      command: 'npm run start -w @temples/bridge',
      url: 'http://localhost:7420/health',
      env: { TEMPLES_DB: ':memory:' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run build -w @temples/host && npm run preview -w @temples/host',
      url: 'http://localhost:7421',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
