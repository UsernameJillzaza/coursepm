import { Router, type Request, type Response } from 'express'
import { prisma } from '../db'
import { loadMilestoneForUser, loadTeamForUser } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { AppError, parseId, sendError } from '../http'
import { mergeHistory, validateCloseReason, validateExtension, validateMilestone, validateMilestoneEdit } from '../rules/milestone'
import { lockMilestone } from './lock'
import type { Milestone } from '../generated/prisma/client'

type Stats = { used: number; latest: Date | null; latestHasFeedback: boolean }
type ExtensionStats = { count: number; originalDeadline: Date | null }

// F-05: how many revisions each milestone has, and when the latest arrived.
// CHG-01: whether the latest revision has feedback (one query for all IDs).
async function submissionStats(milestoneIds: number[]): Promise<Map<number, Stats>> {
  if (milestoneIds.length === 0) return new Map()
  const [groups, latestRows] = await Promise.all([
    prisma.submission.groupBy({
      by: ['milestoneId'],
      where: { milestoneId: { in: milestoneIds } },
      _count: { _all: true },
      _max: { submittedAt: true },
    }),
    prisma.submission.findMany({
      where: { milestoneId: { in: milestoneIds } },
      orderBy: [{ milestoneId: 'asc' }, { revision: 'desc' }],
      distinct: ['milestoneId'],
      select: { milestoneId: true, feedback: { select: { id: true } } },
    }),
  ])
  const reviewed = new Map(latestRows.map((r) => [r.milestoneId, Boolean(r.feedback)]))
  return new Map(groups.map((g) => [g.milestoneId, {
    used: g._count._all, latest: g._max.submittedAt, latestHasFeedback: reviewed.get(g.milestoneId) ?? false,
  }]))
}

// F-08: one batched query over the listed milestones (NFR-08, no N+1). Each
// extension's previousDeadline is the deadline before it and every extension
// is later (BR-11, CHECK), so the smallest previousDeadline is the earliest
// extension's previousDeadline: the original deadline.
async function extensionStats(milestoneIds: number[]): Promise<Map<number, ExtensionStats>> {
  if (milestoneIds.length === 0) return new Map()
  const groups = await prisma.deadlineExtension.groupBy({
    by: ['milestoneId'],
    where: { milestoneId: { in: milestoneIds } },
    _count: { _all: true },
    _min: { previousDeadline: true },
  })
  return new Map(groups.map((g) => [g.milestoneId, { count: g._count._all, originalDeadline: g._min.previousDeadline }]))
}

// revisionsUsed / latestSubmittedAt come from the stored revisions (F-05);
// closedAt / originalDeadline / extended from F-08. status is CLOSED after an
// early close or once the (inclusive, D-05) deadline has passed.
// awaitingFeedback (CHG-01, F-04 v1.1) is computed here so the client never
// re-implements BR-07: true when a revision exists and the latest has none.
function toMilestoneDto(
  row: Milestone, now: Date,
  stats: Stats = { used: 0, latest: null, latestHasFeedback: false },
  ext: ExtensionStats = { count: 0, originalDeadline: null },
) {
  return {
    id: row.id,
    teamId: row.teamId,
    title: row.title,
    description: row.description,
    deadline: row.deadline,
    maxRevisions: row.maxRevisions,
    createdById: row.createdById,
    createdAt: row.createdAt,
    revisionsUsed: stats.used,
    status: row.closedAt === null && now.getTime() <= row.deadline.getTime() ? 'OPEN' : 'CLOSED',
    latestSubmittedAt: stats.latest,
    closedAt: row.closedAt,
    originalDeadline: ext.count > 0 && ext.originalDeadline ? ext.originalDeadline : row.deadline,
    extended: ext.count > 0,
    awaitingFeedback: stats.used >= 1 && !stats.latestHasFeedback,
  }
}

// One milestone's DTO with both batched stats (detail and every write action).
async function milestoneDto(row: Milestone, now = new Date()) {
  const [stats, ext] = await Promise.all([submissionStats([row.id]), extensionStats([row.id])])
  return toMilestoneDto(row, now, stats.get(row.id), ext.get(row.id))
}

