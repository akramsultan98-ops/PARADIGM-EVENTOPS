-- At most ONE pending approval per approved entity (P3: duplicate approvals).
-- Partial unique index (not expressible in the Prisma schema; enforced by PostgreSQL).
-- Resolve any historical duplicates first: keep the newest pending request per entity.
UPDATE "Approval" a SET "status" = 'CHANGES_REQUESTED', "decisionNote" = 'Superseded duplicate request', "decidedAt" = NOW()
WHERE a."status" = 'PENDING' AND EXISTS (
  SELECT 1 FROM "Approval" b WHERE b."status" = 'PENDING' AND b."entityType" = a."entityType" AND b."entityId" = a."entityId"
    AND (b."createdAt" > a."createdAt" OR (b."createdAt" = a."createdAt" AND b."id" > a."id"))
);
CREATE UNIQUE INDEX "Approval_one_pending_per_entity" ON "Approval" ("entityType", "entityId") WHERE "status" = 'PENDING';
