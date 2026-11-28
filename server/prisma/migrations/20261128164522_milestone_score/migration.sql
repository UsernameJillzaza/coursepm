-- F-11 (FR-16, BR-12, D-10): milestone score and its history. Additive only:
-- two new tables and one new enum; the tagged Lab 6 revision never reads them.
-- CreateEnum
CREATE TYPE "ScoreChangeKind" AS ENUM ('SET', 'RELEASE');

-- CreateTable
CREATE TABLE "MilestoneScore" (
    "id" SERIAL NOT NULL,
    "milestoneId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "releasedAt" TIMESTAMPTZ(3),
    "releasedById" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MilestoneScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreChange" (
    "id" SERIAL NOT NULL,
    "milestoneScoreId" INTEGER NOT NULL,
    "kind" "ScoreChangeKind" NOT NULL,
    "oldScore" INTEGER,
    "newScore" INTEGER,
    "reason" TEXT,
    "afterRelease" BOOLEAN NOT NULL DEFAULT false,
    "changedById" INTEGER NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScoreChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneScore_milestoneId_key" ON "MilestoneScore"("milestoneId");

-- CreateIndex
CREATE INDEX "ScoreChange_milestoneScoreId_changedAt_idx" ON "ScoreChange"("milestoneScoreId", "changedAt");

-- AddForeignKey
ALTER TABLE "MilestoneScore" ADD CONSTRAINT "MilestoneScore_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneScore" ADD CONSTRAINT "MilestoneScore_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreChange" ADD CONSTRAINT "ScoreChange_milestoneScoreId_fkey" FOREIGN KEY ("milestoneScoreId") REFERENCES "MilestoneScore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreChange" ADD CONSTRAINT "ScoreChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- F-11 data rules in the database, not only in code (contract "Data").
-- One score per milestone is the UNIQUE index above.
ALTER TABLE "MilestoneScore" ADD CONSTRAINT "MilestoneScore_score_check"
  CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "MilestoneScore" ADD CONSTRAINT "MilestoneScore_release_pair_check"
  CHECK (("releasedAt" IS NULL) = ("releasedById" IS NULL));

-- A SET carries the new value (and the old one, unless it is the first); a
-- RELEASE carries no values and no reason. "IS NOT NULL" is written out so a
-- NULL can never make the CHECK NULL (and so pass), as F-08 learned.
ALTER TABLE "ScoreChange" ADD CONSTRAINT "ScoreChange_kind_check"
  CHECK (
    ("kind" = 'SET' AND "newScore" IS NOT NULL AND "newScore" BETWEEN 0 AND 100
      AND ("oldScore" IS NULL OR "oldScore" BETWEEN 0 AND 100))
    OR ("kind" = 'RELEASE' AND "oldScore" IS NULL AND "newScore" IS NULL AND "reason" IS NULL)
  );
ALTER TABLE "ScoreChange" ADD CONSTRAINT "ScoreChange_reason_check"
  CHECK ("reason" IS NULL OR char_length("reason") <= 500);

-- BR-12 in the database: a change written while the score was released is a
-- SET with a reason of 3-500 characters, whatever the code does.
ALTER TABLE "ScoreChange" ADD CONSTRAINT "ScoreChange_after_release_check"
  CHECK (
    NOT "afterRelease"
    OR ("kind" = 'SET' AND "reason" IS NOT NULL AND char_length("reason") BETWEEN 3 AND 500)
  );
