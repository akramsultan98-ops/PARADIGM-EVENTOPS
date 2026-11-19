import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { getLatestPlans } from "@/server/queries/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/kit";
import { Gantt } from "@/components/planning/gantt";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { ProjectPicker } from "../_project-picker";

export const metadata = { title: "Planning & scheduling" };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const { project } = await searchParams;
  const projects = await db.project.findMany({ where: { ...projectScope(u), status: { notIn: ["CANCELLED", "COMPLETED"] } }, orderBy: { eventStart: "asc" } });
  const plans = await getLatestPlans(projects.map((p) => p.id));
  const current = projects.find((p) => p.id === project) ?? projects.find((p) => plans.has(p.id)) ?? projects[0];
  const tasks = current ? await db.task.findMany({ where: { projectId: current.id }, include: { department: true, laborCategory: true, successors: true }, orderBy: { plannedStart: "asc" } }) : [];
  const pl = current ? plans.get(current.id) : null;
  return (
    <>
      <PageHeader title={t.nav.planning} description="Master timeline, department timelines, critical path, milestones and resource contention. Open a project's Master Planning tab to generate, simulate or approve."
        actions={current && <Button asChild><Link href={`/projects/${current.id}/planning`}>Master planning for {current.name}</Link></Button>} />
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {projects.map((p) => { const x = plans.get(p.id); return (
          <Link key={p.id} href={`/planning?project=${p.id}`} className={`rounded-lg border bg-card p-4 shadow-card hover:border-primary/40 ${current?.id === p.id ? "ring-2 ring-primary/40" : ""}`}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium">{p.name}</div><div className="text-2xs text-muted-foreground">{fmtDate(p.setupStart, locale)} → {fmtDate(p.eventEnd, locale)}</div></div><StatusBadge status={p.status} locale={locale} /></div>
            <div className="mt-2 text-xs">{x ? <>Plan v{x.version} · {x.plan.tasks.length} tasks · <span className={x.plan.schedule.feasible ? "text-success" : "text-danger"}>{x.plan.schedule.feasible ? "feasible" : `${x.plan.schedule.conflicts.filter((c) => c.severity === "error").length} conflicts`}</span></> : <span className="text-muted-foreground">No plan yet</span>}</div>
          </Link>
        ); })}
      </div>
      <ProjectPicker base="/planning" projects={projects.map((p) => ({ id: p.id, name: p.name }))} current={current?.id} />
      {tasks.length ? <Gantt now={new Date().toISOString()} deps={tasks.flatMap((t) => t.successors.map((s) => ({ from: t.id, to: s.successorId, type: s.type })))} tasks={tasks.map((t) => ({ id: t.id, wbs: t.wbsCode, name: t.name, department: t.department?.key ?? null, phase: t.phase, start: t.plannedStart?.toISOString() ?? null, finish: t.plannedEnd?.toISOString() ?? null, actualStart: t.actualStart?.toISOString() ?? null, actualEnd: t.actualEnd?.toISOString() ?? null, critical: t.isCritical, milestone: t.isMilestone, status: t.status, percent: t.percentComplete, floatHours: t.totalFloatH, crew: t.crewSize, trade: t.laborCategory?.name ?? null }))} /> : <EmptyState title="No scheduled tasks" />}
      {pl && pl.plan.schedule.conflicts.length > 0 && (
        <Card className="mt-5"><CardHeader><div><CardTitle>Scheduling conflicts & resource contention</CardTitle><CardDescription>Explanations from the scheduler — no task is dropped to make the schedule look feasible</CardDescription></div></CardHeader>
          <CardContent className="space-y-1.5">{pl.plan.schedule.conflicts.map((c, i) => <div key={i} className="flex gap-2 text-sm"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${c.severity === "error" ? "bg-danger" : "bg-warning"}`} /><span><span className="text-2xs font-semibold uppercase text-muted-foreground">{c.type.replace("_", " ")}</span> {c.message}</span></div>)}</CardContent></Card>
      )}
    </>
  );
}
