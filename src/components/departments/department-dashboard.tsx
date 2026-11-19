import Link from "next/link";
import { Bell, ClipboardList, FilePen, FolderKanban } from "lucide-react";
import type { AuthUser } from "@/lib/auth/session";
import { getDict } from "@/i18n/server";
import { myWork } from "@/server/queries/departments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatusBadge } from "@/components/ui/kit";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { AccommodationWorkspace, AccountWorkspace, AvWorkspace, CreativeWorkspace, LogisticsWorkspace, ProcurementWorkspace, ProductionWorkspace } from "./workspaces";

const ROLE_DEPT: Record<string, string> = { PRODUCTION_MANAGER: "PRODUCTION", AV_MANAGER: "AV", LOGISTICS_MANAGER: "LOGISTICS", ACCOMMODATION_MANAGER: "ACCOMMODATION", CREATIVE_MANAGER: "CREATIVE", PROCUREMENT_MANAGER: "PROCUREMENT", ACCOUNT_MANAGER: "ACCOUNT" };
const WORKSPACE_DEPTS = ["PRODUCTION", "AV", "LOGISTICS", "ACCOMMODATION", "CREATIVE", "PROCUREMENT", "ACCOUNT"];

/** Department whose workspace is this user's home dashboard (null → Project Manager dashboard). */
export function departmentForUser(u: AuthUser): string | null {
  if (ROLE_DEPT[u.role]) return ROLE_DEPT[u.role];
  if (u.role === "DEPARTMENT_MEMBER") return u.departments.find((d) => WORKSPACE_DEPTS.includes(d.key))?.key ?? null;
  return null;
}

export async function DepartmentWorkspace({ user, dept, projectId }: { user: AuthUser; dept: string; projectId?: string }) {
  switch (dept) {
    case "PRODUCTION": return <ProductionWorkspace user={user} projectId={projectId} />;
    case "AV": return <AvWorkspace user={user} projectId={projectId} />;
    case "LOGISTICS": return <LogisticsWorkspace user={user} projectId={projectId} />;
    case "ACCOMMODATION": return <AccommodationWorkspace user={user} projectId={projectId} />;
    case "CREATIVE": return <CreativeWorkspace user={user} projectId={projectId} />;
    case "PROCUREMENT": return <ProcurementWorkspace user={user} projectId={projectId} />;
    case "ACCOUNT": return <AccountWorkspace user={user} projectId={projectId} />;
    default: return null;
  }
}

export async function DepartmentDashboard({ user, dept }: { user: AuthUser; dept: string }) {
  return (
    <>
      <MyWorkStrip user={user} />
      <DepartmentWorkspace user={user} dept={dept} />
    </>
  );
}

/** Personal summary: assigned projects, tasks, deadlines, pending submissions, notifications. */
export async function MyWorkStrip({ user }: { user: AuthUser }) {
  const { locale } = await getDict();
  const w = await myWork(user);
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="min-w-0">
        <CardHeader className="py-2.5"><CardTitle className="flex items-center gap-2 text-xs"><FolderKanban className="size-4 text-primary" />My projects</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 p-3 sm:p-3">
          {w.assigned.slice(0, 4).map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between gap-2 rounded px-1 text-sm hover:bg-muted"><span className="truncate">{p.name}</span><span className="shrink-0 text-2xs text-muted-foreground">{fmtDate(p.eventStart, locale, { day: "2-digit", month: "short" })}</span></Link>)}
          {w.assigned.length === 0 && <div className="text-xs text-muted-foreground">No assigned projects</div>}
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader className="py-2.5"><CardTitle className="flex items-center gap-2 text-xs"><ClipboardList className="size-4 text-primary" />My tasks & deadlines</CardTitle><Link href="/tasks" className="text-2xs text-primary">All</Link></CardHeader>
        <CardContent className="space-y-1.5 p-3 sm:p-3">
          {w.tasks.slice(0, 4).map((t) => <div key={t.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{t.name}</span><span className="shrink-0 text-2xs text-muted-foreground">{fmtDateTime(t.plannedStart, locale)}</span></div>)}
          {w.tasks.length === 0 && <div className="text-xs text-muted-foreground">Nothing due in the next 3 weeks</div>}
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader className="py-2.5"><CardTitle className="flex items-center gap-2 text-xs"><FilePen className="size-4 text-primary" />Required information</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 p-3 sm:p-3">
          {w.drafts.slice(0, 4).map((s) => <Link key={s.id} href={`/projects/${s.project.id}/inputs?submission=${s.id}`} className="flex items-center justify-between gap-2 rounded px-1 text-sm hover:bg-muted"><span className="truncate">{s.title}</span><StatusBadge status={s.status} locale={locale} /></Link>)}
          {w.drafts.length === 0 && <div className="text-xs text-muted-foreground">No pending submissions</div>}
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader className="py-2.5"><CardTitle className="flex items-center gap-2 text-xs"><Bell className="size-4 text-primary" />Notifications</CardTitle><Link href="/notifications" className="text-2xs text-primary">All</Link></CardHeader>
        <CardContent className="space-y-1.5 p-3 sm:p-3">
          {w.notes.slice(0, 4).map((n) => <Link key={n.id} href={n.link ?? "/notifications"} className="block truncate rounded px-1 text-sm hover:bg-muted">{n.title}</Link>)}
          {w.notes.length === 0 && <EmptyState title="No notifications" className="border-0 p-2" />}
        </CardContent>
      </Card>
    </div>
  );
}
