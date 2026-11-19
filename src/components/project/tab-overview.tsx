import Link from "next/link";
import { AlertTriangle, CalendarRange, CheckCircle2, ClipboardList, Coins, Users } from "lucide-react";
import { db, num } from "@/lib/db";
import { projectContext } from "@/server/queries/project";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, KeyValue, StatCard, StatusBadge, TableWrap } from "@/components/ui/kit";
import { IssuesPanel } from "@/components/planning/panels";
import { Progress } from "@/components/ui/progress";
import { daysUntil, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { DepartmentAssigner } from "./department-assigner";
import { cn } from "@/lib/utils";

export async function OverviewTab({ id }: { id: string }) {
  const { u, locale, project: p, plan } = await projectContext(id);
  const P = plan?.plan;
  const [tasks, activity, users] = await Promise.all([
    db.task.groupBy({ by: ["status"], where: { projectId: id }, _count: true }),
    db.auditLog.findMany({ where: { projectId: id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.user.findMany({ where: { companyId: u.companyId, active: true }, include: { memberships: { include: { department: true } }, role: true }, orderBy: { name: "asc" } }),
  ]);
  const totalTasks = tasks.reduce((s, x) => s + x._count, 0);
  const done = tasks.find((x) => x.status === "COMPLETED")?._count ?? 0;
  const approved = p.departments.filter((d) => d.status === "APPROVED").length;
  const readiness = p.departments.length ? Math.round((approved / p.departments.length) * 100) : 0;
  const keyDates: [string, Date | null][] = [["Setup start", p.setupStart], ["Setup end", p.setupEnd], ["Event start", p.eventStart], ["Event end", p.eventEnd], ["Dismantle end", p.dismantleEnd]];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Department readiness" value={`${readiness}%`} icon={Users} sub={`${approved}/${p.departments.length} inputs approved`} tone={readiness === 100 ? "success" : "warning"} href={`/projects/${id}/inputs`} />
        <StatCard label="Plan" value={plan ? `v${plan.version}` : "—"} icon={CalendarRange} sub={plan ? plan.status.replace("_", " ").toLowerCase() : "not generated"} href={`/projects/${id}/planning`} />
        <StatCard label="Open errors" value={P?.readiness.errors ?? "—"} icon={AlertTriangle} tone={P?.readiness.errors ? "danger" : "success"} sub={P ? `${P.readiness.warnings} warnings` : undefined} />
        <StatCard label="Tasks completed" value={`${done}/${totalTasks}`} icon={ClipboardList} href={`/projects/${id}/timeline`} />
        <StatCard label="Schedule" value={P ? (P.schedule.feasible ? "Feasible" : "Conflicts") : "—"} icon={CheckCircle2} tone={P ? (P.schedule.feasible ? "success" : "danger") : "default"} href={`/projects/${id}/gantt`} />
        <StatCard label="Planned cost" value={P?.budget.totalInBudgetCurrency != null ? fmtMoney(P.budget.totalInBudgetCurrency, p.currency, locale) : "—"} icon={Coins} sub={num(p.budgetAmount) ? `budget ${fmtMoney(num(p.budgetAmount), p.currency, locale)}` : "no budget set"} href={`/projects/${id}/budget`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader><div><CardTitle>Participating departments</CardTitle><CardDescription>Assigned by the Project Manager; each owns its technical inputs</CardDescription></div>{u.permissions.has("project.assign") && <DepartmentAssigner projectId={id} current={p.departments.map((d) => ({ key: d.department.key, leadId: d.leadId ?? undefined, dueDate: d.dueDate?.toISOString().slice(0, 10) }))} users={users.map((x) => ({ id: x.id, name: x.name, departments: x.memberships.map((m) => m.department.key) }))} />}</CardHeader>
          <TableWrap>
            <table className="data-table"><thead><tr><th>Department</th><th>Lead</th><th>Input due</th><th>Status</th><th>Open issues</th></tr></thead>
              <tbody>{p.departments.map((d) => {
                const iss = P?.readiness.byDepartment[d.department.key];
                const due = d.dueDate ? daysUntil(d.dueDate) : null;
                return <tr key={d.id}><td className="font-medium">{d.department.name}</td><td className="text-xs">{d.lead?.name ?? "—"}</td><td className={cn("whitespace-nowrap text-xs", due != null && due < 2 && d.status !== "APPROVED" && "font-semibold text-danger")}>{fmtDate(d.dueDate, locale)}</td><td><StatusBadge status={d.status} locale={locale} /></td><td className="text-xs">{iss ? <><span className="text-danger">{iss.errors} errors</span> · <span className="text-warning">{iss.warnings} warnings</span></> : "—"}</td></tr>;
              })}</tbody>
            </table>
          </TableWrap>
          {p.departments.length === 0 && <EmptyState title="No departments assigned yet" className="m-4" />}
        </Card>
        <Card className="min-w-0">
          <CardHeader><CardTitle>Key dates</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {keyDates.map(([l, d]) => <div key={l} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{l}</span><span className="font-medium tabular">{fmtDateTime(d, locale)}</span></div>)}
            <div className="pt-2"><div className="mb-1 flex justify-between text-xs"><span>Readiness</span><span>{readiness}%</span></div><Progress value={readiness} tone={readiness === 100 ? "success" : "primary"} /></div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">{P ? <IssuesPanel issues={P.issues} limit={14} /> : <EmptyState title="Plan not generated" description="Once department inputs are in, generate the plan to calculate resources, schedule and risks." />}</div>
        <Card className="min-w-0">
          <CardHeader><CardTitle>Critical path</CardTitle><Link className="text-xs text-primary" href={`/projects/${id}/gantt`}>Gantt →</Link></CardHeader>
          <CardContent className="space-y-2">
            {P?.tasks.filter((t) => t.critical).map((t) => <div key={t.key} className="flex justify-between gap-2 text-sm"><span className="truncate">{t.name}</span><span className="shrink-0 text-2xs text-muted-foreground">{fmtDateTime(t.start, locale)}</span></div>)}
            {!P && <div className="text-xs text-muted-foreground">—</div>}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0"><CardHeader><CardTitle>Project details</CardTitle></CardHeader><CardContent><KeyValue items={[["Client", p.client], ["Category", p.category], ["Location", p.location], ["Venue", p.venue ? `${p.venue.name} (access ${p.venue.accessOpens ?? "?"}–${p.venue.accessCloses ?? "?"}, ${p.venue.powerCapacityKw ?? "?"} kW)` : "TBC"], ["Project Manager", p.projectManager?.name], ["Account Manager", p.accountManager?.name], ["Participants", p.participants], ["Budget", fmtMoney(num(p.budgetAmount), p.currency, locale)]]} /></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Recent activity</CardTitle><Link className="text-xs text-primary" href={`/projects/${id}/activity`}>All →</Link></CardHeader>
          <CardContent className="space-y-2">{activity.map((a) => <div key={a.id} className="flex justify-between gap-3 text-sm"><span><span className="font-medium">{a.user?.name ?? "System"}</span> · {a.action.replace(/_/g, " ").toLowerCase()}</span><span className="shrink-0 text-2xs text-muted-foreground">{fmtDateTime(a.createdAt, locale)}</span></div>)}</CardContent>
        </Card>
      </div>
    </div>
  );
}
