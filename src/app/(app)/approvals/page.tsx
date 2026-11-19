import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { pendingApprovalsWhere } from "@/server/services/approvals";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatusBadge, TableWrap } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { DecisionButtons } from "@/components/project/approve-plan";
import { fmtDateTime } from "@/lib/format";
import type { PlanResult } from "@/engines/pipeline";

export const metadata = { title: "Approval center" };

export default async function ApprovalsPage() {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const [pending, recent] = await Promise.all([
    db.approval.findMany({ where: pendingApprovalsWhere(u), include: { project: { select: { name: true, id: true } } }, orderBy: { createdAt: "asc" } }),
    db.approval.findMany({ where: { companyId: u.companyId, status: { not: "PENDING" } }, include: { project: { select: { name: true } } }, orderBy: { decidedAt: "desc" }, take: 25 }),
  ]);
  const planErrors = new Map<string, number>();
  for (const a of pending.filter((x) => x.entityType === "PLAN")) { const v = await db.scheduleVersion.findUnique({ where: { id: a.entityId } }); if (v) planErrors.set(a.id, (v.snapshot as unknown as PlanResult).readiness.errors); }
  const users = new Map((await db.user.findMany({ where: { companyId: u.companyId }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const link = (a: (typeof pending)[number]) => a.project ? (a.entityType === "SUBMISSION" ? `/projects/${a.project.id}/inputs?submission=${a.entityId}` : a.entityType === "PLAN" || a.entityType === "CHANGE" ? `/projects/${a.project.id}/planning` : a.entityType === "PROCUREMENT" ? `/procurement?project=${a.project.id}` : `/projects/${a.project.id}/budget`) : "/knowledge";
  return (
    <>
      <PageHeader title={t.nav.approvals} description="Decisions waiting for your role. Technical approvals belong to department managers, the integrated plan to the Project Manager, costs to Finance, company standards to the Super Admin." />
      <Card className="mb-5 min-w-0">
        <CardHeader><div><CardTitle>Waiting for you ({pending.length})</CardTitle><CardDescription>Role: {u.roleName}</CardDescription></div></CardHeader>
        {pending.length === 0 ? <EmptyState title="Nothing to approve" className="m-4" /> : (
          <div className="divide-y">{pending.map((a) => (
            <div key={a.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="violet">{a.entityType}</Badge><Link href={link(a)} className="font-medium hover:text-primary">{a.title}</Link></div><div className="mt-1 text-xs text-muted-foreground">{a.description}{a.description ? " · " : ""}{a.project?.name ?? "Company"} · requested by {users.get(a.requestedById ?? "") ?? "system"} {fmtDateTime(a.createdAt, locale)}</div>{planErrors.get(a.id) ? <div className="mt-1 text-xs text-danger">{planErrors.get(a.id)} open error(s) in this plan version</div> : null}</div>
              <DecisionButtons approvalId={a.id} title={a.title} entityType={a.entityType} errors={planErrors.get(a.id) ?? 0} />
            </div>
          ))}</div>
        )}
      </Card>
      <Card className="min-w-0"><CardHeader><CardTitle>Recent decisions</CardTitle></CardHeader>
        <TableWrap><table className="data-table"><thead><tr><th>Type</th><th>Item</th><th>Project</th><th>Decision</th><th>By</th><th>When</th><th>Note</th></tr></thead><tbody>{recent.map((a) => <tr key={a.id}><td><Badge variant="secondary">{a.entityType}</Badge></td><td>{a.title}</td><td className="text-xs">{a.project?.name ?? "—"}</td><td><StatusBadge status={a.status} locale={locale} /></td><td className="text-xs">{users.get(a.approverId ?? "") ?? "—"}</td><td className="whitespace-nowrap text-xs">{fmtDateTime(a.decidedAt, locale)}</td><td className="text-xs text-muted-foreground">{a.decisionNote}</td></tr>)}</tbody></table></TableWrap>
      </Card>
    </>
  );
}
