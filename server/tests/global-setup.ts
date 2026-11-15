import 'dotenv/config'
import { execSync } from 'node:child_process'

type Exec = (command: string, options: { stdio: 'inherit'; env: NodeJS.ProcessEnv }) => unknown

// Bring the test database up to the latest migration before any suite runs.
// runGlobalSetup takes the environment and the command runner as parameters
// so TEST-R01-02 can check what happens without touching a real database.
export function runGlobalSetup(env: NodeJS.ProcessEnv, exec: Exec) {
  const url = env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set (see .env.example).')
  exec('npx prisma migrate deploy', { stdio: 'inherit', env: { ...env, DATABASE_URL: url } })
}

export default function setup() {
  runGlobalSetup(process.env, execSync)
}
