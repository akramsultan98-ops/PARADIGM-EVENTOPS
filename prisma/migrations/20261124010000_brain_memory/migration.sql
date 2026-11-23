-- CreateEnum
CREATE TYPE "BrainWorkspace" AS ENUM ('PARADIGM', 'PERSONAL', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('WORKING_PREFERENCE', 'PROFESSIONAL_KNOWLEDGE', 'OPERATIONAL_RULE', 'CLIENT_KNOWLEDGE', 'VENDOR_KNOWLEDGE', 'EVENT_HISTORY', 'COMMUNICATION_PREFERENCE', 'DECISION_LESSON', 'PROCEDURE', 'ACTIVE_CONTEXT');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('FACT', 'RULE', 'PREFERENCE', 'ASSUMPTION', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "MemoryApproval" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MemoryValidity" AS ENUM ('ACTIVE', 'CONFLICTED', 'SUPERSEDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "BrainMemory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspace" "BrainWorkspace" NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "category" "MemoryCategory" NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rule" JSONB,
    "scope" JSONB,
    "keywords" TEXT[],
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT,
    "evidence" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "approval" "MemoryApproval" NOT NULL DEFAULT 'PROPOSED',
    "validity" "MemoryValidity" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "conflictWithId" TEXT,
    "supersedesId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrainMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrainMemoryVersion" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rule" JSONB,
    "scope" JSONB,
    "changedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainMemoryVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrainMemoryApplication" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "memoryVersion" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextRef" TEXT,
    "effect" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainMemoryApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrainMemory_companyId_workspace_approval_validity_idx" ON "BrainMemory"("companyId", "workspace", "approval", "validity");

-- CreateIndex
CREATE INDEX "BrainMemory_ownerUserId_idx" ON "BrainMemory"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BrainMemoryVersion_memoryId_version_key" ON "BrainMemoryVersion"("memoryId", "version");

-- CreateIndex
CREATE INDEX "BrainMemoryApplication_memoryId_idx" ON "BrainMemoryApplication"("memoryId");

-- CreateIndex
CREATE INDEX "BrainMemoryApplication_companyId_sessionId_idx" ON "BrainMemoryApplication"("companyId", "sessionId");

-- AddForeignKey
ALTER TABLE "BrainMemory" ADD CONSTRAINT "BrainMemory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrainMemory" ADD CONSTRAINT "BrainMemory_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrainMemoryVersion" ADD CONSTRAINT "BrainMemoryVersion_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "BrainMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrainMemoryApplication" ADD CONSTRAINT "BrainMemoryApplication_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "BrainMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
