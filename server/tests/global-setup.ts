import 'dotenv/config'
import { execSync } from 'node:child_process'

// Bring the test database up to the latest migration before any suite runs.
export default function setup() {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set (see .env.example).')
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } })
}
