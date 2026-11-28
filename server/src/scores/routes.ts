import { Router, type Request, type Response } from 'express'
import { prisma } from '../db'
import { loadMilestoneForUser } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { AppError, parseId, sendError } from '../http'
import { lockMilestone } from '../milestones/lock'
import { checkScoreChange, scoreViewFor, validateScoreInput } from '../rules/score'
import type { Prisma } from '../generated/prisma/client'

// F-11 API (FR-16, BR-12, D-10), mounted at /api/milestones/:milestoneId/score.
// Check order: scope 404 → role 403 (writes) → shape 400 → lock the milestone
// row → state 409 (release) → relative 400 (against the locked row) → write.
// The score is served only here; no other DTO carries it, so an unreleased
// value cannot leak (AC-11-2). Every response is no-store.
export const scoresRouter = Router({ mergeParams: true })
scoresRouter.use(requireAuth)
scoresRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

const VALIDATION_MESSAGE = 'Please correct the highlighted fields.'
const person = { select: { id: true, name: true } } as const
const scoreView = {
  releasedBy: person,
  changes: { include: { changedBy: person } },
} as const satisfies Prisma.MilestoneScoreInclude

async function scopedMilestone(req: Request, res: Response) {
  const id = parseId((req.params as { milestoneId?: string }).milestoneId)
  const m = id ? await loadMilestoneForUser(req.user!, id) : null
  if (!m) sendError(res, 404, 'NOT_FOUND', 'Milestone not found.')
  return m
}

// Writes: the scope already limits a supervisor to an assigned one (as F-06).
async function supervisorMilestone(req: Request, res: Response) {
  const m = await scopedMilestone(req, res)
  if (!m) return null
  if (req.user!.role !== 'SUPERVISOR') {
    sendError(res, 403, 'FORBIDDEN', 'Only an assigned supervisor can score this milestone.')
    return null
  }
  return m
}

async function supervisorView(milestoneId: number) {
  const row = await prisma.milestoneScore.findUnique({ where: { milestoneId }, include: scoreView })
  return scoreViewFor('SUPERVISOR', row)
}

// GET: full view for the supervisor; null until release for the team (D-10).
scoresRouter.get('/', async (req, res) => {
  const m = await scopedMilestone(req, res)
  if (!m) return
  const row = await prisma.milestoneScore.findUnique({ where: { milestoneId: m.id }, include: scoreView })
  res.status(200).json({ score: scoreViewFor(req.user!.role, row) })
})

// PUT: set or change. The reason rule is applied after the lock, so a change
// racing a release is judged against the release (AC-11-8 b).
scoresRouter.put('/', async (req, res) => {
  const m = await supervisorMilestone(req, res)
  if (!m) return
  const shape = validateScoreInput(req.body)
  if (!shape.ok) return sendError(res, 400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, shape.fields)
  const { score, reason } = shape.value

  await prisma.$transaction(async (tx) => {
    await lockMilestone(tx, m.id)
    const now = new Date()
    const stored = await tx.milestoneScore.findUnique({ where: { milestoneId: m.id } })
    const check = checkScoreChange(stored, shape.value)
    if (!check.ok) {
      if ('fields' in check) throw new AppError(400, 'VALIDATION_ERROR', VALIDATION_MESSAGE, check.fields)
      throw new AppError(400, 'NO_CHANGE', 'The score already has this value.')
    }
    const row = stored
      ? await tx.milestoneScore.update({ where: { id: stored.id }, data: { score, updatedAt: now } })
      : await tx.milestoneScore.create({ data: { milestoneId: m.id, score, createdAt: now, updatedAt: now } })
    await tx.scoreChange.create({
      data: {
        milestoneScoreId: row.id, kind: 'SET', oldScore: stored?.score ?? null, newScore: score, reason,
        // Honest flag for the BR-12 CHECK: set exactly when the locked score is released.
        afterRelease: Boolean(stored?.releasedAt), changedById: req.user!.id, changedAt: now,
      },
    })
  })
  res.status(200).json({ score: await supervisorView(m.id) })
})

// POST release: once a score exists and is not released yet; no un-release.
scoresRouter.post('/release', async (req, res) => {
  const m = await supervisorMilestone(req, res)
  if (!m) return
  await prisma.$transaction(async (tx) => {
    await lockMilestone(tx, m.id)
    const now = new Date()
    const stored = await tx.milestoneScore.findUnique({ where: { milestoneId: m.id } })
    if (!stored) throw new AppError(409, 'NO_SCORE', 'Set a score before releasing it.')
    if (stored.releasedAt) throw new AppError(409, 'ALREADY_RELEASED', 'This score has already been released.')
    await tx.milestoneScore.update({ where: { id: stored.id }, data: { releasedAt: now, releasedById: req.user!.id, updatedAt: now } })
    await tx.scoreChange.create({ data: { milestoneScoreId: stored.id, kind: 'RELEASE', changedById: req.user!.id, changedAt: now } })
  })
  res.status(200).json({ score: await supervisorView(m.id) })
})
