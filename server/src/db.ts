import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

// One shared Prisma client. Prisma 7 needs an explicit driver adapter.
// Tests point DATABASE_URL at the separate test database (vitest.config.mts).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })
