import { FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { getLatestPlans } from "@/server/queries/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatusBadge, EmptyState } from "@/components/ui/kit";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Reports" };
const DEPT_SHEETS = [["production", "Production"], ["av", "AV & equipment"], ["logistics", "Transport"], ["accommodation", "Rooming"], ["procurement", "Procurement"], ["budget", "Budget"], ["risks", "Risks"]];

export default async function ReportsPage() {
  const u = await requirePermission("export.run");
  const { t, locale } = await getDict();
  const projects = await db.project.findMany({ where: { ...projectScope(u), status: { notIn: ["CANCELLED"] } }, orderBy: { eventStart: "asc" } });
  const plans = await getLatestPlans(projects.map((p) => p.id));
  return (
    <>
      <PageHeader title={t.nav.reports} description="Master Excel workbook (20 sheets), department exports, PDF plan reports and CSV extracts. Exports contain calculated data only — missing data is shown as missing, never filled in." />
      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((p) => {
          const pl = plans.get(p.id);
          return (
            <Card key={p.id} className="min-w-0">
              <CardHeader><div className="min-w-0"><CardTitle className="truncate">{p.name}</CardTitle><CardDescription>{p.code} · {pl ? `plan v${pl.version} (${pl.status.toLowerCase().replace("_", " ")})` : "no plan yet"}</CardDescription></div><StatusBadge status={p.status} locale={locale} /></CardHeader>
              <CardContent className="space-y-3">
                {pl ? <>
                  <div className="flex flex-wrap gap-2"><Button asChild><a href={`/api/projects/${p.id}/workbook`}><FileSpreadsheet />Master workbook (.xlsx)</a></Button><Button variant="outline" asChild><a href={`/api/projects/${p.id}/report`}><FileText />PDF report</a></Button><Button variant="outline" asChild><a href={`/api/projects/${p.id}/tasks.csv`}><Table2 />Tasks CSV</a></Button></div>
                  <div className="flex flex-wrap gap-1.5">{DEPT_SHEETS.map(([k, l]) => <a key={k} href={`/api/projects/${p.id}/workbook?sheets=${k}`} className="rounded-full border px-2.5 py-1 text-2xs hover:bg-muted">{l}</a>)}</div>
                </> : <p className="text-xs text-muted-foreground">Generate the plan to enable exports.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!projects.length && <EmptyState title="No projects" />}
      {u.permissions.has("audit.read") && <Card className="mt-5"><CardHeader><div><CardTitle>Audit report</CardTitle><CardDescription>Company-wide audit log (last 5,000 entries)</CardDescription></div><Button variant="outline" asChild><a href="/api/audit.csv">Download CSV</a></Button></CardHeader></Card>}
    </>
  );
}
