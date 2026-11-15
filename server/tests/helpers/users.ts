import { randomBytes } from 'node:crypto'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { demoUser, upsertAccount } from '../../src/seed/demo'
import type { Role } from '../../src/generated/prisma/client'

// Accounts are created with the seed's own helper (F-01 contract), in
// DATABASE_URL_TEST only. Random @test.local users are deleted afterwards;
// demo accounts (A1, Supervisor 1, …) are upserted, so re-running is safe.
export const TEST_PASSWORD = 'Test-pass-123'
// The demo accounts use SEED_PASSWORD when it is set locally, otherwise a
// known test password, so the suite also runs on a machine without one.
export const DEMO_PASSWORD = process.env.SEED_PASSWORD || TEST_PASSWORD
const created: number[] = []

export type TestUser = { id: number; name: string; email: string; role: Role; password: string }

export async function createUser(role: Role = 'STUDENT', opts: { isActive?: boolean } = {}): Promise<TestUser> {
  const tag = randomBytes(5).toString('hex')
  const user = await upsertAccount(
    { email: `t-${tag}@test.local`, name: `Test ${role} ${tag}`, role, isActive: opts.isActive },
    TEST_PASSWORD,
  )
  created.push(user.id)
  return { id: user.id, name: user.name, email: user.email, role, password: TEST_PASSWORD }
}

// A demo account such as "alpha1" (Student A1) or "supervisor1".
export async function demoAccount(key: string): Promise<TestUser> {
  const user = await upsertAccount(demoUser(key), DEMO_PASSWORD)
  return { id: user.id, name: user.name, email: user.email, role: user.role, password: DEMO_PASSWORD }
}

// A Supertest agent keeps cookies between requests, like a browser.
export async function loginAgent(user: TestUser) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: user.password })
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`)
  return agent
}

export async function cleanupUsers() {
  const ids = created.splice(0)
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } }) // sessions cascade
}

export function sessionCookie(setCookie: string[] | string | undefined): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  return list.find((c) => c.startsWith('cpm_session='))
}
