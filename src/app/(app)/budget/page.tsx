import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { db, num } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { getLatestPlans } from "@/server/queries/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, TableWrap } from "@/components/ui/kit";
import { Progress } from "@/components/ui/progress";
import { BudgetPanel } from "@/components/planning/panels";
import { fmtMoney } from "@/lib/format";
import { ProjectPicker } from "../_project-picker";

export const metadata = { title: "Budget" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requirePermission("budget.read");
  const { t, locale } = await getDict();
  const { project } = await searchParams;
  const projects = await db.project.findMany({ where: { ...projectScope(u), status: { notIn: ["CANCELLED"] } }, orderBy: { eventStart: "asc" } });
  const plans = await getLatestPlans(projects.map((p) => p.id));
  const rates = await db.exchangeRate.findMany({ where: { companyId: u.companyId }, orderBy: { rateDate: "desc" } });
  const current = projects.find((p) => p.id === project);
  return (
    <>
      <PageHeader title={t.nav.budget} description="Planned cost versus budget per project. Actuals, approved quotes, pending quotes and estimates are separated; currencies are never combined without an approved rate." />
      <Card className="mb-5 min-w-0">
        <CardHeader><CardTitle>Portfolio</CardTitle></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Project</th><th className="num">Budget</th><th className="num">Planned (budget currency)</th><th className="num">Variance</th><th className="w-40">Utilisation</th><th>Other currencies</th></tr></thead>
          <tbody>{projects.map((p) => { const b = plans.get(p.id)?.plan.budget; return <tr key={p.id}><td><Link href={`/budget?project=${p.id}`} className="font-medium hover:text-primary">{p.name}</Link></td><td className="num">{fmtMoney(num(p.budgetAmount), p.currency, locale)}</td><td className="num">{fmtMoney(b?.totalInBudgetCurrency, p.currency, locale)}</td><td className={`num ${(b?.variance ?? 0) < 0 ? "text-danger" : ""}`}>{fmtMoney(b?.variance, p.currency, locale)}</td><td>{b?.utilizationPct != null ? <><Progress value={b.utilizationPct} tone={b.utilizationPct > 100 ? "danger" : "primary"} /><div className="text-2xs">{b.utilizationPct}%</div></> : "—"}</td><td className="text-xs">{b?.byCurrency.filter((c) => c.currency !== p.currency).map((c) => fmtMoney(c.total, c.currency, locale)).join(", ") || "—"}</td></tr>; })}</tbody></table></TableWrap>
      </Card>
      <Card className="mb-5"><CardHeader><div><CardTitle>Exchange rates in use</CardTitle><CardDescription>Source and date are shown wherever a conversion is applied</CardDescription></div></CardHeader><CardContent className="space-y-1 text-sm">{rates.map((r) => <div key={r.id}>1 {r.fromCurrency} = {r.rate} {r.toCurrency} · {r.source} · {r.rateDate.toISOString().slice(0, 10)}</div>)}{!rates.length && "No exchange rates stored."}</CardContent></Card>
      <ProjectPicker base="/budget" projects={projects.map((p) => ({ id: p.id, name: p.name }))} current={current?.id} />
      {current ? (plans.get(current.id) ? <BudgetPanel plan={plans.get(current.id)!.plan} locale={locale} /> : <EmptyState title="No plan for this project" />) : <EmptyState title="Select a project for the detailed cost breakdown" />}
    </>
  );
}
