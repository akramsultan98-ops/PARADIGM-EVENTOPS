import "server-only";
import { db, num } from "@/lib/db";
import { getApprovedPlan } from "./plans";
import { redactPlanFinancials } from "@/lib/financial";
import type { PlanResult } from "@/engines/pipeline";

/** Request-independent approved plan (usable from services such as the workbook); redacted unless `financials`. */
async function approvedPlanFor(projectId: string, financials: boolean) {
  const v = await db.scheduleVersion.findFirst({ where: { projectId, status: "APPROVED" }, orderBy: { version: "desc" } });
  if (!v) return null;
  const raw = v.snapshot as unknown as PlanResult;
  return { versionId: v.id, version: v.version, approvedAt: v.approvedAt, plan: financials ? raw : redactPlanFinancials(raw) };
}
import type { ExecTask, PlannedActual } from "@/components/execution/execution-board";

/** `financials` = caller has budget.read (P1-2); without it no budget or cost figures are returned. */
export async function executionData(projectId: string, financials = false) {
  const [project, tasks, updates, approved] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId } }),
    db.task.findMany({ where: { projectId }, include: { department: true, laborCategory: true }, orderBy: { plannedStart: "asc" } }),
    db.executionUpdate.findMany({ where: { projectId }, include: { user: { select: { name: true } }, task: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    getApprovedPlan(projectId),
  ]);
  const execTasks: ExecTask[] = tasks.map((t) => ({ id: t.id, wbs: t.wbsCode, name: t.name, phase: t.phase, department: t.department?.key ?? null, status: t.status, percent: t.percentComplete, plannedStart: t.plannedStart?.toISOString() ?? null, plannedEnd: t.plannedEnd?.toISOString() ?? null, actualStart: t.actualStart?.toISOString() ?? null, critical: t.isCritical, floatHours: t.totalFloatH, crew: t.crewSize, trade: t.laborCategory?.name ?? null }));
  const P = approved?.plan;
  const plannedActuals: PlannedActual[] = P ? [
    ...P.production.boq.map((b) => ({ category: `MATERIAL:${b.code}`, description: b.name, planned: b.purchaseQuantity, unit: b.unit, resourceType: "MATERIAL", materialId: b.materialId })),
    ...P.trades.map((t) => ({ category: `LABOR:${t.laborKey}:${t.phase}`, description: `${t.name} — ${t.phase.toLowerCase()}`, planned: t.totalHours, unit: "h", resourceType: "LABOR" })),
    { category: "VEHICLE:TRIPS", description: "Vehicles used (outbound)", planned: P.logistics.trips.length, unit: "vehicles", resourceType: "VEHICLE" },
  ] : [];
  return { project, tasks: execTasks, updates, approved, plannedActuals, active: ["APPROVED", "IN_PREPARATION", "IN_EXECUTION"].includes(project.status), budget: financials ? num(project.budgetAmount) : null };
}

export interface AccuracyRow { category: string; description: string; unit: string; planned: number; actual: number; variance: number; variancePct: number | null; accuracyPct: number | null; group: string }

/** Actual vs planned per category with accuracy = 1 − |actual − planned| / planned. Failed estimates are shown, never hidden. */
export async function actualVsPlanned(projectId: string, financials = false) {
  const [approved, actuals, tasks, costs] = await Promise.all([
    approvedPlanFor(projectId, financials),
    db.actualConsumption.findMany({ where: { projectId }, orderBy: { recordedAt: "asc" } }),
    db.task.findMany({ where: { projectId, status: "COMPLETED", actualStart: { not: null }, actualEnd: { not: null } }, orderBy: { plannedStart: "asc" } }),
    db.costItem.findMany({ where: { projectId } }),
  ]);
  const rows: AccuracyRow[] = [];
  const latest = new Map<string, (typeof actuals)[number]>();
  for (const a of actuals) latest.set(a.category, a);
  for (const a of latest.values()) {
    if (a.plannedQuantity == null) continue;
    if (!financials && a.resourceType === "COST") continue; // monetary actuals need budget.read
    rows.push(row(a.resourceType === "MATERIAL" ? "Materials" : a.resourceType === "LABOR" ? "Labour" : a.resourceType === "VEHICLE" ? "Transportation" : "Other", a.category, a.description, a.unit, a.plannedQuantity, a.actualQuantity));
  }
  for (const t of tasks) {
    if (!t.plannedStart || !t.plannedEnd || t.isMilestone) continue;
    const planned = (t.plannedEnd.getTime() - t.plannedStart.getTime()) / 3600000;
    const actual = (t.actualEnd!.getTime() - t.actualStart!.getTime()) / 3600000;
    if (planned > 0) rows.push(row("Duration", `TASK:${t.wbsCode}`, t.name, "h", round(planned), round(actual)));
  }
  const cur = approved?.plan.budget.budgetCurrency ?? "EGP";
  const estMat = costs.filter((c) => c.generated && c.category === "MATERIALS" && c.currency === cur).reduce((s, c) => s + Number(c.amount), 0);
  const actMat = costs.filter((c) => !c.generated && c.basis === "ACTUAL" && c.category === "MATERIALS" && c.currency === cur).reduce((s, c) => s + Number(c.amount), 0);
  if (financials && estMat && actMat) rows.push(row("Cost", "COST:MATERIALS", `Material cost (${cur}, invoices recorded so far)`, cur, estMat, actMat));
  const groups = [...new Set(rows.map((r) => r.group))].map((g) => {
    const rs = rows.filter((r) => r.group === g && r.accuracyPct != null);
    return { group: g, count: rs.length, meanAccuracyPct: rs.length ? round(rs.reduce((s, r) => s + r.accuracyPct!, 0) / rs.length, 1) : null, withinTolerance: rs.filter((r) => Math.abs(r.variancePct ?? 0) <= 5).length };
  });
  return { approved, rows, groups };
}

function row(group: string, category: string, description: string, unit: string, planned: number, actual: number): AccuracyRow {
  const variance = round(actual - planned, 2);
  const variancePct = planned ? round((variance / planned) * 100, 1) : null;
  return { group, category, description, unit, planned: round(planned, 2), actual: round(actual, 2), variance, variancePct, accuracyPct: planned ? round(Math.max(0, 100 - Math.abs(variancePct!)), 1) : null };
}
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
