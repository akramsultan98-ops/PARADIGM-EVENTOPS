import Link from "next/link";
import { FileText, Image as ImageIcon } from "lucide-react";
import { db } from "@/lib/db";
import { projectContext } from "@/server/queries/project";
import { executionData } from "@/server/queries/execution";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatusBadge, TableWrap } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { ExecutionBoard } from "@/components/execution/execution-board";
import { UploadForm } from "@/components/execution/upload";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { RiskEditor } from "./forms";
import { CommentBox } from "./comment-box";
import { DecisionButtons } from "./approve-plan";
import { cn } from "@/lib/utils";

export async function RisksTab({ id }: { id: string }) {
  const { u, locale } = await projectContext(id);
  const risks = await db.risk.findMany({ where: { projectId: id }, include: { owner: { select: { name: true } }, department: true }, orderBy: { severity: "desc" } });
  return <RiskRegister risks={risks} locale={locale} canEdit={u.permissions.has("risk.manage")} />;
}

type RiskRow = Awaited<ReturnType<typeof db.risk.findMany<{ include: { owner: { select: { name: true } }; department: true } }>>>[number] & { project?: { name: string; id: string } };
export function RiskRegister({ risks, locale, canEdit, showProject }: { risks: RiskRow[]; locale: "en" | "ar"; canEdit: boolean; showProject?: boolean }) {
  const matrix = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => risks.filter((r) => r.probability === 5 - i && r.impact === j + 1).length));
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card><CardHeader><div><CardTitle>Risk matrix</CardTitle><CardDescription>Probability × impact (configurable thresholds)</CardDescription></div></CardHeader>
          <CardContent><div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1 text-center text-2xs">{matrix.map((rowv, i) => [<div key={`l${i}`} className="pe-1 text-muted-foreground">{5 - i}</div>, ...rowv.map((c, j) => { const s = (5 - i) * (j + 1); return <div key={`${i}-${j}`} className={cn("grid aspect-square place-items-center rounded font-bold", s >= 16 ? "bg-danger/80 text-white" : s >= 10 ? "bg-warning/70 text-white" : s >= 5 ? "bg-info-soft text-info" : "bg-muted text-muted-foreground")}>{c || ""}</div>; })])}<div />{[1, 2, 3, 4, 5].map((n) => <div key={n} className="text-muted-foreground">{n}</div>)}</div><div className="mt-1 flex justify-between text-2xs text-muted-foreground"><span>↑ probability</span><span>impact →</span></div></CardContent>
        </Card>
        <Card className="min-w-0"><CardHeader><div><CardTitle>Summary</CardTitle><CardDescription>Generated risks are hypothetical (IDENTIFIED) until a person marks one TRIGGERED</CardDescription></div></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((l) => { const n = risks.filter((r) => (l === "CRITICAL" ? r.severity >= 16 : l === "HIGH" ? r.severity >= 10 && r.severity < 16 : l === "MEDIUM" ? r.severity >= 5 && r.severity < 10 : r.severity < 5)).length; return <div key={l} className="rounded-md border p-3"><StatusBadge status={l} locale={locale} /><div className="mt-1 font-display text-2xl font-semibold">{n}</div></div>; })}</CardContent>
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader><CardTitle>Risk register & contingency plans</CardTitle></CardHeader>
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>ID</th>{showProject && <th>Project</th>}<th>Risk</th><th>Dept</th><th className="num">P × I</th><th>Trigger / warning signs</th><th>Prevention</th><th>Immediate action / Plan B</th><th>Owner · response</th><th>Impact</th><th>Status</th><th /></tr></thead>
            <tbody>{risks.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="text-xs font-semibold">{r.code}</td>
                {showProject && <td className="text-xs"><Link href={`/projects/${r.project?.id}/risks`} className="hover:text-primary">{r.project?.name}</Link></td>}
                <td className="min-w-[200px]"><div className="font-medium">{r.title}</div><div className="text-2xs text-muted-foreground">{r.description}</div>{r.generated && <Badge variant="secondary" className="mt-1">generated</Badge>}</td>
                <td className="text-xs">{r.department?.key ?? "—"}</td>
                <td className="num"><span className={cn("rounded px-1.5 font-bold", r.severity >= 16 ? "bg-danger-soft text-danger" : r.severity >= 10 ? "bg-warning-soft text-warning" : "bg-muted")}>{r.probability}×{r.impact}={r.severity}</span></td>
                <td className="min-w-[160px] text-xs">{r.trigger}<div className="text-2xs text-muted-foreground">{r.warningSigns}</div></td>
                <td className="min-w-[160px] text-xs">{r.prevention}</td>
                <td className="min-w-[180px] text-xs"><div>{r.immediateAction}</div><div className="mt-1 text-2xs text-muted-foreground">Plan B: {r.contingency}</div>{r.requiredResources && <div className="text-2xs text-muted-foreground">Resources: {r.requiredResources}</div>}</td>
                <td className="text-xs">{r.owner?.name ?? "—"}<div className="text-2xs text-muted-foreground">{r.responseTimeMin != null ? `${r.responseTimeMin} min` : ""}</div></td>
                <td className="whitespace-nowrap text-xs">{r.timeImpactHours != null ? `${r.timeImpactHours} h` : "—"}<div className="text-2xs text-muted-foreground">{r.costImpact != null ? fmtMoney(Number(r.costImpact), r.costCurrency ?? "EGP", locale) : ""}</div></td>
                <td><StatusBadge status={r.status} locale={locale} /></td>
                <td>{canEdit && <RiskEditor risk={{ id: r.id, status: r.status, probability: r.probability, impact: r.impact, prevention: r.prevention, contingency: r.contingency }} />}</td>
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
        {risks.length === 0 && <EmptyState title="No risks registered" description="Risks are generated with the plan." className="m-4" />}
      </Card>
    </div>
  );
}

