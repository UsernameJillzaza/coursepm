import { prisma } from '../db'
import { hashPassword } from '../auth/password'
import type { Role } from '../generated/prisma/client'

// SDS §2 synthetic demo data, in ONE idempotent seed module (F-01 contract).
// F-01 provides the demo accounts and the account helper; F-03 (Issue #5)
// adds the teams, memberships, assignments and the seed() entry point.
// No password is ever written in the repository; callers pass SEED_PASSWORD
// (or, in tests, a known local password).
export const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: 'supervisor1@coursepm.test', name: 'Dr. Supervisor One', role: 'SUPERVISOR' },
  { email: 'supervisor2@coursepm.test', name: 'Dr. Supervisor Two', role: 'SUPERVISOR' },
  { email: 'alpha1@coursepm.test', name: 'Alpha Student 1', role: 'STUDENT' },
  { email: 'alpha2@coursepm.test', name: 'Alpha Student 2', role: 'STUDENT' },
  { email: 'beta1@coursepm.test', name: 'Beta Student 1', role: 'STUDENT' },
  { email: 'beta2@coursepm.test', name: 'Beta Student 2', role: 'STUDENT' },
  { email: 'gamma1@coursepm.test', name: 'Gamma Student 1', role: 'STUDENT' },
  { email: 'gamma2@coursepm.test', name: 'Gamma Student 2', role: 'STUDENT' },
]

export type AccountInput = { email: string; name: string; role: Role; isActive?: boolean }

// The shared account helper: create or update one account by e-mail with a
// freshly hashed password. Used by the seed and by the API tests, so tests
// set up accounts exactly the way the demo data does.
export async function upsertAccount(account: AccountInput, password: string) {
  const email = account.email.trim().toLowerCase()
  const passwordHash = await hashPassword(password)
  const data = { name: account.name, role: account.role, isActive: account.isActive ?? true, passwordHash }
  return prisma.user.upsert({ where: { email }, update: data, create: { email, ...data } })
}

export function demoUser(key: string) {
  const u = DEMO_USERS.find((d) => d.email.startsWith(`${key}@`))
  if (!u) throw new Error(`Unknown demo user "${key}"`)
  return u
}
