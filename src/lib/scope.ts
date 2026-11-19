import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";

/** Projects a user may see: always company-scoped; members/viewers additionally restricted to their projects/departments. */
export function projectScope(u: AuthUser): Prisma.ProjectWhereInput {
  const base: Prisma.ProjectWhereInput = { companyId: u.companyId, deletedAt: null };
  if (["SUPER_ADMIN", "PROJECT_MANAGER", "ACCOUNT_MANAGER", "FINANCE", "VIEWER"].includes(u.role) || u.approvalDepartment) return base;
  return { ...base, OR: [{ members: { some: { userId: u.id } } }, { departments: { some: { departmentId: { in: u.departments.map((d) => d.id) } } } }] };
}
