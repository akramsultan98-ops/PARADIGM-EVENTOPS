import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCheck, ClipboardX, FolderKanban, ShieldAlert, Timer, Workflow } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getDict, statusLabel } from "@/i18n/server";
import { pmDashboard } from "@/server/queries/dashboard";
import { PageHeader, StatCard, StatusBadge, EmptyState, TableWrap, SeverityDot } from "@/components/ui/kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StackedBar } from "@/components/charts/charts";
import { daysUntil, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { DepartmentDashboard, departmentForUser } from "@/components/departments/department-dashboard";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
const DEPT_ABBR: Record<string, string> = { PRODUCTION: "PRD", AV: "AV", LOGISTICS: "LOG", ACCOMMODATION: "ACC", CREATIVE: "CRE", PROCUREMENT: "PRC", ACCOUNT: "ACT", PMO: "PMO", FINANCE: "FIN" };

export default async function DashboardPage() {
  const u = await requireUser();
  const dept = departmentForUser(u);
  if (dept) return <DepartmentDashboard user={u} dept={dept} />;
  const { t, locale } = await getDict();
  const d = await pmDashboard(u);
  const cats = ["MATERIALS", "LABOR", "AV_EQUIPMENT", "TRANSPORTATION", "ACCOMMODATION", "PRINTING", "RENTALS", "OPERATIONS", "VENDORS", "CONTINGENCY"];
  const label = (c: string) => c.replace("_", " ").toLowerCase();
  const budgetData = d.budget.filter((b) => Object.keys(b.byCategory).length).map((b) => ({ name: b.code, ...Object.fromEntries(cats.map((c) => [label(c), b.byCategory[c] ?? 0])) }));
  const procCount = (s: string[]) => d.procurement.filter((p) => s.includes(p.status)).reduce((a, p) => a + p._count, 0);

  return (
    <>
      <PageHeader eyebrow={u.roleName} title={t.nav.dashboard} description="What requires attention across your projects — submissions, approvals, schedule, risks and budget."
        actions={<>{u.permissions.has("project.create") && <Button asChild><Link href="/projects/new">{t.header.newProject}</Link></Button>}<Button variant="outline" asChild><Link href="/approvals">{t.nav.approvals}</Link></Button></>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active projects" value={d.kpi.active} icon={FolderKanban} href="/projects" sub={`${d.kpi.upcoming30} event(s) in next 30 days`} />
        <StatCard label="Pending approvals" value={d.kpi.approvals} icon={CheckCheck} tone={d.kpi.approvals ? "warning" : "success"} href="/approvals" sub="awaiting your decision" />
        <StatCard label="Missing submissions" value={d.kpi.missing} icon={ClipboardX} tone={d.kpi.missing ? "danger" : "success"} sub="department inputs incomplete" />
        <StatCard label="Delayed tasks" value={d.kpi.delayed} icon={Timer} tone={d.kpi.delayed ? "danger" : "success"} href="/execution" sub={`${d.criticalOpen} open critical-path tasks`} />
        <StatCard label="High-priority risks" value={d.kpi.highRisks} icon={ShieldAlert} tone={d.kpi.highRisks ? "warning" : "success"} href="/risks" sub="severity ≥ 10" />
        <StatCard label="Resource conflicts" value={d.conflicts} icon={Workflow} tone={d.conflicts ? "warning" : "success"} href="/planning" sub="crew / capacity contention" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader><div><CardTitle>Projects & department readiness</CardTitle><CardDescription>Readiness = approved department inputs ÷ participating departments</CardDescription></div><Button variant="ghost" size="sm" asChild><Link href="/projects">{t.common.viewAll}</Link></Button></CardHeader>
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Project</th><th>Event</th><th>Status</th><th>Departments</th><th className="num">Readiness</th><th>Plan</th></tr></thead>
              <tbody>
                {d.projects.map((p) => {
                  const days = daysUntil(p.eventStart);
                  return (
                    <tr key={p.id}>
                      <td className="min-w-[200px]"><Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">{p.name}</Link><div className="text-2xs text-muted-foreground">{p.code} · {p.client}</div></td>
                      <td className="whitespace-nowrap"><div>{fmtDate(p.eventStart, locale)}</div><div className={cn("text-2xs", days < 0 ? "text-muted-foreground" : days <= 7 ? "font-medium text-danger" : "text-muted-foreground")}>{days >= 0 ? `in ${days} days` : "past"}</div></td>
                      <td><StatusBadge status={p.status} locale={locale} /></td>
                      <td><div className="flex max-w-[210px] flex-wrap gap-1">{p.departments.map((dp) => <span key={dp.key} title={`${dp.name}: ${statusLabel(dp.status, locale)}`} className={cn("rounded px-1 py-px text-[9px] font-bold tracking-wide", dp.status === "APPROVED" ? "bg-success-soft text-success" : dp.status === "NEEDS_INFORMATION" ? "bg-danger-soft text-danger" : ["SUBMITTED", "UNDER_REVIEW"].includes(dp.status) ? "bg-violet-soft text-violet" : "bg-muted text-muted-foreground")}>{DEPT_ABBR[dp.key] ?? dp.key}</span>)}</div></td>
                      <td className="num w-28"><div className="text-xs font-semibold">{p.readiness}%</div><Progress value={p.readiness} tone={p.readiness === 100 ? "success" : p.readiness >= 50 ? "primary" : "warning"} className="mt-1" /></td>
                      <td className="whitespace-nowrap text-xs">{p.plan ? <><StatusBadge status={p.plan.status} locale={locale} /><div className="mt-1 text-2xs text-muted-foreground">v{p.plan.version} · {p.plan.errors} errors · {p.plan.feasible ? "feasible" : "conflicts"}</div></> : <span className="text-muted-foreground">Not generated</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        <Card className="min-w-0">
          <CardHeader><CardTitle>Pending approvals</CardTitle><Button variant="ghost" size="sm" asChild><Link href="/approvals">{t.common.viewAll}</Link></Button></CardHeader>
          <CardContent className="space-y-1 p-2 sm:p-2">
            {d.approvals.length === 0 && <EmptyState icon={CheckCheck} title="Nothing waiting for you" className="border-0" />}
            {d.approvals.map((a) => (
              <Link key={a.id} href="/approvals" className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-muted">
                <span className="mt-0.5 rounded bg-violet-soft px-1.5 py-0.5 text-[10px] font-bold text-violet">{a.entityType}</span>
                <div className="min-w-0"><div className="line-clamp-2 text-sm font-medium">{a.title}</div><div className="text-2xs text-muted-foreground">{a.project?.name ?? "Company"} · requested {fmtDate(a.createdAt, locale)}</div></div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Missing submissions</CardTitle><CardDescription>Departments that have not completed their inputs</CardDescription></div></CardHeader>
          <CardContent className="p-0 sm:p-0">
            {d.missing.length === 0 ? <EmptyState title="All departments have submitted" className="m-4 border-0" /> : (
              <ul className="divide-y">{d.missing.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"><div className="min-w-0"><div className="text-sm font-medium">{m.department}</div><Link href={`/projects/${m.projectId}/inputs`} className="text-2xs text-muted-foreground hover:text-primary">{m.project}</Link></div><div className="text-end"><StatusBadge status={m.status} locale={locale} />{m.due && <div className={cn("mt-1 text-2xs", daysUntil(m.due) < 3 ? "text-danger" : "text-muted-foreground")}>due {fmtDate(m.due, locale)}</div>}</div></li>
              ))}</ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Needs attention</CardTitle><CardDescription>Blocking issues from the latest calculated plans</CardDescription></div></CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {d.issues.length === 0 && <EmptyState title="No blocking issues" className="border-0" />}
            {d.issues.slice(0, 12).map((i, k) => (
              <div key={k} className="flex gap-2 text-sm"><SeverityDot level={i.severity} /><div className="min-w-0"><div className="text-[13px]">{i.message}</div><div className="text-2xs text-muted-foreground">{i.department} · <Link href={`/projects/${i.projectId}/planning`} className="hover:text-primary">{i.project}</Link></div></div></div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Delayed tasks</CardTitle><CardDescription>Reported delays or overdue planned finish</CardDescription></div></CardHeader>
          <CardContent className="p-0 sm:p-0">
            {d.delayed.length === 0 ? <EmptyState title="No delayed tasks" className="m-4 border-0" /> : (
              <ul className="divide-y">{d.delayed.map((tk) => (
                <li key={tk.id} className="px-4 py-2.5 sm:px-5"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{tk.name}</span><StatusBadge status={tk.status} locale={locale} /></div><div className="text-2xs text-muted-foreground">{tk.project.name} · planned finish {fmtDateTime(tk.plannedEnd, locale)}{tk.isCritical && <span className="ms-1 font-semibold text-danger">· critical path</span>}</div></li>
              ))}</ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Upcoming milestones & critical tasks</CardTitle><CardDescription>Next 30 days</CardDescription></div><CalendarClock className="size-4 text-muted-foreground" /></CardHeader>
          <CardContent className="p-0 sm:p-0">
            <ul className="divide-y">{d.upcoming.map((tk) => (
              <li key={tk.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5"><div className="w-14 shrink-0 text-center"><div className="text-2xs uppercase text-muted-foreground">{fmtDate(tk.plannedStart, locale, { month: "short" })}</div><div className="font-display text-lg font-semibold leading-none">{fmtDate(tk.plannedStart, locale, { day: "2-digit" })}</div></div><div className="min-w-0"><div className="truncate text-sm font-medium">{tk.name}</div><div className="text-2xs text-muted-foreground">{tk.project.name}{tk.isMilestone ? " · milestone" : " · critical path"}</div></div></li>
            ))}</ul>
            {d.upcoming.length === 0 && <EmptyState title="No milestones in the next 30 days" className="m-4 border-0" />}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><div><CardTitle>High-priority risks</CardTitle><CardDescription>Hypothetical risks — not incidents</CardDescription></div><AlertTriangle className="size-4 text-warning" /></CardHeader>
          <CardContent className="p-0 sm:p-0">
            <ul className="divide-y">{d.risks.map((r) => (
              <li key={r.id} className="px-4 py-2.5 sm:px-5"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{r.code} {r.title}</span><span className={cn("rounded px-1.5 text-2xs font-bold", r.severity >= 16 ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>{r.severity}</span></div><div className="line-clamp-1 text-2xs text-muted-foreground">{r.project.name} · Plan B: {r.contingency}</div></li>
            ))}</ul>
            {d.risks.length === 0 && <EmptyState title="No high risks" className="m-4 border-0" />}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Procurement status</CardTitle><CardDescription>Across all active projects</CardDescription></div><Button variant="ghost" size="sm" asChild><Link href="/procurement">{t.common.open}</Link></Button></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {([["Draft / RFQ", procCount(["DRAFT", "RFQ_PREPARED"])], ["Quoted / pending approval", procCount(["QUOTED", "PENDING_APPROVAL"])], ["Approved / ordered", procCount(["APPROVED", "ORDERED", "PARTIALLY_DELIVERED"])], ["Delivered", procCount(["DELIVERED"])]] as const).map(([l, v]) => (
              <div key={l} className="rounded-md border bg-muted/40 p-3"><div className="text-2xs text-muted-foreground">{l}</div><div className="font-display text-xl font-semibold tabular">{v}</div></div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader><div><CardTitle>Budget utilisation</CardTitle><CardDescription>Planned cost by category in project currency (other currencies are listed separately on the budget page)</CardDescription></div><Button variant="ghost" size="sm" asChild><Link href="/budget">{t.nav.budget}</Link></Button></CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="min-w-0">{budgetData.length ? <StackedBar data={budgetData} keys={cats.map(label)} unit="EGP" /> : <EmptyState title="No calculated budgets yet" />}</div>
          <div className="space-y-3">
            {d.budget.map((b) => (
              <div key={b.id}><div className="flex justify-between text-xs"><span className="font-medium">{b.name}</span><span className="tabular text-muted-foreground">{b.utilization != null ? `${b.utilization}%` : "—"}</span></div><Progress value={b.utilization ?? 0} tone={(b.utilization ?? 0) > 100 ? "danger" : (b.utilization ?? 0) > 85 ? "warning" : "primary"} className="mt-1" /><div className="mt-0.5 text-2xs text-muted-foreground">{fmtMoney(b.planned, b.currency)} of {fmtMoney(b.budget, b.currency)}</div></div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
