import "server-only";
import { db, num } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { pendingApprovalsWhere } from "@/server/services/approvals";
import { getLatestPlans } from "./plans";
import { canReadFinancials } from "@/lib/financial";

export async function pmDashboard(u: AuthUser) {
  const scope = projectScope(u);
  const now = new Date();
  const projects = await db.project.findMany({
    where: { ...scope, status: { notIn: ["CANCELLED"] } },
    include: { departments: { include: { department: true } }, projectManager: { select: { name: true } } },
    orderBy: { eventStart: "asc" },
  });
  const active = projects.filter((p) => p.status !== "COMPLETED");
  const plans = await getLatestPlans(active.map((p) => p.id));
  const [approvals, delayed, risks, procurement, upcoming, critical] = await Promise.all([
    db.approval.findMany({ where: pendingApprovalsWhere(u), include: { project: { select: { name: true, id: true } } }, orderBy: { createdAt: "asc" }, take: 8 }),
    db.task.findMany({ where: { project: scope, OR: [{ status: "DELAYED" }, { status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, plannedEnd: { lt: now } }] }, include: { project: { select: { name: true, id: true } }, department: true }, orderBy: { plannedEnd: "asc" }, take: 8 }),
    db.risk.findMany({ where: { project: scope, status: { notIn: ["CLOSED", "MITIGATED"] }, severity: { gte: 10 } }, include: { project: { select: { name: true, id: true } } }, orderBy: { severity: "desc" }, take: 6 }),
    db.procurementRequest.groupBy({ by: ["status"], where: { project: scope }, _count: true }),
    db.task.findMany({ where: { project: scope, OR: [{ isMilestone: true }, { isCritical: true }], plannedStart: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) } }, include: { project: { select: { name: true, id: true } } }, orderBy: { plannedStart: "asc" }, take: 8 }),
    db.task.count({ where: { project: scope, isCritical: true, status: { not: "COMPLETED" } } }),
  ]);
  const missing = active.flatMap((p) => p.departments.filter((d) => ["DRAFT", "NEEDS_INFORMATION"].includes(d.status)).map((d) => ({ projectId: p.id, project: p.name, department: d.department.name, status: d.status, due: d.dueDate })));
  const conflicts = [...plans.values()].reduce((s, x) => s + x.plan.schedule.conflicts.filter((c) => c.type === "CAPACITY" || c.type === "RESOURCE_DELAY").length, 0);
  const issues = active.flatMap((p) => (plans.get(p.id)?.plan.issues ?? []).filter((i) => i.severity === "error").map((i) => ({ ...i, projectId: p.id, project: p.name })));
  const budget = !canReadFinancials(u) ? [] : active.map((p) => {
    const pl = plans.get(p.id)?.plan;
    return { id: p.id, name: p.name, code: p.code, budget: num(p.budgetAmount), currency: p.currency, planned: pl?.budget.totalInBudgetCurrency ?? null, utilization: pl?.budget.utilizationPct ?? null, byCategory: pl?.budget.byCurrency.find((c) => c.currency === p.currency)?.byCategory ?? {} };
  });
  return {
    projects: active.map((p) => {
      const pl = plans.get(p.id);
      const total = p.departments.length;
      const approved = p.departments.filter((d) => d.status === "APPROVED").length;
      return { id: p.id, code: p.code, name: p.name, client: p.client, location: p.location, status: p.status, eventStart: p.eventStart, setupStart: p.setupStart, pm: p.projectManager?.name ?? null, participants: p.participants,
        readiness: total ? Math.round((approved / total) * 100) : 0, approved, total, departments: p.departments.map((d) => ({ key: d.department.key, name: d.department.name, status: d.status })),
        plan: pl ? { version: pl.version, status: pl.status, errors: pl.plan.readiness.errors, warnings: pl.plan.readiness.warnings, feasible: pl.plan.schedule.feasible, utilization: pl.plan.budget.utilizationPct } : null };
    }),
    approvals, delayed, risks, procurement, upcoming, missing, conflicts, issues, budget, criticalOpen: critical,
    kpi: {
      active: active.length,
      upcoming30: active.filter((p) => p.eventStart.getTime() - now.getTime() < 30 * 86400000 && p.eventStart > now).length,
      approvals: await db.approval.count({ where: pendingApprovalsWhere(u) }),
      missing: missing.length,
      delayed: delayed.length,
      highRisks: risks.length,
    },
  };
}
