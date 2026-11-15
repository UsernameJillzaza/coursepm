import 'dotenv/config'
import { execSync } from 'node:child_process'
import { assertSeparateTestDatabase } from '../src/config/testDatabase'

type Exec = (command: string, options: { stdio: 'inherit'; env: NodeJS.ProcessEnv }) => unknown

// AC-R01-2: check the test database configuration FIRST, then bring only the
// test database up to the latest migration. runGlobalSetup takes the
// environment and the command runner as parameters so TEST-R01-02 can check
// it without touching a real database.
export function runGlobalSetup(env: NodeJS.ProcessEnv, exec: Exec) {
  // vitest.config always records the real development URL in
  // COURSEPM_GUARD_DEV_URL (overwriting any inherited value), because it may
  // already have pointed DATABASE_URL at the test database. Outside Vitest the
  // variable is absent and DATABASE_URL is the development URL. A
  // DATABASE_URL_DEV from the shell is never trusted.
  assertSeparateTestDatabase(env.COURSEPM_GUARD_DEV_URL ?? env.DATABASE_URL, env.DATABASE_URL_TEST)
  exec('npx prisma migrate deploy', { stdio: 'inherit', env: { ...env, DATABASE_URL: env.DATABASE_URL_TEST } })
}

export default function setup() {
  runGlobalSetup(process.env, execSync)
}
