import "server-only";
import type { Prisma } from "@prisma/client";
import { canReviewDepartment, type AuthUser } from "@/lib/auth/session";

export type ReviewDecision = "APPROVED" | "REJECTED" | "NEEDS_INFORMATION";
const REVIEWABLE = ["SUBMITTED", "UNDER_REVIEW"] as const;

/**
 * Technical review of a department submission, inside the caller's transaction (P1-3 / P2-A).
 * - only SUBMITTED / UNDER_REVIEW inputs can be decided (never DRAFT or NEEDS_INFORMATION)
 * - the submitter can never review their own submission
 * - approval is refused while missing fields are open
 * - only records that were submitted for review (approvalStatus UNDER_REVIEW) are promoted
 * - a conditional update makes a second concurrent decision fail instead of overwriting the first
 */
export async function reviewSubmission(tx: Prisma.TransactionClient, u: AuthUser, submissionId: string, decision: ReviewDecision, note: string) {
  if (!["APPROVED", "REJECTED", "NEEDS_INFORMATION"].includes(decision)) throw new Error("Invalid decision");
  const s = await tx.departmentSubmission.findFirstOrThrow({ where: { id: submissionId, project: { companyId: u.companyId, deletedAt: null } }, include: { department: true, project: true } });
  if (!canReviewDepartment(u, s.department.key) && !(u.role === "PROJECT_MANAGER" && s.department.key === "ACCOUNT")) throw new Error(`Only the ${s.department.name} manager can technically approve this submission`);
  if (["COMPLETED", "CANCELLED"].includes(s.project.status)) throw new Error(`Project is ${s.project.status.toLowerCase()}`);
  if (!(REVIEWABLE as readonly string[]).includes(s.status)) throw new Error(`Only submitted inputs can be reviewed — this submission is ${s.status.toLowerCase().replace(/_/g, " ")}`);
  if (s.submittedById === u.id) throw new Error("You cannot review your own submission — another manager must decide");
  if (decision !== "APPROVED" && note.trim().length < 3) throw new Error("Please give a reason");
  const missing = (s.missingFields as unknown[] | null) ?? [];
  if (decision === "APPROVED" && missing.length) throw new Error(`Cannot approve: ${missing.length} required field(s) are still missing`);

  const claimed = await tx.departmentSubmission.updateMany({ where: { id: s.id, status: { in: [...REVIEWABLE] } }, data: { status: decision, reviewerId: u.id, reviewedAt: new Date(), reviewNote: note || null } });
  if (claimed.count !== 1) throw new Error("This submission has already been reviewed by someone else");

  // department status reflects the worst open submission
  const others = await tx.departmentSubmission.findMany({ where: { projectId: s.projectId, departmentId: s.departmentId, id: { not: s.id }, status: { notIn: ["APPROVED", "REJECTED"] } } });
  await tx.projectDepartment.updateMany({ where: { projectId: s.projectId, departmentId: s.departmentId }, data: { status: decision === "APPROVED" && others.length ? others[0].status : decision } });
  if (decision === "APPROVED") {
    await tx.productionItem.updateMany({ where: { submissionId: s.id, approvalStatus: "UNDER_REVIEW" }, data: { approvalStatus: "APPROVED" } });
    await tx.productionItem.updateMany({ where: { submissionId: s.id, drawingStatus: "PROVIDED" }, data: { drawingStatus: "APPROVED" } });
    await tx.equipmentRequirement.updateMany({ where: { submissionId: s.id, approvalStatus: "UNDER_REVIEW" }, data: { approvalStatus: "APPROVED" } });
  } else {
    const to = decision === "REJECTED" ? "REJECTED" : "DRAFT";
    await tx.productionItem.updateMany({ where: { submissionId: s.id, approvalStatus: "UNDER_REVIEW" }, data: { approvalStatus: to } });
    await tx.equipmentRequirement.updateMany({ where: { submissionId: s.id, approvalStatus: "UNDER_REVIEW" }, data: { approvalStatus: to } });
  }
  await tx.approval.updateMany({ where: { entityType: "SUBMISSION", entityId: s.id, status: "PENDING" }, data: { status: decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "CHANGES_REQUESTED", approverId: u.id, decidedAt: new Date(), decisionNote: note || null } });
  await tx.auditLog.create({ data: { companyId: u.companyId, userId: u.id, projectId: s.projectId, action: `SUBMISSION_${decision}`, entityType: "DepartmentSubmission", entityId: s.id, details: { note } } });
  return s;
}
