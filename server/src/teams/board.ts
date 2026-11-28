import type { Request, Response } from 'express'
import { prisma } from '../db'
import { loadTeamForUser } from '../access/scope'
import { parseId, sendError } from '../http'
import { extensionFields, extensionStats } from '../milestones/routes'
import { BOARD_STATES, deriveMilestoneState, parseBoardStateQuery, type BoardState } from '../rules/board'

// F-10 GET /api/teams/:teamId/board (FR-15). Read-only, any user in scope.
// Check order: session 401 (teamsRouter) → scope 404 → query 400. A fixed
// number of batched queries (milestones, then revision counts, latest revision
// with its submitter and feedback, extensions), so the cost does not grow
// with an N+1 per milestone (NFR-08). `now` is taken once per request.
export async function getTeamBoard(req: Request, res: Response) {
  const teamId = parseId(req.params.teamId)
  const team = teamId ? await loadTeamForUser(req.user!, teamId) : null
  if (!team) return sendError(res, 404, 'NOT_FOUND', 'Team not found.')

  const query = parseBoardStateQuery(req.query.state)
  if (!query.ok) return sendError(res, 400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', query.fields)

  const rows = await prisma.milestone.findMany({
    where: { teamId: team.id },
    orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, deadline: true, closedAt: true, maxRevisions: true },
  })
  const ids = rows.map((r) => r.id)
  const now = new Date()
  const [counts, latestRows, ext] = await Promise.all([
    ids.length
      ? prisma.submission.groupBy({ by: ['milestoneId'], where: { milestoneId: { in: ids } }, _count: { _all: true } })
      : Promise.resolve([]),
    ids.length
      ? prisma.submission.findMany({
          where: { milestoneId: { in: ids } },
          orderBy: [{ milestoneId: 'asc' }, { revision: 'desc' }],
          distinct: ['milestoneId'],
          select: {
            milestoneId: true, revision: true, submittedAt: true,
            submittedBy: { select: { id: true, name: true } },
            feedback: { select: { id: true } },
          },
        })
      : Promise.resolve([]),
    extensionStats(ids),
  ])
  const used = new Map(counts.map((c) => [c.milestoneId, c._count._all]))
  const latestBy = new Map(latestRows.map((l) => [l.milestoneId, l]))

  const tally = Object.fromEntries(BOARD_STATES.map((s) => [s, 0])) as Record<BoardState, number>
  const items = rows.map((m) => {
    const l = latestBy.get(m.id)
    const latest = l ? { revision: l.revision, submittedAt: l.submittedAt, submittedBy: l.submittedBy, hasFeedback: Boolean(l.feedback) } : null
    const state = deriveMilestoneState({ closedAt: m.closedAt, deadline: m.deadline, latest, now })
    tally[state] += 1
    return {
      milestoneId: m.id,
      title: m.title,
      deadline: m.deadline,
      ...extensionFields(m.deadline, ext.get(m.id)),
      closedAt: m.closedAt,
      state,
      revisionsUsed: used.get(m.id) ?? 0,
      maxRevisions: m.maxRevisions,
      latest,
    }
  })

  res.set('Cache-Control', 'no-store')
  res.status(200).json({
    team: { id: team.id, name: team.name },
    generatedAt: now,
    counts: tally,
    items: query.state ? items.filter((i) => i.state === query.state) : items,
  })
}
