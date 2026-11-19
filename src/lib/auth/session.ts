import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ROLE_DEPARTMENT, type Permission } from "@/lib/permissions";
import { SESSION_COOKIE, verifySession } from "./token";

export interface AuthUser {
  id: string;
  companyId: string;
  companyName: string;
  currency: string;
  timezone: string;
  name: string;
  email: string;
  jobTitle: string | null;
  role: string;
  roleName: string;
  permissions: Set<Permission>;
  departments: { id: string; key: string; name: string; isManager: boolean }[];
  /** department this role technically approves for (if any) */
  approvalDepartment: string | null;
  primaryDepartment: string | null;
  locale: string;
  isDemo: boolean;
}

/** Resolve and fully verify the current user (signature, expiry, session version, active flag). */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  const u = await db.user.findFirst({
    where: { id: claims.uid, companyId: claims.cid, active: true, deletedAt: null },
    include: { company: true, role: { include: { permissions: { include: { permission: true } } } }, memberships: { include: { department: true } } },
  });
  if (!u || u.sessionVersion !== claims.sv) return null;
  const departments = u.memberships.map((m) => ({ id: m.department.id, key: m.department.key, name: m.department.name, isManager: m.isManager }));
  return {
    id: u.id, companyId: u.companyId, companyName: u.company.name, currency: u.company.defaultCurrency, timezone: u.company.timezone,
    name: u.name, email: u.email, jobTitle: u.jobTitle, role: u.role.key, roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((p) => p.permission.key as Permission)),
    departments, approvalDepartment: ROLE_DEPARTMENT[u.role.key] ?? null,
    primaryDepartment: departments[0]?.key ?? ROLE_DEPARTMENT[u.role.key] ?? null,
    locale: u.locale, isDemo: u.isDemo,
  };
});

export async function requireUser(): Promise<AuthUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action") { super(message); this.name = "AuthorizationError"; }
}

export function can(u: AuthUser, p: Permission) { return u.permissions.has(p); }

export function assertCan(u: AuthUser, p: Permission) {
  if (!u.permissions.has(p)) throw new AuthorizationError(`Missing permission: ${p}`);
}

/** Department-scoped technical approval: managers approve only their own department. */
export function canReviewDepartment(u: AuthUser, departmentKey: string) {
  if (u.role === "SUPER_ADMIN") return true;
  if (!u.permissions.has("submission.review")) return false;
  return u.approvalDepartment === departmentKey || u.departments.some((d) => d.key === departmentKey && d.isManager);
}

export async function requirePermission(p: Permission): Promise<AuthUser> {
  const u = await requireUser();
  assertCan(u, p);
  return u;
}
