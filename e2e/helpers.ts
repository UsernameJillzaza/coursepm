import fs from 'node:fs'
import path from 'node:path'

// The demo password is read from server/.env (SEED_PASSWORD), so it is never
// written in the repository.
export function seedPassword(): string {
  const env = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8')
  const match = env.match(/^SEED_PASSWORD=(.+)$/m)
  if (!match) throw new Error('SEED_PASSWORD missing from server/.env')
  return match[1].trim().replace(/^"|"$/g, '')
}
