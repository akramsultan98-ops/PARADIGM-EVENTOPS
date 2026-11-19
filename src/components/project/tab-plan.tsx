import { db, num } from "@/lib/db";
import { projectContext } from "@/server/queries/project";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatusBadge, TableWrap } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { BoqTable, BudgetPanel, CuttingPlans, LaborDemandTable, NoPlan, ProcurementPlanTable, TradesTable } from "@/components/planning/panels";
import { Gantt } from "@/components/planning/gantt";
import { ProvenanceButton } from "@/components/ui/provenance";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, toLocalInput } from "@/lib/format";
import { ManualCostDialog } from "./forms";
import { RequestBudgetApproval, RescheduleButton } from "./small-actions";
import { cn } from "@/lib/utils";

const PHASES = ["ADMIN", "PROCUREMENT", "PRODUCTION", "TRANSPORT", "SETUP", "EVENT", "DISMANTLE"] as const;

export async function TimelineTab({ id }: { id: string }) {
  const { u, locale } = await projectContext(id);
  const tasks = await db.task.findMany({ where: { projectId: id }, include: { department: true, laborCategory: true, predecessors: { include: { predecessor: { select: { wbsCode: true } } } } }, orderBy: [{ plannedStart: "asc" }] });
  const changes = await db.projectChange.findMany({ where: { projectId: id, entityType: "Task" }, orderBy: { createdAt: "desc" }, take: 1 });
  const affected = new Set(((changes[0]?.impact as { affectedTasks?: string[] } | null)?.affectedTasks) ?? []);
  if (!tasks.length) return <NoPlan projectId={id} canGenerate />;
  return (
    <div className="space-y-5">
      {PHASES.map((ph) => {
        const list = tasks.filter((t) => t.phase === ph);
        if (!list.length) return null;
        return (
          <Card key={ph} className="min-w-0">
            <CardHeader><div><CardTitle>{ph.charAt(0) + ph.slice(1).toLowerCase()}</CardTitle><CardDescription>{list.length} task(s)</CardDescription></div></CardHeader>
            <TableWrap>
              <table className="data-table">
                <thead><tr><th>WBS</th><th>Task</th><th>Dept</th><th>Predecessors</th><th>Start</th><th>Finish</th><th className="num">Dur.</th><th className="num">Crew</th><th className="num">Float</th><th>Status</th><th className="num">%</th><th /></tr></thead>
                <tbody>{list.map((t) => (
                  <tr key={t.id} className={cn(t.isCritical && "bg-danger-soft/30", affected.has(t.name) && "outline outline-1 -outline-offset-1 outline-warning")}>
                    <td className="text-2xs tabular text-muted-foreground">{t.wbsCode}</td>
                    <td className="min-w-[220px]"><div className="font-medium">{t.name}</div>{t.description && <div className="text-2xs text-danger">{t.description}</div>}{affected.has(t.name) && <div className="text-2xs text-warning">moved by last schedule change</div>}</td>
                    <td className="text-xs">{t.department?.key ?? "—"}</td>
                    <td className="text-2xs text-muted-foreground">{t.predecessors.map((p) => `${p.predecessor.wbsCode}${p.type !== "FS" ? ` ${p.type}` : ""}`).join(", ") || "—"}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(t.plannedStart, locale)}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(t.plannedEnd, locale)}</td>
                    <td className="num">{fmtNumber(t.durationHours, 1)} h</td>
                    <td className="num">{t.crewSize ? `${t.crewSize}` : "—"}<span className="text-2xs text-muted-foreground">{t.laborCategory ? ` ${t.laborCategory.key.toLowerCase()}` : ""}</span></td>
                    <td className={cn("num", t.isCritical && "font-semibold text-danger")}>{t.isCritical ? "0 · crit" : `${fmtNumber(t.totalFloatH, 0)} h`}</td>
                    <td><StatusBadge status={t.status} locale={locale} /></td>
                    <td className="num">{t.percentComplete}</td>
                    <td>{u.permissions.has("schedule.edit") && t.plannedStart && !t.isMilestone && t.status !== "COMPLETED" && <RescheduleButton taskId={t.id} name={t.name} start={toLocalInput(t.plannedStart)} />}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableWrap>
          </Card>
        );
      })}
    </div>
  );
}

export async function GanttTab({ id }: { id: string }) {
  const { plan } = await projectContext(id);
  const tasks = await db.task.findMany({ where: { projectId: id }, include: { department: true, laborCategory: true, successors: true }, orderBy: [{ plannedStart: "asc" }] });
  if (!tasks.length) return <NoPlan projectId={id} canGenerate />;
  const deps = tasks.flatMap((t) => t.successors.map((s) => ({ from: t.id, to: s.successorId, type: s.type })));
  return (
    <div className="space-y-3">
      <Gantt now={new Date().toISOString()} deps={deps} tasks={tasks.map((t) => ({ id: t.id, wbs: t.wbsCode, name: t.name, department: t.department?.key ?? null, phase: t.phase, start: t.plannedStart?.toISOString() ?? null, finish: t.plannedEnd?.toISOString() ?? null, actualStart: t.actualStart?.toISOString() ?? null, actualEnd: t.actualEnd?.toISOString() ?? null, critical: t.isCritical, milestone: t.isMilestone, status: t.status, percent: t.percentComplete, floatHours: t.totalFloatH, crew: t.crewSize, trade: t.laborCategory?.name ?? null }))} />
      {plan && <p className="text-2xs text-muted-foreground">Scheduled by {plan.plan.schedule.method === "CPM_SGS" ? "calendar-aware CPM + resource-constrained serial scheduling" : plan.plan.schedule.method}; {plan.plan.schedule.conflicts.length} conflict notice(s). Export: Master Workbook sheet 03_Gantt_Data.</p>}
    </div>
  );
}

export async function BoqTab({ id }: { id: string }) {
  const { locale, plan } = await projectContext(id);
  if (!plan) return <NoPlan projectId={id} canGenerate />;
  const P = plan.plan;
  return (
    <div className="space-y-5">
      <BoqTable plan={P} locale={locale} />
      <CuttingPlans plan={P} />
      {P.production.timber.length > 0 && (
        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Timber cutting (1D)</CardTitle><CardDescription>From drawing-derived frame members only — structural approval by a qualified engineer required</CardDescription></div></CardHeader>
          {P.production.timber.map((tm) => (
            <div key={tm.materialId} className="border-t px-5 py-3">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-sm"><span className="font-semibold">{tm.code}</span><span className="text-muted-foreground">{tm.result.sticksUsed} sticks · net {tm.result.netLengthM} m of {tm.result.stockLengthTotalM} m · yield {tm.result.yieldPct}%</span><ProvenanceButton trace={tm.result.trace} /></div>
              <div className="grid gap-1 text-2xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">{tm.result.sticks.slice(0, 12).map((s) => <div key={s.stick} className="rounded border px-2 py-1">#{s.stick}: {s.cuts.map((c) => c.lengthM).join(" + ")} m · offcut {s.offcutM} m</div>)}</div>
              {tm.result.sticks.length > 12 && <div className="mt-1 text-2xs text-muted-foreground">+{tm.result.sticks.length - 12} more sticks in the workbook (sheet 07)</div>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export async function ManpowerTab({ id }: { id: string }) {
  const { locale, plan } = await projectContext(id);
  if (!plan) return <NoPlan projectId={id} canGenerate />;
  const assignments = await db.laborAssignment.findMany({ where: { projectId: id }, include: { laborCategory: true, task: { select: { name: true } } }, orderBy: { workDate: "asc" } });
  return (
    <div className="space-y-5">
      <TradesTable plan={plan.plan} locale={locale} />
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>Phase working windows</CardTitle><CardDescription>Productive time available per person in each phase</CardDescription></div></CardHeader>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(plan.plan.windows).map(([k, w]) => <div key={k} className="rounded-md border p-3"><div className="text-2xs uppercase tracking-wider text-muted-foreground">{k.toLowerCase()}</div><div className="font-semibold">{fmtNumber(w.days, 1)} days{w.productiveHoursPerDay ? ` × ${w.productiveHoursPerDay} h` : ""}</div><div className="text-2xs text-muted-foreground">{w.label}</div></div>)}</div>
      </Card>
      <LaborDemandTable plan={plan.plan} />
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>Crew assignments by task</CardTitle><CardDescription>Used for cross-project double-booking detection</CardDescription></div></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Date</th><th>Trade</th><th>Task</th><th className="num">Crew</th><th className="num">Labour h</th></tr></thead><tbody>{assignments.map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{fmtDate(a.workDate, locale)}</td><td>{a.laborCategory.name}</td><td>{a.task?.name ?? "—"}</td><td className="num">{a.crewSize}</td><td className="num">{fmtNumber(a.hours, 1)}</td></tr>)}</tbody></table></TableWrap>
      </Card>
    </div>
  );
}

export async function ProcurementTab({ id }: { id: string }) {
  const { locale, plan } = await projectContext(id);
  const reqs = await db.procurementRequest.findMany({ where: { projectId: id }, include: { vendor: true, quotes: true }, orderBy: { requiredByDate: "asc" } });
  return (
    <div className="space-y-5">
      {plan ? <ProcurementPlanTable plan={plan.plan} locale={locale} /> : <NoPlan projectId={id} canGenerate />}
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>Purchase requests</CardTitle><CardDescription>Managed by Procurement — <a className="text-primary" href={`/procurement?project=${id}`}>open procurement workspace</a></CardDescription></div></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Code</th><th>Item</th><th className="num">Qty</th><th>Vendor</th><th className="num">Unit price</th><th>Required by</th><th className="num">Quotes</th><th className="num">Received</th><th>Status</th></tr></thead><tbody>{reqs.map((r) => <tr key={r.id}><td className="text-xs font-medium">{r.code}</td><td>{r.item}</td><td className="num">{r.quantity} {r.unit}</td><td className="text-xs">{r.vendor?.name ?? "—"}</td><td className="num">{fmtMoney(num(r.unitPrice), r.currency, locale)}</td><td className="text-xs">{fmtDate(r.requiredByDate, locale)}</td><td className="num">{r.quotes.length}</td><td className="num">{r.receivedQuantity || "—"}</td><td><StatusBadge status={r.status} locale={locale} /></td></tr>)}</tbody></table></TableWrap>
        {reqs.length === 0 && <EmptyState title="No purchase requests yet" className="m-4" />}
      </Card>
    </div>
  );
}

export async function BudgetTab({ id }: { id: string }) {
  const { u, locale, project: p, plan } = await projectContext(id);
  const [budgets, actuals] = await Promise.all([
    db.projectBudget.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    db.costItem.findMany({ where: { projectId: id, generated: false }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {budgets[0] && <Badge variant={budgets[0].status === "APPROVED" ? "success" : "warning"}>Budget {budgets[0].status.toLowerCase()} · {fmtMoney(num(budgets[0].totalBudget), budgets[0].currency, locale)}</Badge>}
        {u.permissions.has("plan.review") && budgets[0]?.status !== "APPROVED" && <RequestBudgetApproval projectId={id} />}
        {(u.permissions.has("budget.approve") || u.permissions.has("procurement.manage") || u.role === "PROJECT_MANAGER") && <ManualCostDialog projectId={id} currency={p.currency} />}
      </div>
      {plan ? <BudgetPanel plan={plan.plan} locale={locale} /> : <NoPlan projectId={id} canGenerate />}
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>Entered costs, quotations & actuals</CardTitle><CardDescription>Included in the next plan generation; actuals feed actual-vs-planned</CardDescription></div></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Category</th><th>Description</th><th className="num">Amount</th><th>Basis</th><th>Date</th></tr></thead><tbody>{actuals.map((c) => <tr key={c.id}><td className="text-xs">{c.category.toLowerCase()}</td><td>{c.description}</td><td className="num">{fmtMoney(Number(c.amount), c.currency, locale)}</td><td><Badge variant={c.basis === "ACTUAL" ? "success" : c.basis === "PENDING_QUOTE" ? "warning" : "secondary"}>{c.basis.toLowerCase().replace("_", " ")}</Badge></td><td className="text-xs">{fmtDate(c.createdAt, locale)}</td></tr>)}</tbody></table></TableWrap>
      </Card>
    </div>
  );
}
