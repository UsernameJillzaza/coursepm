import { Router } from 'express'
import { prisma } from '../db'
import { loadMilestoneForUser } from '../access/scope'
import { requireAuth } from '../auth/middleware'
import { AppError, parseId, sendError } from '../http'
import { checkCanSubmit, validateSubmission, type SubmissionInput } from '../rules/submission'
import { feedbackWithSupervisor, toFeedbackDto } from '../feedback/dto'
import { lockMilestone } from '../milestones/lock'

// F-05 submission API (FR-06 … FR-08, BR-06 … BR-08, NFR-05).
// Mounted at /api/milestones/:milestoneId/submissions.
export const submissionsRouter = Router({ mergeParams: true })
submissionsRouter.use(requireAuth)

const RULE_MESSAGES = {
  MILESTONE_CLOSED: 'This milestone has been closed by the supervisor.',
  DEADLINE_PASSED: 'The deadline for this milestone has passed.',
  REVISION_LIMIT_REACHED: 'Your team has used all revisions for this milestone.',
} as const

const submittedBy = { submittedBy: { select: { id: true, name: true } } } as const

type SubmissionRow = {
  id: number
  revision: number
  title: string
  description: string
  link: string
  submittedAt: Date
  submittedBy: { id: number; name: string }
}

// The F-05 contract's submission shape. The list also includes feedback from
// the revision's own one-to-one relation (F-06).
function toSubmissionDto(s: SubmissionRow) {
  return {
    id: s.id,
    revision: s.revision,
    title: s.title,
    description: s.description,
    link: s.link,
    submittedAt: s.submittedAt,
    submittedBy: s.submittedBy,
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002'
}

// One attempt: lock the milestone row first (F-08: the same lock as edit,
// extension and close, so they cannot interleave with a submission), read the
// current state, apply the rules with the SERVER clock, insert revision =
// nextRevision. If another request stored the same revision first,
// UNIQUE(milestoneId, revision) makes this insert fail (NFR-05); the retry is
// a new transaction and takes the lock again.
async function trySubmit(milestoneId: number, teamId: number, userId: number, value: SubmissionInput) {
  return prisma.$transaction(async (tx) => {
    const m = await lockMilestone(tx, milestoneId)
    const revisionsUsed = await tx.submission.count({ where: { milestoneId } })
    const now = new Date()
    const check = checkCanSubmit({ deadline: m.deadline, maxRevisions: m.maxRevisions, revisionsUsed, now, closedAt: m.closedAt })
    if (!check.ok) throw new AppError(409, check.code, RULE_MESSAGES[check.code])
    return tx.submission.create({
      data: { ...value, milestoneId, teamId, revision: check.nextRevision, submittedById: userId, submittedAt: now },
      include: submittedBy,
    })
  })
}

const MAX_ATTEMPTS = 3

// POST: team student only. Order: scope (404) → role (403) → fields (400) →
// rules (409). A lost race retries the whole transaction, so both rules are
// checked again against the new state (the limit can't be overshot).
submissionsRouter.post('/', async (req, res) => {
  const id = parseId((req.params as { milestoneId?: string }).milestoneId)
  const m = id ? await loadMilestoneForUser(req.user!, id) : null
  if (!m) return sendError(res, 404, 'NOT_FOUND', 'Milestone not found.')
  if (req.user!.role !== 'STUDENT') return sendError(res, 403, 'FORBIDDEN', 'Only a student of this team can submit work.')

  const result = validateSubmission((req.body ?? {}) as Record<string, unknown>)
  if (!result.ok) return sendError(res, 400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', result.fields)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const created = await trySubmit(m.id, m.teamId, req.user!.id, result.value)
      return res.status(201).json({ submission: toSubmissionDto(created) })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
    }
  }
  return sendError(res, 409, 'CONFLICT', 'Another submission was saved at the same moment. Please try again.')
})

// GET: newest revision first (AC-05-7), in the milestone's scope.
submissionsRouter.get('/', async (req, res) => {
  const id = parseId((req.params as { milestoneId?: string }).milestoneId)
  const m = id ? await loadMilestoneForUser(req.user!, id) : null
  if (!m) return sendError(res, 404, 'NOT_FOUND', 'Milestone not found.')
  const rows = await prisma.submission.findMany({
    where: { milestoneId: m.id },
    include: { ...submittedBy, feedback: { include: feedbackWithSupervisor } },
    orderBy: { revision: 'desc' },
  })
  res.status(200).json({
    items: rows.map((s) => ({ ...toSubmissionDto(s), feedback: s.feedback ? toFeedbackDto(s.feedback) : null })),
  })
})
