import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import { ROLE_DEPARTMENT, type Permission } from "@/lib/permissions";

/**
 * Builds the exact AuthUser that getCurrentUser() would resolve for a seeded user, straight from the
 * test database. Integration tests mock only the cookie lookup (requireUser/getCurrentUser) with this —
 * every permission check, scope filter and database write in the code under test runs for real.
 */
const db = new PrismaClient();

export async function loadUser(email: string): Promise<AuthUser> {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { company: true, role: { include: { permissions: { include: { permission: true } } } }, memberships: { include: { department: true } } } });
  const departments = u.memberships.map((m) => ({ id: m.department.id, key: m.department.key, name: m.department.name, isManager: m.isManager }));
  return {
    id: u.id, companyId: u.companyId, companyName: u.company.name, currency: u.company.defaultCurrency, timezone: u.company.timezone,
    name: u.name, email: u.email, jobTitle: u.jobTitle, role: u.role.key, roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((p) => p.permission.key as Permission)),
    departments, approvalDepartment: ROLE_DEPARTMENT[u.role.key] ?? null, primaryDepartment: departments[0]?.key ?? ROLE_DEPARTMENT[u.role.key] ?? null,
    locale: u.locale, isDemo: u.isDemo,
  };
}

export const demo = {
  pm: "pm@demo.eventops.local",
  admin: "admin@demo.eventops.local",
  finance: "finance@demo.eventops.local",
  viewer: "viewer@demo.eventops.local",
  member: "production.member@demo.eventops.local",
  production: "production@demo.eventops.local",
  av: "av@demo.eventops.local",
  logistics: "logistics@demo.eventops.local",
  procurement: "procurement@demo.eventops.local",
  account: "account@demo.eventops.local",
} as const;

/** Unwraps an ActionResult, failing loudly with the server's message. */
export function ok<T>(r: { ok: boolean; data?: unknown; error?: string }): T {
  if (!r.ok) throw new Error(`Action failed: ${r.error}`);
  return r.data as T;
}
