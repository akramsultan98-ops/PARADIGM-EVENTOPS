import { requireUser } from "@/lib/auth/session";
import { canReadFinancials } from "@/lib/financial";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { actualVsPlanned } from "@/server/queries/execution";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, TableWrap, DemoBanner } from "@/components/ui/kit";
import { GroupedBar } from "@/components/charts/charts";
import { fmtNumber } from "@/lib/format";
import { ProjectPicker } from "../../_project-picker";
import { cn } from "@/lib/utils";

export const metadata = { title: "Actual vs planned" };

export default async function AvpPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requireUser();
  const { project } = await searchParams;
  const projects = await db.project.findMany({ where: { ...projectScope(u), scheduleVersions: { some: { status: "APPROVED" } } }, orderBy: { eventStart: "asc" } });
  const current = projects.find((p) => p.id === project) ?? projects[0];
  const historical = await db.historicalEvent.findMany({ where: { companyId: u.companyId }, orderBy: { eventDate: "desc" } });
  const avp = current ? await actualVsPlanned(current.id, canReadFinancials(u)) : null;
  return (
    <>
      <PageHeader eyebrow="Learning loop" title="Actual vs planned" description="Accuracy per category = 100% − |actual − planned| ÷ planned. Failed estimates are shown, not hidden. Accuracy claims require a representative validation dataset (see docs/ACCURACY_VALIDATION.md)." />
      <ProjectPicker base="/execution/actual-vs-planned" projects={projects.map((p) => ({ id: p.id, name: p.name }))} current={current?.id} />
      {!avp || !avp.rows.length ? <EmptyState title="No actuals recorded yet" description="Record actual consumption and complete tasks on the Live Execution board." /> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{avp.groups.map((g) => <Card key={g.group}><CardContent className="p-4"><div className="text-2xs uppercase tracking-wider text-muted-foreground">{g.group}</div><div className="font-display text-2xl font-semibold">{g.meanAccuracyPct ?? "—"}%</div><div className="text-2xs text-muted-foreground">mean accuracy · {g.withinTolerance}/{g.count} within ±5%</div></CardContent></Card>)}</div>
          <Card className="min-w-0"><CardHeader><CardTitle>Planned vs actual quantities</CardTitle></CardHeader><CardContent><GroupedBar data={avp.rows.filter((r) => r.group !== "Duration").slice(0, 14).map((r) => ({ name: r.category.split(":").slice(1).join(":").slice(0, 16), planned: r.planned, actual: r.actual }))} keys={[{ key: "planned", label: "Planned" }, { key: "actual", label: "Actual" }]} /></CardContent></Card>
          <Card className="min-w-0"><CardHeader><div><CardTitle>Detail</CardTitle><CardDescription>Baseline: approved plan v{avp.approved?.version}</CardDescription></div></CardHeader>
            <TableWrap><table className="data-table"><thead><tr><th>Group</th><th>Item</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Variance</th><th className="num">Variance %</th><th className="num">Accuracy</th></tr></thead>
              <tbody>{avp.rows.map((r, i) => <tr key={i}><td className="text-xs">{r.group}</td><td>{r.description}</td><td className="num">{fmtNumber(r.planned, 2)} <span className="text-2xs text-muted-foreground">{r.unit}</span></td><td className="num">{fmtNumber(r.actual, 2)}</td><td className={cn("num", r.variance > 0 ? "text-danger" : r.variance < 0 ? "text-success" : "")}>{r.variance > 0 ? "+" : ""}{fmtNumber(r.variance, 2)}</td><td className={cn("num", Math.abs(r.variancePct ?? 0) > 10 && "font-semibold text-danger")}>{r.variancePct != null ? `${r.variancePct > 0 ? "+" : ""}${r.variancePct}%` : "—"}</td><td className="num">{r.accuracyPct != null ? `${r.accuracyPct}%` : "—"}</td></tr>)}</tbody></table></TableWrap>
          </Card>
          <Card><CardContent className="text-xs text-muted-foreground">When variances are systematic, the platform proposes company-standard changes (e.g. productivity rates) to the Super Admin in the Approval Center. Standards never change automatically.</CardContent></Card>
        </div>
      )}
      <Card className="mt-5 min-w-0">
        <CardHeader><div><CardTitle>Historical events</CardTitle><CardDescription>Planned vs actual from previous projects (imported records)</CardDescription></div></CardHeader>
        <CardContent className="space-y-4"><DemoBanner />{historical.map((h) => { const m = h.metrics as { category: string; planned: number; actual: number; unit: string }[]; return <div key={h.id}><div className="text-sm font-semibold">{h.name}</div><div className="mb-1 text-2xs text-muted-foreground">{h.location} · {h.participants} participants · {h.lessonsLearned}</div><TableWrap><table className="data-table"><tbody>{m.map((x) => { const v = ((x.actual - x.planned) / x.planned) * 100; return <tr key={x.category}><td>{x.category}</td><td className="num">{fmtNumber(x.planned)} {x.unit}</td><td className="num">{fmtNumber(x.actual)}</td><td className={cn("num", Math.abs(v) > 10 && "text-danger font-semibold")}>{v > 0 ? "+" : ""}{v.toFixed(1)}%</td></tr>; })}</tbody></table></TableWrap></div>; })}</CardContent>
      </Card>
    </>
  );
}
