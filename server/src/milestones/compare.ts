import { Router } from 'express'
import { prisma } from '../db'
import { loadMilestoneForUser } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { parseId, sendError } from '../http'
import { compareRevisions, parseRevisionPair } from '../rules/revisionDiff'
import { submittedBy, toSubmissionDto } from '../submissions/routes'
import { feedbackWithSupervisor, toFeedbackDto } from '../feedback/dto'

// F-07 GET /api/milestones/:milestoneId/compare?a=&b= (FR-11). Read-only.
// Check order: scope 404 (loadMilestoneForUser) → query 400 → both revisions
// exist in THIS milestone 404 → 200. A revision number that exists only in
// another milestone or team is "not found" here (D-03). No role check: every
// role that can read the milestone may compare its revisions.
export const compareRouter = Router({ mergeParams: true })
compareRouter.use(requireAuth)

compareRouter.get('/', async (req, res) => {
  const id = parseId((req.params as { milestoneId?: string }).milestoneId)
  const milestone = id ? await loadMilestoneForUser(req.user!, id) : null
  if (!milestone) return sendError(res, 404, 'NOT_FOUND', 'Milestone not found.')

  const pair = parseRevisionPair(req.query)
  if (!pair.ok) return sendError(res, 400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', pair.fields)

  const rows = await prisma.submission.findMany({
    where: { milestoneId: milestone.id, revision: { in: [pair.older, pair.newer] } },
    include: { ...submittedBy, feedback: { include: feedbackWithSupervisor } },
  })
  const pick = (revision: number) => rows.find((r) => r.revision === revision)
  const older = pick(pair.older)
  const newer = pick(pair.newer)
  if (!older || !newer) return sendError(res, 404, 'NOT_FOUND', 'Revision not found.')

  // The same item shape as the F-05 list (AC-07-1).
  const item = (r: NonNullable<typeof older>) => ({ ...toSubmissionDto(r), feedback: r.feedback ? toFeedbackDto(r.feedback) : null })
  res.status(200).json({
    comparison: { milestoneId: milestone.id, older: item(older), newer: item(newer), changes: compareRevisions(older, newer) },
  })
})
