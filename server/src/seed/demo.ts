import { prisma } from '../db'
import { hashPassword } from '../auth/password'
import type { Role } from '../generated/prisma/client'

// SDS §2 synthetic demo data, in ONE idempotent seed module (F-01 contract).
// F-01 provides the demo accounts and the account helper; F-03 (Issue #5)
// adds the teams, memberships, assignments and the seed() entry point.
// Idempotent (AC-03-4): users are upserted by e-mail, teams by (courseCode,
// name), memberships and assignments by their composite keys.
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

// Team Alpha: Supervisor 1. Teams Beta and Gamma: Supervisor 2 (SDS §2).
export const DEMO_TEAMS = [
  { courseCode: 'CPE334-DEMO', name: 'Team Alpha', members: ['alpha1', 'alpha2'], supervisors: ['supervisor1'] },
  { courseCode: 'CPE334-DEMO', name: 'Team Beta', members: ['beta1', 'beta2'], supervisors: ['supervisor2'] },
  { courseCode: 'CPE334-DEMO', name: 'Team Gamma', members: ['gamma1', 'gamma2'], supervisors: ['supervisor2'] },
]

export async function seed(password: string) {
  const ids = new Map<string, number>()
  for (const u of DEMO_USERS) {
    const row = await upsertAccount(u, password)
    ids.set(u.email.split('@')[0], row.id)
  }

  for (const t of DEMO_TEAMS) {
    const team = await prisma.team.upsert({
      where: { courseCode_name: { courseCode: t.courseCode, name: t.name } },
      update: {},
      create: { courseCode: t.courseCode, name: t.name },
    })
    for (const key of t.members) {
      const userId = ids.get(key)!
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId } },
        update: {},
        create: { teamId: team.id, userId },
      })
    }
    for (const key of t.supervisors) {
      const userId = ids.get(key)!
      await prisma.supervisorAssignment.upsert({
        where: { teamId_userId: { teamId: team.id, userId } },
        update: {},
        create: { teamId: team.id, userId },
      })
    }
  }
  console.log(`Seeded ${DEMO_USERS.length} demo accounts and ${DEMO_TEAMS.length} teams.`)
}