async function scopedTeam(req: Request, res: Response) {
  const teamId = parseId(req.params.teamId)
  const team = teamId ? await loadTeamForUser(req.user!, teamId) : null
  if (!team) sendError(res, 404, 'NOT_FOUND', 'Team not found.')
  return team
}

// Mounted under /api/teams; requireAuth has already run in teamsRouter.
export async function listTeamMilestones(req: Request, res: Response) {
  const team = await scopedTeam(req, res)
  if (!team) return
  const rows = await prisma.milestone.findMany({ where: { teamId: team.id }, orderBy: [{ deadline: 'asc' }, { id: 'asc' }] })
  const now = new Date()
  const ids = rows.map((row) => row.id)
  const [stats, ext] = await Promise.all([submissionStats(ids), extensionStats(ids)])
  res.status(200).json({ items: rows.map((row) => toMilestoneDto(row, now, stats.get(row.id), ext.get(row.id))) })
}

export async function createTeamMilestone(req: Request, res: Response) {
  const team = await scopedTeam(req, res) // scope first: outsider → 404
  if (!team) return
  if (req.user!.role !== 'SUPERVISOR') return sendError(res, 403, 'FORBIDDEN', 'Only supervisors can create milestones.')

  const result = validateMilestone(req.body, new Date())
  if (!result.ok) return sendError(res, 400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', result.fields)

  const row = await prisma.milestone.create({
    data: { ...result.value, teamId: team.id, createdById: req.user!.id },
  })
  res.status(201).json({ milestone: toMilestoneDto(row, new Date()) })
}

const VALIDATION_MESSAGE = 'Please correct the highlighted fields.'
const STATE_MESSAGES = {
  MILESTONE_CLOSED: 'This milestone has been closed by the supervisor.',
  DEADLINE_PASSED: 'The deadline has passed; grant an extension instead.',
  MILESTONE_EXTENDED: 'This milestone has an extension; grant another extension instead.',
  MILESTONE_HAS_SUBMISSIONS: 'This milestone already has a submission; grant an extension instead.',
} as const
const stateError = (code: keyof typeof STATE_MESSAGES) => new AppError(409, code, STATE_MESSAGES[code])

// F-08 check order, steps 1–2: scope 404 → role 403.
async function scopedMilestone(req: Request, res: Response) {
  const milestoneId = parseId(req.params.milestoneId)
  const row = milestoneId ? await loadMilestoneForUser(req.user!, milestoneId) : null
  if (!row) sendError(res, 404, 'NOT_FOUND', 'Milestone not found.')
  return row
}
async function supervisorMilestone(req: Request, res: Response, forbidden: string) {
  const row = await scopedMilestone(req, res)
  if (!row) return null
  if (req.user!.role !== 'SUPERVISOR') {
    sendError(res, 403, 'FORBIDDEN', forbidden)
    return null
  }
  return row
}

const person = { select: { id: true, name: true } } as const

export const milestonesRouter = Router()
milestonesRouter.use(requireAuth)
milestonesRouter.get('/:milestoneId', async (req, res) => {
  const row = await scopedMilestone(req, res)
  if (!row) return
  res.status(200).json({ milestone: await milestoneDto(row), team: row.team })
})

// FR-12 edit: scope → role → shape 400 → lock → state 409 → NO_CHANGE 400 → write.
milestonesRouter.patch('/:milestoneId', async (req, res) => {
  const m = await supervisorMilestone(req, res, 'Only supervisors can edit milestones.')
  if (!m) return
  const shape = validateMilestoneEdit(req.body, new Date(), m)
  if (!shape.ok && 'fields' in shape) return sendError(res, 400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, shape.fields)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await lockMilestone(tx, m.id)
    const now = new Date()
    if (row.closedAt) throw stateError('MILESTONE_CLOSED')
    if (now.getTime() > row.deadline.getTime()) throw stateError('DEADLINE_PASSED')
    if (await tx.deadlineExtension.count({ where: { milestoneId: row.id } })) throw stateError('MILESTONE_EXTENDED')
    if (await tx.submission.count({ where: { milestoneId: row.id } })) throw stateError('MILESTONE_HAS_SUBMISSIONS')

    const result = validateMilestoneEdit(req.body, now, row)
    if (!result.ok) {
      if ('fields' in result) throw new AppError(400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, result.fields)
      throw new AppError(400, 'NO_CHANGE', 'Nothing to change.')
    }
    const { description, deadline } = result.changes
    const audit = [
      ...(description !== undefined ? [{ field: 'description', oldValue: row.description, newValue: description }] : []),
      ...(deadline !== undefined ? [{ field: 'deadline', oldValue: row.deadline.toISOString(), newValue: deadline.toISOString() }] : []),
    ]
    await tx.milestoneChange.createMany({
      data: audit.map((a) => ({ ...a, milestoneId: row.id, kind: 'EDIT' as const, changedById: req.user!.id, changedAt: now })),
    })
    return tx.milestone.update({ where: { id: row.id }, data: result.changes })
  })
  res.status(200).json({ milestone: await milestoneDto(updated) })
})

