import { CheckCircle2, CircleHelp, History, Lightbulb } from "lucide-react";
import { db, num } from "@/lib/db";
import { projectContext } from "@/server/queries/project";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatCard, StatusBadge, TableWrap } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { IssuesPanel } from "@/components/planning/panels";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { ChangeRequestDialog, WhatIfForm } from "./forms";
import { DecisionButtons } from "./approve-plan";
import type { ChangeImpact } from "@/engines/impact";
import { canReadFinancials, redactChangeEntries, redactImpact } from "@/lib/financial";
import { cn } from "@/lib/utils";

type SimResult = { notes: string[]; impact: ChangeImpact; recommendations: string[]; baseline: { setupSlackHours: number | null; cost: { currency: string; total: number }[] }; scenario: { setupSlackHours: number | null; cost: { currency: string; total: number }[]; feasible: boolean } };

export async function PlanningTab({ id }: { id: string }) {
  const { u, locale, project: p, plan } = await projectContext(id);
  const [versions, rawSims, rawChanges, approval, items, vehicles, pendingSubs] = await Promise.all([
    db.scheduleVersion.findMany({ where: { projectId: id }, select: { id: true, version: true, label: true, status: true, feasible: true, makespanHours: true, createdAt: true, approvedAt: true }, orderBy: { version: "desc" } }),
    db.scenarioSimulation.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.projectChange.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    db.approval.findFirst({ where: { projectId: id, entityType: "PLAN", status: "PENDING" } }),
    db.productionItem.findMany({ where: { projectId: id }, select: { id: true, code: true, name: true, widthM: true, heightM: true, depthM: true, quantity: true }, orderBy: { code: "asc" } }),
    db.vehicle.findMany({ where: { companyId: u.companyId }, select: { id: true, code: true, available: true } }),
    db.departmentSubmission.findMany({ where: { projectId: id, status: { in: ["DRAFT", "NEEDS_INFORMATION", "SUBMITTED", "UNDER_REVIEW"] } }, include: { department: true } }),
  ]);
  const fin = canReadFinancials(u);
  const sims = fin ? rawSims : rawSims.map((s) => ({ ...s, result: redactImpact(s.result) }));
  const changes = fin ? rawChanges : rawChanges.map((c) => ({ ...c, impact: redactImpact(c.impact), changes: redactChangeEntries(c.changes) }));
  const P = plan?.plan;
  const questions = P ? Object.entries(P.readiness.questions.reduce<Record<string, string[]>>((acc, q) => { (acc[q.department] ??= []).push(q.question); return acc; }, {})) : [];
  return (
    <div className="space-y-5">
      {!P ? <EmptyState title="No plan generated yet" description="Use “Generate plan” to run department inputs through the deterministic engines: BOQ, manpower, AV, logistics, accommodation, schedule, procurement, budget and risk." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <StatCard label="Plan version" value={`v${plan!.version}`} sub={plan!.status.replace("_", " ").toLowerCase()} icon={History} />
            <StatCard label="Errors" value={P.readiness.errors} tone={P.readiness.errors ? "danger" : "success"} />
            <StatCard label="Warnings" value={P.readiness.warnings} tone={P.readiness.warnings ? "warning" : "success"} />
            <StatCard label="Tasks / critical" value={`${P.tasks.length} / ${P.schedule.criticalPath.length}`} />
            <StatCard label="Schedule" value={P.schedule.feasible ? "Feasible" : "Conflicts"} tone={P.schedule.feasible ? "success" : "danger"} icon={CheckCircle2} />
            <StatCard label="Calculations" value={P.traces.length} sub="traceable records" />
          </div>
          {approval && (
            <Card className="border-violet/40 bg-violet-soft/30">
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="font-semibold">{approval.title}</div><div className="text-xs text-muted-foreground">{approval.description}{pendingSubs.length > 0 && <span className="text-danger"> · Technical approvals outstanding: {[...new Set(pendingSubs.map((s) => s.department.name))].join(", ")}</span>}</div></div>
                {u.permissions.has("plan.approve") ? <DecisionButtons approvalId={approval.id} title={`Plan v${plan!.version}`} errors={P.readiness.errors} entityType="PLAN" /> : <Badge variant="violet">Awaiting Project Manager approval</Badge>}
              </CardContent>
            </Card>
          )}
          <div className="grid gap-5 xl:grid-cols-2">
            <IssuesPanel issues={P.issues} limit={30} />
            <Card className="min-w-0">
              <CardHeader><div><CardTitle className="flex items-center gap-2"><CircleHelp className="size-4 text-primary" />Clarification requests by department</CardTitle><CardDescription>Generated from missing data — sent to each department as notifications</CardDescription></div></CardHeader>
              <CardContent className="max-h-[420px] space-y-4 overflow-y-auto">
                {questions.map(([dept, qs]) => <div key={dept}><div className="section-title mb-1">{dept}</div><ul className="space-y-1">{qs.map((q, i) => <li key={i} className="rounded-md bg-accent/50 px-3 py-1.5 text-sm">{q}</li>)}</ul></div>)}
                {!questions.length && <EmptyState title="No open questions" className="border-0" />}
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader><div><CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-primary" />What-if simulation</CardTitle><CardDescription>Runs on a copy of the plan. The approved baseline is never changed.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            {u.permissions.has("plan.review") ? <WhatIfForm projectId={id} /> : <p className="text-xs text-muted-foreground">Requires plan review permission.</p>}
            {sims.map((s) => {
              const r = s.result as unknown as SimResult;
              return (
                <div key={s.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-semibold">{s.question}</div><span className="text-2xs text-muted-foreground">{fmtDateTime(s.createdAt, locale)}</span></div>
                  <div className="mt-1 text-xs text-muted-foreground">{r.notes.join(" · ")}</div>
                  <div className="mt-2 text-sm">{r.impact.summary}</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div className="rounded bg-muted/50 p-2 text-xs"><div className="text-muted-foreground">Setup slack</div><div className="font-semibold">{r.baseline.setupSlackHours ?? "—"} h → <span className={cn((r.scenario.setupSlackHours ?? 0) < (r.baseline.setupSlackHours ?? 0) && "text-danger")}>{r.scenario.setupSlackHours ?? "—"} h</span></div></div>
                    {r.scenario.cost.map((c) => <div key={c.currency} className="rounded bg-muted/50 p-2 text-xs"><div className="text-muted-foreground">Cost {c.currency}</div><div className="font-semibold">{fmtNumber(r.baseline.cost.find((x) => x.currency === c.currency)?.total ?? 0)} → {fmtNumber(c.total)}</div></div>)}
                    <div className="rounded bg-muted/50 p-2 text-xs"><div className="text-muted-foreground">Schedule</div><div className={cn("font-semibold", !r.scenario.feasible && "text-danger")}>{r.scenario.feasible ? "feasible" : "conflicts"}</div></div>
                  </div>
                  {r.impact.domains.filter((d) => d.changed).length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">Affected domains ({r.impact.domains.filter((d) => d.changed).length})</summary><div className="mt-2 space-y-2">{r.impact.domains.filter((d) => d.changed).map((d) => <div key={d.domain}><div className="font-semibold">{d.domain}</div>{d.deltas.map((x, i) => <div key={i} className="flex justify-between gap-2"><span>{x.label}</span><span className="tabular">{String(x.before ?? "—")} → {String(x.after ?? "—")} {x.unit ?? ""}</span></div>)}{d.notes.map((n, i) => <div key={i} className="text-muted-foreground">{n}</div>)}</div>)}</div></details>}
                  {r.recommendations.length > 0 && <ul className="mt-2 list-disc space-y-0.5 ps-5 text-xs">{r.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Change requests</CardTitle><CardDescription>Impact on materials, labour, equipment, transport, accommodation, schedule, budget, procurement and risk</CardDescription></div>{u.permissions.has("submission.create") && <ChangeRequestDialog projectId={id} items={items} vehicles={vehicles} project={{ participants: p.participants, budget: num(p.budgetAmount) }} />}</CardHeader>
          <CardContent className="space-y-3">
            {changes.map((c) => {
              const imp = c.impact as unknown as ChangeImpact | null;
              return (
                <div key={c.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{c.title}</span><StatusBadge status={c.status} locale={locale} /></div>
                  <div className="mt-1 text-xs text-muted-foreground">{(c.changes as { field: string; from: unknown; to: unknown }[]).map((x) => `${x.field}: ${String(x.from ?? "—")} → ${String(x.to)}`).join(" · ")}</div>
                  {imp && <><div className="mt-2 text-sm">{imp.summary}</div><div className="mt-1 flex flex-wrap gap-1">{imp.approvalsRequired.map((a) => <Badge key={a} variant="violet">{a}</Badge>)}</div></>}
                </div>
              );
            })}
            {changes.length === 0 && <EmptyState title="No change requests" className="border-0" />}
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader><div><CardTitle>Plan version history</CardTitle><CardDescription>Every generation is stored with its full calculations; approved versions are never overwritten</CardDescription></div></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Version</th><th>Label</th><th>Status</th><th>Feasible</th><th className="num">Makespan</th><th>Created</th><th>Approved</th></tr></thead>
          <tbody>{versions.map((v) => <tr key={v.id}><td className="font-semibold">v{v.version}</td><td>{v.label}</td><td><StatusBadge status={v.status} locale={locale} /></td><td>{v.feasible ? "yes" : <span className="text-danger">no</span>}</td><td className="num">{fmtNumber(v.makespanHours, 0)} h</td><td className="text-xs">{fmtDateTime(v.createdAt, locale)}</td><td className="text-xs">{fmtDateTime(v.approvedAt, locale)}</td></tr>)}</tbody></table></TableWrap>
      </Card>
    </div>
  );
}
