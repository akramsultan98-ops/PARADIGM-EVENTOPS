import Link from "next/link";
import { FileText, MessageSquareText } from "lucide-react";
import { db } from "@/lib/db";
import { canReviewDepartment } from "@/lib/auth/session";
import { projectContext } from "@/server/queries/project";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatusBadge, TableWrap } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConversationalInput } from "./conversational-input";
import { ReviewActions, SubmitButton } from "./submission-actions";
import { ExtractionReview } from "./extraction-review";
import type { MissingField } from "@/ai/types";

export async function InputsTab({ id, sp }: { id: string; sp: Record<string, string | undefined> }) {
  const { u, locale, project: p } = await projectContext(id);
  const subs = await db.departmentSubmission.findMany({ where: { projectId: id }, include: { department: true, submittedBy: { select: { name: true } }, reviewer: { select: { name: true } }, _count: { select: { productionItems: true, equipmentReqs: true, documents: true } } }, orderBy: [{ department: { name: "asc" } }, { updatedAt: "desc" }] });
  const selected = sp.submission ? await db.departmentSubmission.findFirst({ where: { id: sp.submission, projectId: id }, include: { department: true, fields: true, documents: true, productionItems: { include: { specs: true } }, equipmentReqs: { include: { equipment: true } }, submittedBy: { select: { name: true } } } }) : null;
  const materials = selected?.method === "AI_CONVERSATION" ? await db.material.findMany({ where: { companyId: u.companyId, category: { in: ["BOARD", "PAINT", "PRIMER", "TIMBER"] } }, select: { id: true, code: true, name: true, category: true } }) : [];
  const deptChoices = ["PRODUCTION", "AV", "LOGISTICS", "ACCOMMODATION", "CREATIVE"].filter((k) => ["SUPER_ADMIN", "PROJECT_MANAGER", "ACCOUNT_MANAGER"].includes(u.role) || u.departments.some((d) => d.key === k) || u.approvalDepartment === k);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="min-w-0 space-y-5">
        <Card className="min-w-0">
          <CardHeader><div><CardTitle>Department submissions</CardTitle><CardDescription>Forms, conversational inputs and documents — each requires technical approval by the department manager</CardDescription></div></CardHeader>
          <CardContent className="space-y-1 p-2 sm:p-2">
            {subs.map((s) => (
              <Link key={s.id} href={`/projects/${id}/inputs?submission=${s.id}`} className={cn("block rounded-md border border-transparent px-3 py-2.5 hover:bg-muted", sp.submission === s.id && "border-primary/40 bg-accent/50")}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-medium">{s.title}</div><div className="text-2xs text-muted-foreground">{s.department.name} · {s.method === "AI_CONVERSATION" ? "conversational" : s.method.toLowerCase()} · {s.submittedBy.name} · v{s.version}</div></div><StatusBadge status={s.status} locale={locale} /></div>
                <div className="mt-1 flex gap-2 text-2xs text-muted-foreground">{s._count.productionItems > 0 && <span>{s._count.productionItems} items</span>}{s._count.equipmentReqs > 0 && <span>{s._count.equipmentReqs} equipment lines</span>}{s._count.documents > 0 && <span>{s._count.documents} documents</span>}<span className="ms-auto">{fmtDateTime(s.updatedAt, locale)}</span></div>
              </Link>
            ))}
            {subs.length === 0 && <EmptyState title="No submissions yet" />}
          </CardContent>
        </Card>
        {u.permissions.has("submission.create") && deptChoices.length > 0 && (
          <Card className="min-w-0">
            <CardHeader><div><CardTitle className="flex items-center gap-2"><MessageSquareText className="size-4 text-primary" />Describe requirements in your own words</CardTitle><CardDescription>Type naturally — the system extracts a structured draft, lists what is missing, and you confirm before anything is submitted.</CardDescription></div></CardHeader>
            <CardContent><ConversationalInput projectId={id} departments={deptChoices} /></CardContent>
          </Card>
        )}
      </div>
      <div className="min-w-0">
        {!selected ? <EmptyState icon={FileText} title="Select a submission" description="Open a submission to see its extracted data, evidence, missing information and review history." /> : (
          <Card className="min-w-0">
            <CardHeader>
              <div className="min-w-0"><CardTitle>{selected.title}</CardTitle><CardDescription>{selected.department.name} · {selected.method.toLowerCase().replace("_", " ")} · {selected.submittedBy.name} · {fmtDateTime(selected.submittedAt ?? selected.createdAt, locale)}</CardDescription></div>
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={selected.status} locale={locale} />
                {["DRAFT", "NEEDS_INFORMATION", "REJECTED", "REVISED"].includes(selected.status) && selected.method !== "AI_CONVERSATION" && u.permissions.has("submission.submit") && <SubmitButton submissionId={selected.id} />}
                {["SUBMITTED", "UNDER_REVIEW"].includes(selected.status) && (canReviewDepartment(u, selected.department.key) || (u.role === "PROJECT_MANAGER" && selected.department.key === "ACCOUNT")) && <ReviewActions submissionId={selected.id} />}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {selected.reviewNote && <div className="rounded-md border bg-muted/50 p-3 text-sm"><span className="font-semibold">Review note: </span>{selected.reviewNote}</div>}
              {selected.rawText && <section><div className="section-title mb-1">Original input</div><blockquote className="rounded-md border-s-4 border-primary/50 bg-muted/40 px-3 py-2 text-sm italic">{selected.rawText}</blockquote></section>}
              {selected.method === "AI_CONVERSATION" && selected.extracted && (
                <ExtractionReview submissionId={selected.id} projectId={id} status={selected.status} extracted={selected.extracted as never} missing={(selected.missingFields as MissingField[] | null) ?? []} materials={materials} canEdit={u.permissions.has("submission.create")} />
              )}
              {selected.method !== "AI_CONVERSATION" && Array.isArray(selected.missingFields) && (selected.missingFields as unknown as MissingField[]).length > 0 && (
                <section><div className="section-title mb-1">Missing information</div><ul className="space-y-1 text-sm">{(selected.missingFields as unknown as MissingField[]).map((m, i) => <li key={i} className="rounded-md bg-danger-soft/50 px-3 py-1.5 text-danger">{m.question}</li>)}</ul></section>
              )}
              {selected.productionItems.length > 0 && (
                <section><div className="section-title mb-1">Production items</div><TableWrap><table className="data-table"><thead><tr><th>Item</th><th>Size (m)</th><th className="num">Qty</th><th className="num">Components</th><th>Drawing</th><th>State</th></tr></thead><tbody>{selected.productionItems.map((i) => <tr key={i.id}><td className="font-medium">{i.code} {i.name}</td><td className="text-xs tabular">{i.widthM ?? "?"} × {i.heightM ?? "?"} × {i.depthM ?? "?"}</td><td className="num">{i.quantity}</td><td className="num">{i.specs.length}</td><td><StatusBadge status={i.drawingStatus} locale={locale} /></td><td><StatusBadge status={i.state} locale={locale} /></td></tr>)}</tbody></table></TableWrap></section>
              )}
              {selected.equipmentReqs.length > 0 && (
                <section><div className="section-title mb-1">Equipment requirements</div><TableWrap><table className="data-table"><thead><tr><th>Requirement</th><th>Model</th><th className="num">Qty</th><th className="num">Backup</th><th>State</th></tr></thead><tbody>{selected.equipmentReqs.map((r) => <tr key={r.id}><td>{r.description}</td><td className="text-xs">{r.equipment?.model ?? <span className="text-danger">not selected</span>}</td><td className="num">{r.quantity}</td><td className="num">{r.backupQuantity}</td><td><StatusBadge status={r.state} locale={locale} /></td></tr>)}</tbody></table></TableWrap></section>
              )}
              {selected.fields.length > 0 && selected.method !== "AI_CONVERSATION" && (
                <section><div className="section-title mb-1">Submitted fields</div><TableWrap><table className="data-table"><thead><tr><th>Field</th><th>Value</th><th>Method</th><th>State</th></tr></thead><tbody>{selected.fields.map((f) => <tr key={f.id}><td>{f.label}</td><td>{f.value ?? <span className="text-danger">missing</span>} {f.unit}</td><td className="text-xs">{f.method.toLowerCase().replace("_", " ")}</td><td><StatusBadge status={f.state} locale={locale} /></td></tr>)}</tbody></table></TableWrap></section>
              )}
              {selected.documents.length > 0 && <section><div className="section-title mb-1">Documents</div><div className="flex flex-wrap gap-2">{selected.documents.map((d) => <a key={d.id} href={`/api/documents/${d.id}`} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"><FileText className="size-3.5" />{d.fileName}<Badge variant="secondary">{d.category}</Badge></a>)}</div></section>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
