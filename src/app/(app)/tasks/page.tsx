import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatusBadge, TableWrap } from "@/components/ui/kit";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "My tasks" };

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const { show } = await searchParams;
  const all = ["SUPER_ADMIN", "PROJECT_MANAGER"].includes(u.role) && show === "all";
  const tasks = await db.task.findMany({
    where: { project: projectScope(u), status: { not: "COMPLETED" }, ...(all ? {} : { OR: [{ assignees: { some: { userId: u.id } } }, { departmentId: { in: u.departments.map((d) => d.id) } }] }) },
    include: { project: { select: { name: true, id: true } }, department: true, laborCategory: true },
    orderBy: [{ plannedStart: "asc" }], take: 300,
  });
  const now = Date.now();
  return (
    <>
      <PageHeader title={t.nav.myTasks} description={all ? "All open tasks across your projects." : `Open tasks for you and your department${u.departments.length ? ` (${u.departments.map((d) => d.name).join(", ")})` : ""}.`}
        actions={["SUPER_ADMIN", "PROJECT_MANAGER"].includes(u.role) && <Link className="text-sm font-medium text-primary" href={all ? "/tasks" : "/tasks?show=all"}>{all ? "Show my department only" : "Show all project tasks"}</Link>} />
      {tasks.length === 0 ? <EmptyState title="No open tasks" description="Tasks appear once a plan is generated for your projects." /> : (
        <Card><TableWrap><table className="data-table"><thead><tr><th>Task</th><th>Project</th><th>Dept</th><th>Start</th><th>Finish</th><th className="num">Duration</th><th className="num">Crew</th><th>Status</th><th className="num">%</th></tr></thead>
          <tbody>{tasks.map((x) => { const overdue = x.plannedEnd && x.plannedEnd.getTime() < now; return (
            <tr key={x.id} className={cn(x.isCritical && "bg-danger-soft/25")}><td className="min-w-[220px]"><div className="font-medium">{x.name}</div><div className="text-2xs text-muted-foreground">{x.wbsCode}{x.isCritical ? " · critical path" : ""}</div></td><td className="text-xs"><Link href={`/projects/${x.project.id}/timeline`} className="hover:text-primary">{x.project.name}</Link></td><td className="text-xs">{x.department?.key ?? "—"}</td><td className="whitespace-nowrap text-xs">{fmtDateTime(x.plannedStart, locale)}</td><td className={cn("whitespace-nowrap text-xs", overdue && "font-semibold text-danger")}>{fmtDateTime(x.plannedEnd, locale)}</td><td className="num">{fmtNumber(x.durationHours, 1)} h</td><td className="num">{x.crewSize ? `${x.crewSize} ${x.laborCategory?.key.toLowerCase() ?? ""}` : "—"}</td><td><StatusBadge status={x.status} locale={locale} /></td><td className="num">{x.percentComplete}</td></tr>
          ); })}</tbody></table></TableWrap></Card>
      )}
    </>
  );
}
