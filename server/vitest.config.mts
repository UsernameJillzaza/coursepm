import 'dotenv/config'
import { defineConfig } from 'vitest/config'

// API tests run against a separate database (DATABASE_URL_TEST) so a test run
// never touches the development data. The app code reads DATABASE_URL, so it
// is pointed at the test database here; the original development URL is kept
// in COURSEPM_GUARD_DEV_URL, ALWAYS overwritten from DATABASE_URL (never taken
// from the shell), so global setup can refuse a test URL that resolves to the
// development database (AC-R01-2) before it migrates anything.
const devUrl = process.env.DATABASE_URL ?? ''
process.env.COURSEPM_GUARD_DEV_URL = devUrl

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    globalSetup: './tests/global-setup.ts',
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      COURSEPM_GUARD_DEV_URL: devUrl,
      NODE_ENV: 'test',
    },
    // Suites share one test database; run files one at a time.
    fileParallelism: false,
  },
})
