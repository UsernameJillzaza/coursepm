import 'dotenv/config'
import { prisma } from '../src/db'
import { seed } from '../src/seed/demo'

// `npm run db:seed` entry point. The data and logic live in src/seed/demo.ts
// so the repeatability test (TEST-03-04) can call the same function.
const password = process.env.SEED_PASSWORD
if (!password) throw new Error('SEED_PASSWORD is not set (see server/.env.example).')

seed(password)
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
