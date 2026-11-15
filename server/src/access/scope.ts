import { prisma } from '../db'
import type { Prisma } from '../generated/prisma/client'
import type { AuthUser } from '../auth/middleware'

// F-02 access scope (BR-02, BR-03, NFR-02). Every team-owned record is read
// through these helpers, so the "which teams may this user see" rule lives in
// one place. Students reach teams they belong to; supervisors reach teams
// they are assigned to. Anything else is treated as not found (D-03).
// Milestone and submission loaders follow the same rule as the team loader.
export function teamScopeWhere(user: AuthUser): Prisma.TeamWhereInput {
  return user.role === 'STUDENT'
    ? { members: { some: { userId: user.id } } }
    : { supervisors: { some: { userId: user.id } } }
}

const teamView = {
  id: true,
  name: true,
  courseCode: true,
  members: { select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } },
  supervisors: { select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } },
} satisfies Prisma.TeamSelect

type TeamRow = Prisma.TeamGetPayload<{ select: typeof teamView }>

// Public shape: people as { id, name } only (no e-mail, no hash).
export function toTeamDto(t: TeamRow) {
  return {
    id: t.id,
    name: t.name,
    courseCode: t.courseCode,
    members: t.members.map((m) => m.user),
    supervisors: t.supervisors.map((s) => s.user),
  }
}

export async function listTeamsForUser(user: AuthUser) {
  const rows = await prisma.team.findMany({ where: teamScopeWhere(user), select: teamView, orderBy: { name: 'asc' } })
  return rows.map(toTeamDto)
}

// Returns null when the team doesn't exist OR is out of scope; callers answer
// 404 in both cases, so an outsider can't tell them apart.
export async function loadTeamForUser(user: AuthUser, teamId: number) {
  const row = await prisma.team.findFirst({ where: { id: teamId, ...teamScopeWhere(user) }, select: teamView })
  return row ? toTeamDto(row) : null
}

// F-04: the milestone and its team are fetched in the same scoped query.
// A missing milestone and one owned by another team have the same result.
export async function loadMilestoneForUser(user: AuthUser, milestoneId: number) {
  return prisma.milestone.findFirst({
    where: { id: milestoneId, team: teamScopeWhere(user) },
    include: { team: { select: { id: true, name: true } } },
  })
}

// F-06: use the submission's database-constrained teamId for a scoped load.
// The submission's composite FK guarantees that teamId matches its milestone.
export async function loadSubmissionForUser(user: AuthUser, submissionId: number) {
  return prisma.submission.findFirst({
    where: { id: submissionId, team: teamScopeWhere(user) },
  })
}
