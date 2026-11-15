import { Router } from 'express'
import { loadSubmissionForUser } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { prisma } from '../db'
import { parseId, sendError } from '../http'
import { validateFeedback } from '../rules/feedback'
import { feedbackWithSupervisor, toFeedbackDto } from './dto'

export const feedbackRouter = Router()
feedbackRouter.use(requireAuth)

// F-06: scope → role → validation → unique insert. The database uniqueness
// handles both an ordinary second POST and simultaneous first POSTs.
feedbackRouter.post('/:submissionId/feedback', async (req, res) => {
  const submissionId = parseId(req.params.submissionId)
  const submission = submissionId ? await loadSubmissionForUser(req.user!, submissionId) : null
  if (!submission) return sendError(res, 404, 'NOT_FOUND', 'Submission not found.')
  if (req.user!.role !== 'SUPERVISOR') {
    return sendError(res, 403, 'FORBIDDEN', 'Only assigned supervisors can record feedback.')
  }

  const result = validateFeedback(req.body)
  if (!result.ok) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', result.fields)
  }

  try {
    const feedback = await prisma.feedback.create({
      data: { submissionId: submission.id, supervisorId: req.user!.id, body: result.value.body },
      include: feedbackWithSupervisor,
    })
    return res.status(201).json({ feedback: toFeedbackDto(feedback) })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return sendError(res, 409, 'FEEDBACK_EXISTS', 'This revision already has feedback.')
    }
    throw error
  }
})
