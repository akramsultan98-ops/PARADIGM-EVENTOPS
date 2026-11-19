import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { redactRecords } from "@/lib/financial";
import { db, num } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { getLatestPlans } from "@/server/queries/plans";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatusBadge, TableWrap } from "@/components/ui/kit";
import { Progress } from "@/components/ui/progress";
import { daysUntil, fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Projects" };
const STATUSES = ["LEAD", "PLANNING", "AWAITING_INPUTS", "UNDER_REVIEW", "APPROVED", "IN_PREPARATION", "IN_EXECUTION", "COMPLETED", "CANCELLED"];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const { status, q } = await searchParams;
  const projects = redactRecords(u, await db.project.findMany({
    where: { ...projectScope(u), ...(status ? { status: status as never } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { client: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { departments: true, projectManager: { select: { name: true } }, venue: { select: { name: true } } },
    orderBy: { eventStart: "asc" },
  }));
  const plans = await getLatestPlans(projects.map((p) => p.id));
  return (
    <>
      <PageHeader title={t.nav.projects} description="Every event is one connected project — department inputs, calculations, schedule, approvals and execution."
        actions={u.permissions.has("project.create") && <Button asChild><Link href="/projects/new"><Plus />{t.header.newProject}</Link></Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex-1 sm:max-w-xs"><input name="q" defaultValue={q} placeholder="Search name, client or code…" className="h-9 w-full rounded-md border bg-card px-3 text-sm" />{status && <input type="hidden" name="status" value={status} />}</form>
        <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
          <Link href="/projects" className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", !status ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{t.common.all}</Link>
          {STATUSES.map((s) => <Link key={s} href={`/projects?status=${s}`} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}><StatusLabel s={s} locale={locale} /></Link>)}
        </div>
      </div>
      {projects.length === 0 ? <EmptyState title="No projects found" action={u.permissions.has("project.create") ? <Button asChild size="sm"><Link href="/projects/new">Create a project</Link></Button> : undefined} /> : (
        <Card>
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Project</th><th>Location / venue</th><th>Setup → event</th><th className="num">Participants</th><th>Status</th><th className="num">Readiness</th><th>Plan</th><th className="num">Budget</th><th>PM</th></tr></thead>
              <tbody>{projects.map((p) => {
                const pl = plans.get(p.id);
                const ready = p.departments.length ? Math.round((p.departments.filter((d) => d.status === "APPROVED").length / p.departments.length) * 100) : 0;
                const days = daysUntil(p.eventStart);
                return (
                  <tr key={p.id}>
                    <td className="min-w-[220px]"><Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">{p.name}</Link><div className="text-2xs text-muted-foreground">{p.code} · {p.client}{p.isDemo && <span className="ms-1 font-semibold text-warning">· DEMO</span>}</div></td>
                    <td className="text-xs">{p.location}<div className="text-2xs text-muted-foreground">{p.venue?.name ?? "venue TBC"}</div></td>
                    <td className="whitespace-nowrap text-xs">{fmtDate(p.setupStart, locale, { day: "2-digit", month: "short" })} → {fmtDate(p.eventStart, locale)}<div className={cn("text-2xs", days >= 0 && days <= 7 ? "text-danger" : "text-muted-foreground")}>{days >= 0 ? `in ${days} days` : "past"}</div></td>
                    <td className="num">{p.participants}</td>
                    <td><StatusBadge status={p.status} locale={locale} /></td>
                    <td className="num w-28"><div className="text-xs">{ready}%</div><Progress value={ready} className="mt-1" tone={ready === 100 ? "success" : "primary"} /></td>
                    <td className="whitespace-nowrap text-xs">{pl ? <>v{pl.version} <StatusBadge status={pl.status} locale={locale} /></> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="num text-xs">{fmtMoney(num(p.budgetAmount), p.currency, locale)}</td>
                    <td className="text-xs">{p.projectManager?.name ?? "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

function StatusLabel({ s, locale }: { s: string; locale: "en" | "ar" }) {
  return <>{(locale === "ar" ? undefined : s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())) ?? s}</>;
}
