import type { Prisma } from '../generated/prisma/client'

export const feedbackWithSupervisor = {
  supervisor: { select: { id: true, name: true } },
} as const satisfies Prisma.FeedbackInclude

type FeedbackRow = Prisma.FeedbackGetPayload<{ include: typeof feedbackWithSupervisor }>

// The public shape omits the internal supervisorId; ownership is supplied
// through the named supervisor only.
export function toFeedbackDto(row: FeedbackRow) {
  return {
    id: row.id,
    submissionId: row.submissionId,
    body: row.body,
    createdAt: row.createdAt,
    supervisor: row.supervisor,
  }
}
