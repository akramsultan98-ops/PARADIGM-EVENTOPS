-- CreateEnum
CREATE TYPE "SourceApprovalStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "EquipmentRequirement" ADD COLUMN     "approvalStatus" "SourceApprovalStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "ProductionItem" ADD COLUMN     "approvalStatus" "SourceApprovalStatus" NOT NULL DEFAULT 'DRAFT';

-- Backfill: approval used to be stored in "state" and was overwritten by plan generation.
-- The submission's review decision is the authoritative record of technical approval.
UPDATE "ProductionItem" i SET "approvalStatus" = 'APPROVED'
  WHERE i."state" = 'APPROVED'
     OR EXISTS (SELECT 1 FROM "DepartmentSubmission" s WHERE s."id" = i."submissionId" AND s."status" = 'APPROVED');
UPDATE "ProductionItem" i SET "approvalStatus" = 'UNDER_REVIEW'
  WHERE i."approvalStatus" = 'DRAFT'
    AND EXISTS (SELECT 1 FROM "DepartmentSubmission" s WHERE s."id" = i."submissionId" AND s."status" IN ('SUBMITTED', 'UNDER_REVIEW'));
UPDATE "EquipmentRequirement" r SET "approvalStatus" = 'APPROVED'
  WHERE r."state" = 'APPROVED'
     OR EXISTS (SELECT 1 FROM "DepartmentSubmission" s WHERE s."id" = r."submissionId" AND s."status" = 'APPROVED');
UPDATE "EquipmentRequirement" r SET "approvalStatus" = 'UNDER_REVIEW'
  WHERE r."approvalStatus" = 'DRAFT'
    AND EXISTS (SELECT 1 FROM "DepartmentSubmission" s WHERE s."id" = r."submissionId" AND s."status" IN ('SUBMITTED', 'UNDER_REVIEW'));
-- "state" now holds only calculation states; clear legacy approval values from it.
UPDATE "ProductionItem" SET "state" = 'CALCULATED' WHERE "state" = 'APPROVED';
UPDATE "EquipmentRequirement" SET "state" = 'CALCULATED' WHERE "state" = 'APPROVED';