export async function ExecutionTab({ id }: { id: string }) {
  const { u, locale } = await projectContext(id);
  const d = await executionData(id);
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><Link href={`/execution/actual-vs-planned?project=${id}`} className="text-sm font-medium text-primary">Actual vs planned →</Link></div>
      <ExecutionBoard projectId={id} tasks={d.tasks} plannedActuals={d.plannedActuals} canUpdate={u.permissions.has("execution.update")} now={new Date().toISOString()} active={d.active} />
      <ExecutionFeed updates={d.updates} locale={locale} />
    </div>
  );
}

export function ExecutionFeed({ updates, locale }: { updates: Awaited<ReturnType<typeof executionData>>["updates"]; locale: "en" | "ar" }) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle>Site activity feed</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {updates.map((x) => (
          <div key={x.id} className="flex gap-3 text-sm">
            <Badge variant={x.type === "DELAY" ? "danger" : x.type === "ISSUE" ? "warning" : x.type === "PHOTO" ? "violet" : x.type === "INSPECTION" ? "info" : "secondary"} className="h-fit">{x.type}</Badge>
            <div className="min-w-0"><div>{x.message}</div>{x.photoDocumentId && <a href={`/api/documents/${x.photoDocumentId}`} className="inline-flex items-center gap-1 text-xs text-primary"><ImageIcon className="size-3.5" />view photo</a>}<div className="text-2xs text-muted-foreground">{x.user.name} · {fmtDateTime(x.createdAt, locale)}</div></div>
          </div>
        ))}
        {updates.length === 0 && <EmptyState title="No site updates yet" className="border-0" />}
      </CardContent>
    </Card>
  );
}

