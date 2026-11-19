import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";

/** Approvals the user is allowed to decide (role-matched, company-scoped). */
export function pendingApprovalsWhere(u: AuthUser): Prisma.ApprovalWhereInput {
  const roles = [u.role];
  if (u.role === "SUPER_ADMIN") return { companyId: u.companyId, status: "PENDING" };
  return { companyId: u.companyId, status: "PENDING", requiredRole: { in: roles } };
}
