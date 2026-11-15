-- The submission's teamId must equal its milestone's teamId (F-05 data contract).
-- Milestone UNIQUE(id, teamId) already exists from the milestones migration.
-- DropForeignKey
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_milestoneId_fkey";

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_milestoneId_teamId_fkey" FOREIGN KEY ("milestoneId", "teamId") REFERENCES "Milestone"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

