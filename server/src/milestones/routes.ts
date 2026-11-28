import { Router, type Request, type Response } from 'express'
import { prisma } from '../db'
import { loadMilestoneForUser, loadTeamForUser } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { parseId, sendError } from '../http'
import { validateMilestone } from '../rules/milestone'
import type { Milestone } from '../generated/prisma/client'

type Stats = { used: number; latest: Date | null; latestHasFeedback: boolean }

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

// revisionsUsed / latestSubmittedAt come from the stored revisions (F-05).
// awaitingFeedback (CHG-01, F-04 v1.1) is computed here so the client never
// re-implements BR-07: true when a revision exists and the latest has none.
function toMilestoneDto(row: Milestone, now: Date, stats: Stats = { used: 0, latest: null, latestHasFeedback: false }) {
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
    status: now.getTime() <= row.deadline.getTime() ? 'OPEN' : 'CLOSED',
    latestSubmittedAt: stats.latest,
    awaitingFeedback: stats.used >= 1 && !stats.latestHasFeedback,
  }
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
  const stats = await submissionStats(rows.map((row) => row.id))
  res.status(200).json({ items: rows.map((row) => toMilestoneDto(row, now, stats.get(row.id))) })
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

export const milestonesRouter = Router()
milestonesRouter.use(requireAuth)
milestonesRouter.get('/:milestoneId', async (req, res) => {
  const milestoneId = parseId(req.params.milestoneId)
  const row = milestoneId ? await loadMilestoneForUser(req.user!, milestoneId) : null
  if (!row) return sendError(res, 404, 'NOT_FOUND', 'Milestone not found.')
  const stats = await submissionStats([row.id])
  res.status(200).json({ milestone: toMilestoneDto(row, new Date(), stats.get(row.id)), team: row.team })
})
