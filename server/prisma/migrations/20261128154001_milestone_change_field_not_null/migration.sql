-- Fix for 20261128154000_milestone_maintenance (TEST-08-16, AC-08-9).
-- `"field" IN (...)` is NULL when field is NULL, so an EDIT row with a null
-- field made the whole CHECK NULL, and PostgreSQL accepts a CHECK that is
-- NULL. Naming "field" IS NOT NULL makes the EDIT branch false instead.
ALTER TABLE "MilestoneChange" DROP CONSTRAINT "MilestoneChange_kind_check";
ALTER TABLE "MilestoneChange" ADD CONSTRAINT "MilestoneChange_kind_check"
  CHECK (
    ("kind" = 'EDIT' AND "field" IS NOT NULL AND "field" IN ('description', 'deadline') AND "oldValue" IS NOT NULL AND "newValue" IS NOT NULL AND "reason" IS NULL)
    OR ("kind" = 'CLOSE' AND "field" IS NULL AND "oldValue" IS NULL AND "newValue" IS NULL)
  );
