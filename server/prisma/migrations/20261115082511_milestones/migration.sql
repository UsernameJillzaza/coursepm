-- CreateTable
CREATE TABLE "Milestone" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "maxRevisions" INTEGER NOT NULL DEFAULT 3,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Milestone_maxRevisions_check" CHECK ("maxRevisions" BETWEEN 1 AND 5)
);

-- CreateIndex
CREATE INDEX "Milestone_teamId_deadline_idx" ON "Milestone"("teamId", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_id_teamId_key" ON "Milestone"("id", "teamId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
