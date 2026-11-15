import { defineConfig } from '@playwright/test'

// E2E journeys (STS E2E-01, E2E-02). Uses the installed Microsoft Edge
// (channel 'msedge'), so no browser download is needed. One worker: the
// journeys share the seeded development database.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5173', channel: 'msedge', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm --prefix server run dev', url: 'http://localhost:3000/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm --prefix client run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  ],
})
