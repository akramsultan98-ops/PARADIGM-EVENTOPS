import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { getLatestPlans } from "@/server/queries/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatusBadge, TableWrap } from "@/components/ui/kit";
import { TradesTable } from "@/components/planning/panels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Manpower planning" };

/** Cross-project crew demand per day vs headcount → double bookings / skill shortages. */
export default async function ManpowerPage() {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const [cats, assignments, projects] = await Promise.all([
    db.laborCategory.findMany({ where: { companyId: u.companyId }, include: { rates: true }, orderBy: { name: "asc" } }),
    db.laborAssignment.findMany({ where: { project: { ...projectScope(u), status: { notIn: ["CANCELLED", "COMPLETED"] } } }, include: { project: { select: { code: true, name: true } }, task: { select: { plannedStart: true, plannedEnd: true } } } }),
    db.project.findMany({ where: { ...projectScope(u), status: { notIn: ["CANCELLED", "COMPLETED"] } }, select: { id: true, name: true } }),
  ]);
  const plans = await getLatestPlans(projects.map((p) => p.id));
  const days: string[] = [];
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  for (let i = -3; i < 32; i++) days.push(new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
  // crew on a day = sum of crews whose task interval touches that day
  const demand = (catId: string, day: string) => {
    const d0 = Date.parse(`${day}T00:00:00Z`) - 2 * 3600000, d1 = d0 + 86400000;
    const list = assignments.filter((a) => a.laborCategoryId === catId && a.task?.plannedStart && a.task.plannedEnd && a.task.plannedStart.getTime() < d1 && a.task.plannedEnd.getTime() > d0);
    return { crew: list.reduce((s, a) => s + a.crewSize, 0), projects: [...new Set(list.map((a) => a.project.code))] };
  };
  const conflicts = cats.flatMap((c) => days.map((d) => ({ c, d, ...demand(c.id, d) })).filter((x) => x.crew > c.headcountAvailable));
  return (
    <>
      <PageHeader title={t.nav.manpower} description="Crew demand from all scheduled tasks versus available headcount, per trade and day. Over-allocation reveals double bookings and skill shortages." />
      {conflicts.length > 0 && <Card className="mb-5 border-danger/40"><CardHeader><CardTitle className="text-danger">{conflicts.length} over-allocated trade-day(s)</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{conflicts.slice(0, 12).map((x, i) => <div key={i}>{x.d}: <b>{x.c.name}</b> {x.crew} required vs {x.c.headcountAvailable} available ({x.projects.join(", ")})</div>)}</CardContent></Card>}
      <Card className="mb-5 min-w-0">
        <CardHeader><div><CardTitle>Daily crew load vs capacity</CardTitle><CardDescription>Cells show crew planned; red = above headcount</CardDescription></div></CardHeader>
        <TableWrap>
          <table className="w-full border-collapse text-[10px]"><thead><tr><th className="sticky start-0 z-[1] bg-card px-3 py-2 text-start text-xs">Trade (headcount)</th>{days.map((d) => <th key={d} className="min-w-[26px] font-normal text-muted-foreground">{d.slice(8)}</th>)}</tr></thead>
            <tbody>{cats.map((c) => <tr key={c.id} className="border-t"><td className="sticky start-0 z-[1] whitespace-nowrap bg-card px-3 py-1 text-xs"><span className="font-medium">{c.name}</span> <span className="text-muted-foreground">({c.headcountAvailable})</span></td>{days.map((d) => { const x = demand(c.id, d); return <td key={d} className="p-0.5"><div title={x.projects.join(", ")} className={cn("grid h-6 place-items-center rounded-sm tabular", x.crew === 0 ? "bg-muted/40 text-transparent" : x.crew > c.headcountAvailable ? "bg-danger text-white font-bold" : x.crew / c.headcountAvailable > 0.75 ? "bg-warning/60" : "bg-primary/25")}>{x.crew || "·"}</div></td>; })}</tr>)}</tbody></table>
        </TableWrap>
      </Card>
      <Card className="mb-5 min-w-0">
        <CardHeader><div><CardTitle>Labour library & productivity standards</CardTitle><CardDescription>Missing rates are requested from the standards administrator — never invented</CardDescription></div></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Trade</th><th className="num">Headcount</th><th className="num">Shift / breaks</th><th className="num">Max OT</th><th>Productivity rates</th><th>Status</th></tr></thead>
          <tbody>{cats.map((c) => <tr key={c.id}><td className="font-medium">{c.name}{c.nameAr && <span className="ms-2 text-2xs text-muted-foreground">{c.nameAr}</span>}</td><td className="num">{c.headcountAvailable}</td><td className="num">{c.dailyHours} / {c.breakHours} h</td><td className="num">{c.maxOvertimeHours} h</td><td className="text-xs">{c.rates.map((r) => `${r.activity.toLowerCase().replace(/_/g, " ")}: ${r.hoursPerUnit} h/${r.unitOfWork}`).join(" · ") || <span className="text-warning">no rates defined</span>}</td><td><StatusBadge status={c.status} locale={locale} /></td></tr>)}</tbody></table></TableWrap>
      </Card>
      {projects.filter((p) => plans.has(p.id)).map((p) => <div key={p.id} className="mb-5"><h2 className="mb-2 font-display text-sm font-semibold">{p.name}</h2><TradesTable plan={plans.get(p.id)!.plan} locale={locale} /></div>)}
      {!plans.size && <EmptyState title="No plans generated yet" />}
    </>
  );
}
