import { Router } from 'express'
import { listTeamsForUser, loadTeamForUser } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { parseId, sendError } from '../http'
import { createTeamMilestone, listTeamMilestones } from '../milestones/routes'
import { getTeamBoard } from './board'

// F-03 API (FR-03). Every route needs a session (NFR-01) and reads through
// the F-02 scope helpers.
export const teamsRouter = Router()
teamsRouter.use(requireAuth)

// GET /api/teams: the caller's own teams (Student) or assigned teams (Supervisor).
teamsRouter.get('/', async (req, res) => {
  res.status(200).json({ items: await listTeamsForUser(req.user!) })
})

// GET /api/teams/:teamId: 404 when missing or out of scope (AC-03-2, AC-03-3).
teamsRouter.get('/:teamId', async (req, res) => {
  const teamId = parseId(req.params.teamId)
  const team = teamId ? await loadTeamForUser(req.user!, teamId) : null
  if (!team) return sendError(res, 404, 'NOT_FOUND', 'Team not found.')
  res.status(200).json({ team })
})

teamsRouter.get('/:teamId/milestones', listTeamMilestones)
teamsRouter.post('/:teamId/milestones', createTeamMilestone)
teamsRouter.get('/:teamId/board', getTeamBoard) // F-10
