import 'dotenv/config'
import { defineConfig } from 'vitest/config'

// API tests run against a separate database (DATABASE_URL_TEST) so a test run
// never touches the development data. globalSetup migrates it first.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    globalSetup: './tests/global-setup.ts',
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      NODE_ENV: 'test',
    },
    // Suites share one test database; run files one at a time.
    fileParallelism: false,
  },
})
