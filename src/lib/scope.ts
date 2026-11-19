import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";

/** Projects a user may see: always company-scoped; members/viewers additionally restricted to their projects/departments. */
export function projectScope(u: AuthUser): Prisma.ProjectWhereInput {
  const base: Prisma.ProjectWhereInput = { companyId: u.companyId, deletedAt: null };
  if (["SUPER_ADMIN", "PROJECT_MANAGER", "ACCOUNT_MANAGER", "FINANCE", "VIEWER"].includes(u.role) || u.approvalDepartment) return base;
  // The restriction lives under AND (not a top-level OR) so callers can spread the scope and add their own
  // `OR` search filters without silently replacing it. Callers must not set a top-level `AND` themselves.
  return { ...base, AND: [{ OR: [{ members: { some: { userId: u.id } } }, { departments: { some: { departmentId: { in: u.departments.map((d) => d.id) } } } }] }] };
}
