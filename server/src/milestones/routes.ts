import { Router, type Request, type Response } from 'express'
import { prisma } from '../db'
import { loadMilestoneForUser, loadTeamForUser } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { parseId, sendError } from '../http'
import { validateMilestone } from '../rules/milestone'
import type { Milestone } from '../generated/prisma/client'

// F-05 adds the submission relation and replaces these initial zero/null
// values with an aggregate from stored revisions.
function toMilestoneDto(row: Milestone, now: Date) {
  return {
    id: row.id,
    teamId: row.teamId,
    title: row.title,
    description: row.description,
    deadline: row.deadline,
    maxRevisions: row.maxRevisions,
    createdById: row.createdById,
    createdAt: row.createdAt,
    revisionsUsed: 0,
    status: now.getTime() <= row.deadline.getTime() ? 'OPEN' : 'CLOSED',
    latestSubmittedAt: null,
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
  res.status(200).json({ items: rows.map((row) => toMilestoneDto(row, now)) })
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
  res.status(200).json({ milestone: toMilestoneDto(row, new Date()), team: row.team })
})
