import type { AuthUser } from "@/lib/auth/session";
import type { Dict } from "@/i18n/dictionaries";

export type NavIcon = "dashboard" | "projects" | "tasks" | "approvals" | "bell" | "ai" | "planning" | "production" | "av" | "logistics" | "accommodation" | "creative" | "procurement" | "account" | "execution" | "risk" | "budget" | "resources" | "manpower" | "documents" | "reports" | "knowledge" | "settings" | "users";
export interface NavItem { key: string; href: string; icon: NavIcon; label: string; badge?: number }
export interface NavSection { key: string; label: string; items: NavItem[] }

const ALL_DEPT_ROLES = ["SUPER_ADMIN", "PROJECT_MANAGER", "ACCOUNT_MANAGER", "VIEWER"];

/** Navigation is computed on the server from the user's role, permissions and departments. */
export function buildNav(u: AuthUser, t: Dict, counts: { approvals: number; notifications: number; tasks: number }): NavSection[] {
  const has = (p: Parameters<AuthUser["permissions"]["has"]>[0]) => u.permissions.has(p);
  const inDept = (k: string) => ALL_DEPT_ROLES.includes(u.role) || u.departments.some((d) => d.key === k) || u.approvalDepartment === k;
  const sections: NavSection[] = [
    {
      key: "workspace", label: t.nav.workspace, items: [
        { key: "dashboard", href: "/dashboard", icon: "dashboard", label: t.nav.dashboard },
        { key: "projects", href: "/projects", icon: "projects", label: t.nav.projects },
        { key: "tasks", href: "/tasks", icon: "tasks", label: t.nav.myTasks, badge: counts.tasks || undefined },
        ...(has("submission.review") || has("plan.approve") || has("budget.approve") || has("procurement.approve") || has("standards.approve") ? [{ key: "approvals", href: "/approvals", icon: "approvals" as const, label: t.nav.approvals, badge: counts.approvals || undefined }] : []),
        ...(has("ai.use") ? [{ key: "assistant", href: "/assistant", icon: "ai" as const, label: t.nav.assistant }] : []),
        ...(has("brain.use") ? [{ key: "brain", href: "/brain", icon: "knowledge" as const, label: t.nav.brain }] : []),
      ],
    },
    {
      key: "departments", label: t.nav.operations, items: [
        ...(has("plan.review") || has("schedule.edit") || u.role === "VIEWER" ? [{ key: "planning", href: "/planning", icon: "planning" as const, label: t.nav.planning }] : []),
        ...(inDept("ACCOUNT") && u.role !== "VIEWER" ? [{ key: "account", href: "/account", icon: "account" as const, label: t.nav.account }] : []),
        ...(inDept("PRODUCTION") ? [{ key: "production", href: "/production", icon: "production" as const, label: t.nav.production }] : []),
        ...(inDept("AV") ? [{ key: "av", href: "/av", icon: "av" as const, label: t.nav.av }] : []),
        ...(inDept("LOGISTICS") ? [{ key: "logistics", href: "/logistics", icon: "logistics" as const, label: t.nav.logistics }] : []),
        ...(inDept("ACCOMMODATION") ? [{ key: "accommodation", href: "/accommodation", icon: "accommodation" as const, label: t.nav.accommodation }] : []),
        ...(inDept("CREATIVE") ? [{ key: "creative", href: "/creative", icon: "creative" as const, label: t.nav.creative }] : []),
        ...(inDept("PROCUREMENT") || u.role === "FINANCE" ? [{ key: "procurement", href: "/procurement", icon: "procurement" as const, label: t.nav.procurement }] : []),
      ],
    },
    {
      key: "control", label: t.nav.control, items: [
        { key: "execution", href: "/execution", icon: "execution", label: t.nav.execution },
        ...(u.role !== "VIEWER" ? [{ key: "manpower", href: "/manpower", icon: "manpower" as const, label: t.nav.manpower }] : []),
        { key: "resources", href: "/resources", icon: "resources", label: t.nav.resources },
        { key: "risks", href: "/risks", icon: "risk", label: t.nav.risks },
        ...(has("budget.read") ? [{ key: "budget", href: "/budget", icon: "budget" as const, label: t.nav.budget }] : []),
        { key: "documents", href: "/documents", icon: "documents", label: t.nav.documents },
        ...(has("export.run") ? [{ key: "reports", href: "/reports", icon: "reports" as const, label: t.nav.reports }] : []),
      ],
    },
    {
      key: "admin", label: t.nav.admin, items: [
        ...(has("standards.manage") || has("knowledge.manage") || has("standards.approve") ? [{ key: "knowledge", href: "/knowledge", icon: "knowledge" as const, label: t.nav.knowledge }] : []),
        ...(has("users.manage") ? [{ key: "users", href: "/users", icon: "users" as const, label: t.nav.users }] : []),
        { key: "settings", href: "/settings", icon: "settings", label: t.nav.settings },
      ],
    },
  ];
  return sections.filter((s) => s.items.length > 0);
}
