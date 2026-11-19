import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

// One shared Prisma client. Prisma 7 needs an explicit driver adapter.
// Tests point DATABASE_URL at the separate test database (vitest.config.mts).
// Cloud SQL's small instance has a limited connection budget. Keep the local
// default from pg; the Cloud Run job and service set DB_POOL_MAX explicitly.
const poolMax = process.env.DB_POOL_MAX === undefined ? undefined : Number(process.env.DB_POOL_MAX)
if (poolMax !== undefined && (!Number.isInteger(poolMax) || poolMax < 1)) {
  throw new Error('DB_POOL_MAX must be a positive integer')
}
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ...(poolMax === undefined ? {} : { max: poolMax }),
})
export const prisma = new PrismaClient({ adapter })