export async function DocumentsTab({ id }: { id: string }) {
  const { u, locale, project } = await projectContext(id);
  const docs = await db.uploadedDocument.findMany({ where: { projectId: id, deletedAt: null }, include: { uploadedBy: { select: { name: true } }, extracted: true }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-5">
      {u.permissions.has("documents.upload") && <Card><CardContent><UploadForm projects={[{ id, name: project.name }]} defaultProject={id} /></CardContent></Card>}
      <DocumentList docs={docs} locale={locale} canReview={u.permissions.has("submission.review")} />
    </div>
  );
}

export async function DocumentList({ docs, locale, canReview }: { docs: (Awaited<ReturnType<typeof db.uploadedDocument.findMany<{ include: { uploadedBy: { select: { name: true } }; extracted: true } }>>>[number] & { project?: { name: string } | null })[]; locale: "en" | "ar"; canReview: boolean }) {
  const { ExtractedReviewButtons } = await import("@/components/execution/upload");
  return (
    <div className="space-y-3">
      {docs.map((d) => (
        <Card key={d.id} className="min-w-0">
          <CardHeader>
            <div className="flex min-w-0 items-center gap-3"><FileText className="size-5 shrink-0 text-primary" /><div className="min-w-0"><a href={`/api/documents/${d.id}`} className="block truncate font-medium hover:text-primary">{d.fileName}</a><div className="text-2xs text-muted-foreground">{d.category} · {(d.sizeBytes / 1024).toFixed(0)} KB · {d.uploadedBy.name} · {fmtDateTime(d.createdAt, locale)}{d.project ? ` · ${d.project.name}` : ""} · sha256 {d.sha256.slice(0, 10)}…</div></div></div>
            <StatusBadge status={d.status} locale={locale} />
          </CardHeader>
          {d.extracted.length > 0 && (
            <TableWrap><table className="data-table"><thead><tr><th>Page</th><th>Field</th><th>Extracted value</th><th>Method</th><th>State</th><th /></tr></thead><tbody>{d.extracted.map((x) => <tr key={x.id}><td className="text-xs">{x.page ?? "—"}</td><td className="text-xs font-medium">{x.field}</td><td>{x.value} {x.unit}</td><td className="text-xs">{x.method.toLowerCase().replace("_", " ")}</td><td><StatusBadge status={x.state} locale={locale} /></td><td>{canReview && x.state === "UNDER_REVIEW" && <ExtractedReviewButtons id={x.id} />}</td></tr>)}</tbody></table></TableWrap>
          )}
          {d.extracted.length === 0 && d.textPreview && <CardContent className="text-xs text-muted-foreground">{d.textPreview.slice(0, 280)}…</CardContent>}
        </Card>
      ))}
      {docs.length === 0 && <EmptyState title="No documents" />}
    </div>
  );
}

export async function ApprovalsTab({ id }: { id: string }) {
  const { u, locale } = await projectContext(id);
  const approvals = await db.approval.findMany({ where: { projectId: id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const users = new Map((await db.user.findMany({ where: { companyId: u.companyId }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  return (
    <Card className="min-w-0">
      <CardHeader><div><CardTitle>Approvals</CardTitle><CardDescription>Technical (department), integrated plan (PM), cost (Finance), changes and standards</CardDescription></div></CardHeader>
      <TableWrap><table className="data-table"><thead><tr><th>Type</th><th>Item</th><th>Approver role</th><th>Requested</th><th>Status</th><th>Decision</th><th /></tr></thead>
        <tbody>{approvals.map((a) => <tr key={a.id}><td><Badge variant="violet">{a.entityType}</Badge></td><td className="min-w-[220px]"><div className="font-medium">{a.title}</div><div className="text-2xs text-muted-foreground">{a.description}</div></td><td className="text-xs">{a.requiredRole.replace(/_/g, " ").toLowerCase()}</td><td className="text-xs">{users.get(a.requestedById ?? "") ?? "System"}<div className="text-2xs text-muted-foreground">{fmtDateTime(a.createdAt, locale)}</div></td><td><StatusBadge status={a.status} locale={locale} /></td><td className="text-xs">{a.approverId ? `${users.get(a.approverId)} · ${fmtDateTime(a.decidedAt, locale)}` : "—"}{a.decisionNote && <div className="text-2xs text-muted-foreground">{a.decisionNote}</div>}</td><td>{a.status === "PENDING" && (a.requiredRole === u.role || u.role === "SUPER_ADMIN") && <DecisionButtons approvalId={a.id} title={a.title} entityType={a.entityType} />}</td></tr>)}</tbody></table></TableWrap>
      {approvals.length === 0 && <EmptyState title="No approvals yet" className="m-4" />}
    </Card>
  );
}

export async function ActivityTab({ id }: { id: string }) {
  const { u, locale } = await projectContext(id);
  const [logs, comments] = await Promise.all([
    u.permissions.has("audit.read") || u.role === "PROJECT_MANAGER" || u.approvalDepartment ? db.auditLog.findMany({ where: { projectId: id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 150 }) : Promise.resolve([]),
    db.comment.findMany({ where: { projectId: id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="min-w-0"><CardHeader><CardTitle>Comments</CardTitle></CardHeader><CardContent className="space-y-3"><CommentBox projectId={id} />{comments.map((c) => <div key={c.id} className="rounded-md bg-muted/40 p-3 text-sm"><div>{c.body}</div><div className="mt-1 text-2xs text-muted-foreground">{c.user.name} · {fmtDateTime(c.createdAt, locale)}</div></div>)}</CardContent></Card>
      <Card className="min-w-0"><CardHeader><div><CardTitle>Audit history</CardTitle><CardDescription>Every important action is logged with user, time and details</CardDescription></div></CardHeader>
        <TableWrap className="max-h-[640px] overflow-y-auto"><table className="data-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th></tr></thead><tbody>{logs.map((l) => <tr key={l.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt, locale)}</td><td className="text-xs">{l.user?.name ?? "System"}</td><td className="text-xs font-medium">{l.action.replace(/_/g, " ").toLowerCase()}</td><td className="text-2xs text-muted-foreground">{l.entityType}</td></tr>)}</tbody></table></TableWrap>
        {logs.length === 0 && <EmptyState title="Audit history requires audit permission" className="m-4" />}
      </Card>
    </div>
  );
}
