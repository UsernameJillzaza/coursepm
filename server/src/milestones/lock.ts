import type { Prisma } from '../generated/prisma/client'

// F-08: every write that depends on a milestone's state (edit, extension,
// close, and a submission) first locks the milestone row inside its
// transaction, so they run one after another and each sees the state the
// previous one committed. Returns the row read after the lock.
export async function lockMilestone(tx: Prisma.TransactionClient, milestoneId: number) {
  await tx.$queryRaw`SELECT id FROM "Milestone" WHERE id = ${milestoneId} FOR UPDATE`
  return tx.milestone.findUniqueOrThrow({ where: { id: milestoneId } })
}
