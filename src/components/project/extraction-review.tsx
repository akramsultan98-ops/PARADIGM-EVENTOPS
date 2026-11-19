"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleHelp, Loader2, Paperclip, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { confirmExtractionAction } from "@/server/actions/inputs";
import { uploadDocumentAction } from "@/server/actions/documents";
import type { MissingField, ProductionDraft } from "@/ai/types";

type Extracted = { engine: string; engineNote?: string; model?: string; aiError?: string | null; production: ProductionDraft[]; av: { description: string; category: string | null; quantity: number | null; backupQuantity: number | null }[]; evidence: { field: string; snippet: string }[]; assumptionsMade: string[] };
const CATS = ["STAGE", "BACKDROP", "PODIUM", "BOOTH", "COUNTER", "FURNITURE", "DECORATIVE", "SIGNAGE", "CARPENTRY", "FLOORING", "OTHER"];

/** Employee reviews and corrects the extracted draft; confirmation creates DRAFT/SUBMITTED items — never approved ones. */
export function ExtractionReview({ submissionId, projectId, status, extracted, missing, materials, canEdit }: { submissionId: string; projectId: string; status: string; extracted: Extracted; missing: MissingField[]; materials: { id: string; code: string; name: string; category: string }[]; canEdit: boolean }) {
  const [docs, setDocs] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState(() => extracted.production.map((p, i) => ({
    code: `NEW-${String(i + 1).padStart(2, "0")}`, name: p.name ?? "", category: p.category ?? "OTHER", quantity: String(p.quantity ?? 1), widthM: p.widthM?.toString() ?? "", heightM: p.heightM?.toString() ?? "", depthM: p.depthM?.toString() ?? "", packedVolumeM3: "",
    boardMaterialId: materials.find((m) => m.category === "BOARD" && p.material && m.name.toLowerCase().includes(p.material.toLowerCase().split(" ")[0]))?.id ?? "", finishing: p.finishing ?? "", color: p.color ?? "", paintCoats: p.paintCoats?.toString() ?? "", installationDay: p.installationDay?.toString() ?? "", constructionMethod: p.constructionMethod ?? "", notes: [p.notes, p.material ? `Material stated: ${p.material}${p.thicknessMm ? ` ${p.thicknessMm} mm` : ""}` : null].filter(Boolean).join(" · "),
  })));
  const [pending, start] = useTransition();
  const router = useRouter();
  const editable = canEdit && ["NEEDS_INFORMATION", "DRAFT", "REJECTED"].includes(status);
  const set = (i: number, k: string, v: string) => setItems((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = (submit: boolean) => start(async () => {
    const r = await confirmExtractionAction(submissionId, items.map((it) => ({ ...it, category: it.category as never, quantity: Number(it.quantity) || 1, boardMaterialId: it.boardMaterialId || null, engineeringApprovalRequired: false, specs: [] })), submit, docs.map((d) => d.id));
    if (r.ok) { const d = r.data as { status: string; missing: unknown[] }; toast(submit ? (d.status === "SUBMITTED" ? "Submitted for technical review" : `Saved — ${d.missing.length} item(s) still missing`) : "Draft saved"); router.refresh(); }
    else toast(r.error, { tone: "error" });
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs"><Badge variant={extracted.engine === "AI" ? "violet" : "secondary"}>{extracted.engine === "AI" ? `AI · ${extracted.model ?? ""}` : "Rule-based"}</Badge><span className="text-muted-foreground">{extracted.engineNote}</span>{extracted.aiError && <span className="text-warning">({extracted.aiError})</span>}</div>
      {extracted.evidence.length > 0 && <section><div className="section-title mb-1">Evidence (source phrases)</div><div className="flex flex-wrap gap-1.5">{extracted.evidence.map((e, i) => <span key={i} className="rounded-md border bg-muted/40 px-2 py-0.5 text-2xs"><span className="font-semibold">{e.field}</span>: “{e.snippet}”</span>)}</div></section>}
      {missing.length > 0 && <section><div className="section-title mb-1">Follow-up questions</div><ul className="space-y-1">{missing.map((m, i) => <li key={i} className="flex items-start gap-2 rounded-md bg-accent/60 px-3 py-1.5 text-sm"><CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" />{m.question}</li>)}</ul></section>}
      {items.map((it, i) => (
        <section key={i} className="rounded-md border p-3">
          <div className="section-title mb-2">Extracted production item {i + 1} — review & correct</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Code"><Input disabled={!editable} value={it.code} onChange={(e) => set(i, "code", e.target.value)} /></Field>
            <Field label="Name" className="sm:col-span-2"><Input disabled={!editable} value={it.name} onChange={(e) => set(i, "name", e.target.value)} /></Field>
            <Field label="Category"><NativeSelect disabled={!editable} value={it.category} onChange={(e) => set(i, "category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</NativeSelect></Field>
            <Field label="Quantity"><Input disabled={!editable} type="number" value={it.quantity} onChange={(e) => set(i, "quantity", e.target.value)} /></Field>
            <Field label="Installation day"><Input disabled={!editable} type="number" value={it.installationDay} onChange={(e) => set(i, "installationDay", e.target.value)} className={!it.installationDay ? "border-danger/50" : ""} /></Field>
            <Field label="Width (m)"><Input disabled={!editable} type="number" step="0.01" value={it.widthM} onChange={(e) => set(i, "widthM", e.target.value)} className={!it.widthM ? "border-danger/50" : ""} /></Field>
            <Field label="Height (m)"><Input disabled={!editable} type="number" step="0.01" value={it.heightM} onChange={(e) => set(i, "heightM", e.target.value)} className={!it.heightM ? "border-danger/50" : ""} /></Field>
            <Field label="Depth (m)"><Input disabled={!editable} type="number" step="0.01" value={it.depthM} onChange={(e) => set(i, "depthM", e.target.value)} className={!it.depthM && !it.packedVolumeM3 ? "border-danger/50" : ""} /></Field>
            <Field label="Board material"><NativeSelect disabled={!editable} value={it.boardMaterialId} onChange={(e) => set(i, "boardMaterialId", e.target.value)} className={!it.boardMaterialId ? "border-danger/50" : ""}><option value="">Select from library…</option>{materials.filter((m) => m.category === "BOARD").map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</NativeSelect></Field>
            <Field label="Finishing"><Input disabled={!editable} value={it.finishing} onChange={(e) => set(i, "finishing", e.target.value)} /></Field>
            <Field label="Paint coats"><Input disabled={!editable} type="number" value={it.paintCoats} onChange={(e) => set(i, "paintCoats", e.target.value)} /></Field>
            <Field label="Packed volume (m³)" hint="If known"><Input disabled={!editable} type="number" step="0.01" value={it.packedVolumeM3} onChange={(e) => set(i, "packedVolumeM3", e.target.value)} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Input disabled={!editable} value={it.notes} onChange={(e) => set(i, "notes", e.target.value)} /></Field>
          </div>
        </section>
      ))}
      {extracted.av.length > 0 && <section><div className="section-title mb-1">Extracted AV lines</div><ul className="text-sm">{extracted.av.map((a, i) => <li key={i}>• {a.quantity ?? "?"} × {a.description} {a.backupQuantity ? `(+${a.backupQuantity} backup)` : ""} <span className="text-2xs text-muted-foreground">{a.category}</span></li>)}</ul><p className="mt-1 text-2xs text-muted-foreground">Enter AV lines with inventory models in the AV requirements form.</p></section>}
      {extracted.assumptionsMade.length > 0 && <p className="text-2xs text-muted-foreground">Interpretations: {extracted.assumptionsMade.join("; ")}</p>}
      {editable && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary"><Paperclip className="size-4" />Attach technical drawing<input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx" data-testid="drawing-upload" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("file", f); fd.set("projectId", projectId); fd.set("category", "DRAWING"); start(async () => { const r = await uploadDocumentAction(fd); if (r.ok) { setDocs((d) => [...d, { id: (r.data as { id: string }).id, name: f.name }]); toast(`${f.name} attached`); } else toast(r.error, { tone: "error" }); }); e.target.value = ""; }} /></label>
          {docs.map((d) => <span key={d.id} className="rounded bg-muted px-2 py-0.5 text-xs">{d.name}</span>)}
          {!docs.length && <span className="text-2xs text-muted-foreground">Drawings are required before technical approval</span>}
        </div>
      )}
      {editable && items.length > 0 && <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => save(false)}><Save />Save draft</Button><Button disabled={pending} onClick={() => save(true)}>{pending ? <Loader2 className="animate-spin" /> : <Check />}Confirm & submit</Button></div>}
    </div>
  );
}
