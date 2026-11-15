import { randomBytes } from 'node:crypto'
import { prisma } from '../../src/db'
import type { TestUser } from './users'

// Each test file builds its own teams with a random course code and deletes
// them afterwards (memberships cascade).
const created: number[] = []

export async function createTeam(name: string, people: { members?: TestUser[]; supervisors?: TestUser[] } = {}) {
  const team = await prisma.team.create({
    data: {
      name,
      courseCode: `T-${randomBytes(4).toString('hex')}`,
      members: { create: (people.members ?? []).map((u) => ({ userId: u.id })) },
      supervisors: { create: (people.supervisors ?? []).map((u) => ({ userId: u.id })) },
    },
  })
  created.push(team.id)
  return team
}

export async function cleanupTeams() {
  const ids = created.splice(0)
  if (ids.length) await prisma.team.deleteMany({ where: { id: { in: ids } } })
}