// FR-13 extension: scope → role → shape 400 → lock → closed 409 → BR-11 400 → write.
milestonesRouter.post('/:milestoneId/extensions', async (req, res) => {
  const m = await supervisorMilestone(req, res, 'Only supervisors can grant extensions.')
  if (!m) return
  const shape = validateExtension(req.body, new Date())
  if (!shape.ok) return sendError(res, 400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, shape.fields)
  const { newDeadline, reason } = shape.value

  const { extension, milestone } = await prisma.$transaction(async (tx) => {
    const row = await lockMilestone(tx, m.id)
    const now = new Date()
    if (row.closedAt) throw stateError('MILESTONE_CLOSED')
    // BR-11, compared with the locked row: a concurrent extension that won the
    // lock has already moved the deadline.
    if (newDeadline.getTime() <= row.deadline.getTime()) {
      throw new AppError(400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, { newDeadline: 'New deadline must be later than the current deadline.' })
    }
    const extension = await tx.deadlineExtension.create({
      data: { milestoneId: row.id, previousDeadline: row.deadline, newDeadline, reason, grantedById: req.user!.id, grantedAt: now },
      include: { grantedBy: person },
    })
    const milestone = await tx.milestone.update({ where: { id: row.id }, data: { deadline: newDeadline } })
    return { extension, milestone }
  })
  res.status(201).json({
    extension: {
      id: extension.id,
      milestoneId: extension.milestoneId,
      previousDeadline: extension.previousDeadline,
      newDeadline: extension.newDeadline,
      reason: extension.reason,
      grantedBy: extension.grantedBy,
      grantedAt: extension.grantedAt,
    },
    milestone: await milestoneDto(milestone),
  })
})

// FR-12 close early: scope → role → shape 400 → lock → closed 409 → write.
milestonesRouter.post('/:milestoneId/close', async (req, res) => {
  const m = await supervisorMilestone(req, res, 'Only supervisors can close milestones.')
  if (!m) return
  const shape = validateCloseReason(req.body)
  if (!shape.ok) return sendError(res, 400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, shape.fields)

  const closed = await prisma.$transaction(async (tx) => {
    const row = await lockMilestone(tx, m.id)
    const now = new Date()
    if (row.closedAt) throw stateError('MILESTONE_CLOSED')
    await tx.milestoneChange.create({
      data: { milestoneId: row.id, kind: 'CLOSE', reason: shape.reason, changedById: req.user!.id, changedAt: now },
    })
    return tx.milestone.update({ where: { id: row.id }, data: { closedAt: now, closedById: req.user!.id } })
  })
  res.status(200).json({ milestone: await milestoneDto(closed) })
})

// Everyone in scope (team students and assigned supervisors) reads the history.
milestonesRouter.get('/:milestoneId/history', async (req, res) => {
  const m = await scopedMilestone(req, res)
  if (!m) return
  const [changes, extensions] = await Promise.all([
    prisma.milestoneChange.findMany({ where: { milestoneId: m.id }, include: { changedBy: person } }),
    prisma.deadlineExtension.findMany({ where: { milestoneId: m.id }, include: { grantedBy: person } }),
  ])
  res.status(200).json({ items: mergeHistory(changes, extensions) })
})
