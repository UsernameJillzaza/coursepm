import { Router, type NextFunction, type Request, type Response } from 'express'
import { prisma } from '../db'
import { teamView, toTeamDto } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { parseId, sendError, type FieldErrors } from '../http'
import { checkAssignable, checkDeactivatable, validateTeamInput } from '../rules/admin'
import type { Role } from '../generated/prisma/client'

// F-09 Course administration API (FR-14, BR-01). These routes target no
// team-owned record, so they use a role guard first (F-09 check order):
// 401 → 403 ADMIN only → path ID 404 → body 400 → state 409 → write.
// Answering 403 before 404 leaks no team work. Team-owned routes keep the
// Sprint 1 order (scope 404 first); for an ADMIN, teamScopeWhere matches no team.
export const adminRouter = Router()
adminRouter.use(requireAuth)
adminRouter.use(requireAdmin)

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user!.role !== 'ADMIN') return sendError(res, 403, 'FORBIDDEN', 'Only a course administrator can do this.')
  next()
}

const VALIDATION_MESSAGE = 'Please correct the highlighted fields.'
const ROLES: Role[] = ['STUDENT', 'SUPERVISOR', 'ADMIN']
const ROLE_RANK: Record<Role, number> = { ADMIN: 0, SUPERVISOR: 1, STUDENT: 2 }

const adminUserSelect = { id: true, name: true, email: true, role: true, isActive: true } as const
type AdminUser = { id: number; name: string; email: string; role: Role; isActive: boolean }

// Documented order: role (ADMIN, SUPERVISOR, STUDENT), then name, then id.
// Sorted here, not by the database, so the order never depends on the enum's
// declaration order or the database collation.
function byRoleNameId(a: AdminUser, b: AdminUser) {
  if (ROLE_RANK[a.role] !== ROLE_RANK[b.role]) return ROLE_RANK[a.role] - ROLE_RANK[b.role]
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.id - b.id
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002'
}

// A body userId is a JSON integer or a canonical decimal string, with the
// same range as path IDs (parseId). Anything else is "Choose an account.".
function parseBodyId(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? parseId(String(value)) : null
  return parseId(value)
}

async function loadAdminTeam(teamId: number) {
  const row = await prisma.team.findUnique({ where: { id: teamId }, select: teamView })
  return row ? toTeamDto(row) : null
}

// GET /api/admin/users?role=&active= (AC-09-10). Never a password or hash (NFR-03).
adminRouter.get('/users', async (req, res) => {
  const { role, active } = req.query
  const fields: FieldErrors = {}
  if (role !== undefined && !(typeof role === 'string' && (ROLES as string[]).includes(role))) {
    fields.role = 'Role must be STUDENT, SUPERVISOR or ADMIN.'
  }
  if (active !== undefined && active !== 'true' && active !== 'false') fields.active = 'Active must be true or false.'
  if (Object.keys(fields).length) return sendError(res, 400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, fields)

  const rows = await prisma.user.findMany({
    where: { ...(role ? { role: role as Role } : {}), ...(active ? { isActive: active === 'true' } : {}) },
    select: adminUserSelect,
  })
  res.status(200).json({ items: rows.sort(byRoleNameId) })
})

// GET /api/admin/teams: every team with members and supervisors, by course code then name.
adminRouter.get('/teams', async (_req, res) => {
  const rows = await prisma.team.findMany({ select: teamView, orderBy: [{ courseCode: 'asc' }, { name: 'asc' }] })
  res.status(200).json({ items: rows.map(toTeamDto) })
})

// POST /api/admin/teams (AC-09-3, AC-09-4). The (courseCode, name) unique key
// turns a duplicate, including two racing creates, into 409 TEAM_EXISTS.
adminRouter.post('/teams', async (req, res) => {
  const result = validateTeamInput(req.body)
  if (!result.ok) return sendError(res, 400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, result.fields)
  try {
    const row = await prisma.team.create({ data: result.value, select: teamView })
    res.status(201).json({ team: toTeamDto(row) })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    sendError(res, 409, 'TEAM_EXISTS', 'A team with this course code and name already exists.')
  }
})

// POST /api/admin/teams/:teamId/members and …/supervisors (AC-09-5, AC-09-6).
// The composite primary key turns a repeat (or a race) into 409 ALREADY_ASSIGNED.
function assignRoute(kind: 'members' | 'supervisors', wanted: 'STUDENT' | 'SUPERVISOR') {
  return async (req: Request, res: Response) => {
    const teamId = parseId(req.params.teamId)
    const exists = teamId ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }) : null
    if (!teamId || !exists) return sendError(res, 404, 'NOT_FOUND', 'Team not found.')

    const userId = parseBodyId((req.body ?? {}).userId)
    if (!userId) return sendError(res, 400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, { userId: 'Choose an account.' })

    // The check and the insert run in one transaction that locks the user row
    // (SELECT … FOR UPDATE), the row a deactivation updates. A deactivation in
    // progress therefore finishes first and this check sees the account as
    // inactive, so an inactive account is never stored (PR #82 review).
    let outcome: { ok: true } | { ok: false; message: string } | 'ALREADY_ASSIGNED'
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ role: Role; isActive: boolean }[]>`
          SELECT "role", "isActive" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
        const check = checkAssignable(rows[0] ?? null, wanted)
        if (!check.ok) return check
        if (kind === 'members') await tx.teamMember.create({ data: { teamId, userId } })
        else await tx.supervisorAssignment.create({ data: { teamId, userId } })
        return check
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      outcome = 'ALREADY_ASSIGNED'
    }
    if (outcome === 'ALREADY_ASSIGNED') return sendError(res, 409, 'ALREADY_ASSIGNED', 'This account is already in this team.')
    if (!outcome.ok) return sendError(res, 400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, { userId: outcome.message })
    res.status(201).json({ team: await loadAdminTeam(teamId) })
  }
}
adminRouter.post('/teams/:teamId/members', assignRoute('members', 'STUDENT'))
adminRouter.post('/teams/:teamId/supervisors', assignRoute('supervisors', 'SUPERVISOR'))

// POST /api/admin/users/:userId/deactivate (AC-09-7, AC-09-8, NFR-04). One
// transaction sets isActive = false and deletes every session of the user, so
// an existing cookie gets 401 on its next request. Past work is kept.
adminRouter.post('/users/:userId/deactivate', async (req, res) => {
  const userId = parseId(req.params.userId)
  const target = userId ? await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect }) : null
  if (!userId || !target) return sendError(res, 404, 'NOT_FOUND', 'Account not found.')

  const check = checkDeactivatable(target, req.user!)
  if (!check.ok) {
    const message = check.code === 'CANNOT_DEACTIVATE_ADMIN'
      ? 'Administrator accounts cannot be deactivated here.'
      : 'This account is already inactive.'
    return sendError(res, 409, check.code, message)
  }

  // The conditional update makes a concurrent second deactivation an
  // ALREADY_INACTIVE instead of a second write.
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId, isActive: true, role: { not: 'ADMIN' } }, data: { isActive: false } })
    if (count === 1) await tx.session.deleteMany({ where: { userId } })
    return count === 1
  })
  if (!updated) return sendError(res, 409, 'ALREADY_INACTIVE', 'This account is already inactive.')
  res.status(200).json({ user: { ...target, isActive: false } })
})
