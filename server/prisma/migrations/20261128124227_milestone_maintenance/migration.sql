-- CreateEnum
CREATE TYPE "MilestoneChangeKind" AS ENUM ('EDIT', 'CLOSE');

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "closedById" INTEGER;

-- CreateTable
CREATE TABLE "MilestoneChange" (
    "id" SERIAL NOT NULL,
    "milestoneId" INTEGER NOT NULL,
    "kind" "MilestoneChangeKind" NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "changedById" INTEGER NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MilestoneChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlineExtension" (
    "id" SERIAL NOT NULL,
    "milestoneId" INTEGER NOT NULL,
    "previousDeadline" TIMESTAMPTZ(3) NOT NULL,
    "newDeadline" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedById" INTEGER NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeadlineExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilestoneChange_milestoneId_changedAt_idx" ON "MilestoneChange"("milestoneId", "changedAt");

-- CreateIndex
CREATE INDEX "DeadlineExtension_milestoneId_grantedAt_idx" ON "DeadlineExtension"("milestoneId", "grantedAt");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneChange" ADD CONSTRAINT "MilestoneChange_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneChange" ADD CONSTRAINT "MilestoneChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineExtension" ADD CONSTRAINT "DeadlineExtension_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineExtension" ADD CONSTRAINT "DeadlineExtension_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- F-08 data rules in the database, not only in code (contract "Data").
-- Closed early: closedAt and closedById are both null or both set.
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_closed_pair_check"
  CHECK (("closedAt" IS NULL) = ("closedById" IS NULL));

-- BR-11: an extension always moves the deadline later; reason 3-500 characters.
ALTER TABLE "DeadlineExtension" ADD CONSTRAINT "DeadlineExtension_later_check"
  CHECK ("newDeadline" > "previousDeadline");
ALTER TABLE "DeadlineExtension" ADD CONSTRAINT "DeadlineExtension_reason_check"
  CHECK (char_length("reason") BETWEEN 3 AND 500);

-- FR-12 audit rows: an EDIT names a known field with both values and no
-- reason; a CLOSE has no field or values. A reason is at most 500 characters.
ALTER TABLE "MilestoneChange" ADD CONSTRAINT "MilestoneChange_kind_check"
  CHECK (
    ("kind" = 'EDIT' AND "field" IN ('description', 'deadline') AND "oldValue" IS NOT NULL AND "newValue" IS NOT NULL AND "reason" IS NULL)
    OR ("kind" = 'CLOSE' AND "field" IS NULL AND "oldValue" IS NULL AND "newValue" IS NULL)
  );
ALTER TABLE "MilestoneChange" ADD CONSTRAINT "MilestoneChange_reason_check"
  CHECK ("reason" IS NULL OR char_length("reason") <= 500);
