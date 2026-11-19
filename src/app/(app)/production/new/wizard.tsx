"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { saveProductionSubmissionAction } from "@/server/actions/inputs";
import { uploadDocumentAction } from "@/server/actions/documents";
import { cn } from "@/lib/utils";

const STEPS = ["Select project", "Production category", "Dimensions & quantities", "Materials", "Construction method", "Finishing", "Drawings", "Installation", "Review extracted information", "Submit for planning"];
const CATS = [["STAGE", "Stage"], ["BACKDROP", "Backdrop"], ["PODIUM", "Podium"], ["BOOTH", "Exhibition booth"], ["COUNTER", "Counter"], ["FURNITURE", "Furniture"], ["DECORATIVE", "Decorative structure"], ["SIGNAGE", "Signage"], ["CARPENTRY", "Carpentry"], ["PAINTING", "Painting"], ["BRANDING_INSTALL", "Branding installation"], ["FLOORING", "Flooring"], ["OTHER", "Other"]] as const;
type Spec = { kind: "PANEL" | "FRAME_MEMBER" | "PAINT_SURFACE" | "ACCESSORY"; label: string; materialId: string; lengthM: string; widthM: string; quantity: string; sides: string; coats: string; drawingRef: string };
type Item = { code: string; name: string; category: string; quantity: string; widthM: string; heightM: string; depthM: string; packedVolumeM3: string; boardMaterialId: string; constructionMethod: string; finishing: string; color: string; paintCoats: string; installationMethod: string; installationDay: string; specialTools: string; engineeringApprovalRequired: boolean; notes: string; specs: Spec[] };
type Mat = { id: string; code: string; name: string; category: string; unit: string; stockLengthM: number | null; stockWidthM: number | null; status: string };
const KEY = "peo:production-wizard";
const blank = (): Item => ({ code: "", name: "", category: "BACKDROP", quantity: "1", widthM: "", heightM: "", depthM: "", packedVolumeM3: "", boardMaterialId: "", constructionMethod: "", finishing: "", color: "", paintCoats: "", installationMethod: "", installationDay: "1", specialTools: "", engineeringApprovalRequired: false, notes: "", specs: [] });

export function ProductionWizard({ projects, defaultProject, materials }: { projects: { id: string; name: string }[]; defaultProject?: string; materials: Mat[] }) {
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState(defaultProject ?? projects[0]?.id ?? "");
  const [title, setTitle] = useState("Production requirements");
  const [item, setItem] = useState<Item>(blank);
  const [docs, setDocs] = useState<{ id: string; name: string; extracted: number }[]>([]);
  const [submissionId, setSubmissionId] = useState<string | undefined>();
  const [missing, setMissing] = useState<{ question: string }[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) { const d = JSON.parse(s); if (!defaultProject || d.projectId === defaultProject) { setItem(d.item); setTitle(d.title); setStep(d.step ?? 0); setDocs(d.docs ?? []); setSubmissionId(d.submissionId); if (!defaultProject) setProjectId(d.projectId); } } } catch { /* no storage */ } }, [defaultProject]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ projectId, item, title, step, docs, submissionId })); } catch { /* ignore */ } }, [projectId, item, title, step, docs, submissionId]);
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setItem((x) => ({ ...x, [k]: v }));
  const boards = materials.filter((m) => m.category === "BOARD");
  const n = (s: string) => (s === "" ? null : Number(s));
  const area = item.widthM && item.heightM ? Number(item.widthM) * Number(item.heightM) * Number(item.quantity || 1) : null;
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!item.widthM || !item.heightM) w.push("Width and height are required");
    if (!item.depthM && !item.packedVolumeM3) w.push("Depth or packed transport volume is needed for logistics");
    if (!item.boardMaterialId && !item.specs.some((s) => s.kind === "PANEL")) w.push("No board material selected");
    if (/paint/i.test(item.finishing) && !item.specs.some((s) => s.kind === "PAINT_SURFACE")) w.push("Painted finish but no paint surfaces defined — paint will not be calculated");
    if (["STAGE", "BACKDROP", "BOOTH", "PODIUM", "DECORATIVE"].includes(item.category) && !item.specs.some((s) => s.kind === "FRAME_MEMBER")) w.push("No frame members from the drawing — timber will not be calculated");
    if (!docs.length && !item.specs.length) w.push("No drawing uploaded — quantities will be estimates only");
    if (Number(item.widthM) > 60 || Number(item.heightM) > 60) w.push("Dimension exceeds plausible range (60 m) — check units");
    return w;
  }, [item, docs]);
  const valid = [!!projectId, !!item.category, !!item.code && !!item.name && Number(item.quantity) >= 1, true, true, true, true, true, true, true];

  const save = (submit: boolean) => start(async () => {
    const r = await saveProductionSubmissionAction({
      projectId, submissionId, title, submit, formStep: step + 1, documentIds: docs.map((d) => d.id),
      items: [{ code: item.code, name: item.name, category: item.category as never, quantity: Number(item.quantity) || 1, widthM: n(item.widthM), heightM: n(item.heightM), depthM: n(item.depthM), packedVolumeM3: n(item.packedVolumeM3), boardMaterialId: item.boardMaterialId || null, finishing: item.finishing || null, color: item.color || null, paintCoats: n(item.paintCoats), constructionMethod: item.constructionMethod || null, installationMethod: item.installationMethod || null, installationDay: n(item.installationDay), specialTools: item.specialTools || null, engineeringApprovalRequired: item.engineeringApprovalRequired, notes: item.notes || null,
        specs: item.specs.map((s) => ({ kind: s.kind, label: s.label, materialId: s.materialId || null, lengthM: n(s.lengthM), widthM: n(s.widthM), quantity: Number(s.quantity) || 1, sides: Number(s.sides) || 1, coats: n(s.coats), drawingRef: s.drawingRef || null })) }],
    });
    if (!r.ok) { toast(r.error, { tone: "error" }); return; }
    const d = r.data as { submissionId: string; status: string; missing: { question: string }[] };
    setSubmissionId(d.submissionId); setMissing(d.missing);
    if (submit) {
      toast(d.status === "SUBMITTED" ? "Submitted for technical review" : `Saved — ${d.missing.length} item(s) still need information`, { tone: d.status === "SUBMITTED" ? "success" : "error" });
      if (d.status === "SUBMITTED") { try { localStorage.removeItem(KEY); } catch { /* ignore */ } router.push(`/projects/${projectId}/inputs?submission=${d.submissionId}`); }
    } else toast("Draft saved to project");
  });
  const addSpec = (kind: Spec["kind"]) => set("specs", [...item.specs, { kind, label: "", materialId: kind === "PANEL" ? item.boardMaterialId : "", lengthM: "", widthM: "", quantity: "1", sides: "1", coats: kind === "PAINT_SURFACE" ? item.paintCoats || "" : "", drawingRef: "" }]);
  const specRows = (kind: Spec["kind"], label: string, matCats: string[]) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><div className="field-label mb-0">{label}</div><Button type="button" size="sm" variant="outline" onClick={() => addSpec(kind)}><Plus />Add</Button></div>
      {item.specs.map((s, i) => s.kind !== kind ? null : (
        <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1.4fr_1.2fr_80px_80px_70px_70px_1fr_36px]">
          <Input placeholder="Label" value={s.label} onChange={(e) => set("specs", item.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <NativeSelect value={s.materialId} onChange={(e) => set("specs", item.specs.map((x, j) => (j === i ? { ...x, materialId: e.target.value } : x)))}><option value="">Material…</option>{materials.filter((m) => matCats.includes(m.category)).map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}</NativeSelect>
          {kind !== "ACCESSORY" ? <><Input placeholder="L m" type="number" step="0.001" value={s.lengthM} onChange={(e) => set("specs", item.specs.map((x, j) => (j === i ? { ...x, lengthM: e.target.value } : x)))} /><Input placeholder={kind === "FRAME_MEMBER" ? "—" : "W m"} disabled={kind === "FRAME_MEMBER"} type="number" step="0.001" value={s.widthM} onChange={(e) => set("specs", item.specs.map((x, j) => (j === i ? { ...x, widthM: e.target.value } : x)))} /></> : <><span /><span /></>}
          <Input placeholder="Qty" type="number" value={s.quantity} onChange={(e) => set("specs", item.specs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
          {kind === "PAINT_SURFACE" ? <Input placeholder="Coats" type="number" value={s.coats} onChange={(e) => set("specs", item.specs.map((x, j) => (j === i ? { ...x, coats: e.target.value } : x)))} /> : <span />}
          <Input placeholder="Drawing ref." value={s.drawingRef} onChange={(e) => set("specs", item.specs.map((x, j) => (j === i ? { ...x, drawingRef: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" onClick={() => set("specs", item.specs.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <ol className="scrollbar-thin flex gap-1 overflow-x-auto lg:flex-col">
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" onClick={() => setStep(i)} className={cn("flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-start text-[13px]", i === step ? "bg-card font-semibold shadow-card" : "text-muted-foreground hover:text-foreground")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold", i < step ? "bg-success text-white" : i === step ? "bg-primary text-white" : "bg-muted")}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>{s}
          </button></li>
        ))}
      </ol>
      <Card className="min-w-0">
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between"><div className="section-title">Step {step + 1} of 10 — {STEPS[step]}</div>{submissionId && <Badge variant="secondary">Draft saved to project</Badge>}</div>
          {step === 0 && <div className="grid gap-4 sm:grid-cols-2"><Field label="Project" required><NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field><Field label="Submission title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field></div>}
          {step === 1 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{CATS.map(([k, l]) => <button key={k} type="button" onClick={() => set("category", k)} className={cn("rounded-md border px-3 py-3 text-start text-sm", item.category === k ? "border-primary bg-accent font-semibold" : "hover:bg-muted")}>{l}</button>)}</div>}
          {step === 2 && <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Item code" required hint="e.g. BKD-02"><Input value={item.code} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Item name" required className="sm:col-span-2"><Input value={item.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Quantity" required><Input type="number" min={1} value={item.quantity} onChange={(e) => set("quantity", e.target.value)} /></Field>
            <Field label="Width (m)"><Input type="number" step="0.01" value={item.widthM} onChange={(e) => set("widthM", e.target.value)} /></Field>
            <Field label={item.category === "STAGE" || item.category === "FLOORING" ? "Height / level (m)" : "Height (m)"}><Input type="number" step="0.01" value={item.heightM} onChange={(e) => set("heightM", e.target.value)} /></Field>
            <Field label="Depth (m)"><Input type="number" step="0.01" value={item.depthM} onChange={(e) => set("depthM", e.target.value)} /></Field>
            <Field label="Packed transport volume (m³)" hint="Knocked-down volume"><Input type="number" step="0.01" value={item.packedVolumeM3} onChange={(e) => set("packedVolumeM3", e.target.value)} /></Field>
            {area != null && <p className="text-xs text-muted-foreground sm:col-span-4">Face area: {area.toFixed(2)} m² (all units)</p>}
          </div>}
          {step === 3 && <div className="space-y-4"><Field label="Main board material" hint="Standard sheet sizes, kerf, trim and waste come from the approved material library"><NativeSelect value={item.boardMaterialId} onChange={(e) => set("boardMaterialId", e.target.value)}><option value="">—</option>{boards.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.stockLengthM}×{m.stockWidthM} m){m.status !== "APPROVED" ? ` · ${m.status.toLowerCase()}` : ""}</option>)}</NativeSelect></Field>{specRows("PANEL", "Panels to cut (from drawing)", ["BOARD"])}</div>}
          {step === 4 && <div className="space-y-4"><Field label="Construction method"><Textarea value={item.constructionMethod} onChange={(e) => set("constructionMethod", e.target.value)} placeholder="e.g. Timber stud frame clad with MDF panels" /></Field>{specRows("FRAME_MEMBER", "Frame members (from approved drawing only)", ["TIMBER", "METAL"])}<label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={item.engineeringApprovalRequired} onChange={(e) => set("engineeringApprovalRequired", e.target.checked)} />Structural / load-bearing — requires approval by a qualified engineer</label></div>}
          {step === 5 && <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3"><Field label="Finishing" className="sm:col-span-2"><Input value={item.finishing} onChange={(e) => set("finishing", e.target.value)} placeholder="e.g. Primed and painted matte black" /></Field><Field label="Colour"><Input value={item.color} onChange={(e) => set("color", e.target.value)} /></Field><Field label="Default paint coats"><Input type="number" value={item.paintCoats} onChange={(e) => set("paintCoats", e.target.value)} /></Field></div>{specRows("PAINT_SURFACE", "Paint / primer surfaces (L × W, sides, coats)", ["PAINT", "PRIMER"])}{specRows("ACCESSORY", "Accessories & consumables (explicit quantities)", ["FASTENER", "ADHESIVE", "CARPET", "VINYL", "FABRIC", "FLOORING", "OTHER"])}</div>}
          {step === 6 && <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed bg-muted/30 p-8 text-sm text-muted-foreground hover:bg-muted"><Upload className="size-5" />Upload drawings, PDFs, Excel, images or sketches<input type="file" multiple className="hidden" accept=".pdf,.xlsx,.csv,.docx,.png,.jpg,.jpeg,.webp" onChange={(e) => { const files = [...(e.target.files ?? [])]; for (const f of files) { const fd = new FormData(); fd.set("file", f); fd.set("projectId", projectId); fd.set("category", /\.(png|jpe?g|webp)$/i.test(f.name) ? "DRAWING" : "DRAWING"); start(async () => { const r = await uploadDocumentAction(fd); if (r.ok) { const d = r.data as { id: string; extracted: number }; setDocs((x) => [...x, { id: d.id, name: f.name, extracted: d.extracted }]); toast(`${f.name} uploaded`, { description: `${d.extracted} value(s) extracted for review` }); } else toast(r.error, { tone: "error" }); }); } e.target.value = ""; }} /></label>
            {docs.map((d) => <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span>{d.name}</span><Badge variant="secondary">{d.extracted} extracted value(s) to review</Badge></div>)}
            <p className="text-2xs text-muted-foreground">Original files are stored and linked to this submission. Extracted values are shown for review in the Document Center and never approved automatically.</p>
          </div>}
          {step === 7 && <div className="grid gap-4 sm:grid-cols-3"><Field label="Installation setup day"><Input type="number" min={1} value={item.installationDay} onChange={(e) => set("installationDay", e.target.value)} /></Field><Field label="Installation method" className="sm:col-span-2"><Input value={item.installationMethod} onChange={(e) => set("installationMethod", e.target.value)} /></Field><Field label="Special tools" className="sm:col-span-3"><Input value={item.specialTools} onChange={(e) => set("specialTools", e.target.value)} /></Field><Field label="Technical notes" className="sm:col-span-3"><Textarea value={item.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>}
          {step === 8 && <div className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-2">{[["Item", `${item.code} — ${item.name}`], ["Category", item.category], ["Size", `${item.quantity} × ${item.widthM || "?"} × ${item.heightM || "?"} × ${item.depthM || "?"} m`], ["Board", boards.find((b) => b.id === item.boardMaterialId)?.code ?? "—"], ["Panels / frame / paint / accessories", `${item.specs.filter((s) => s.kind === "PANEL").length} / ${item.specs.filter((s) => s.kind === "FRAME_MEMBER").length} / ${item.specs.filter((s) => s.kind === "PAINT_SURFACE").length} / ${item.specs.filter((s) => s.kind === "ACCESSORY").length}`], ["Finishing", item.finishing || "—"], ["Drawings", `${docs.length} file(s)`], ["Installation", `setup day ${item.installationDay || "?"}`]].map(([k, v]) => <div key={k} className="rounded-md border px-3 py-2"><div className="text-2xs uppercase tracking-wider text-muted-foreground">{k}</div><div>{v}</div></div>)}</div>
            {warnings.length > 0 ? <div className="space-y-1">{warnings.map((w) => <div key={w} className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-1.5 text-xs text-warning"><CircleHelp className="size-3.5" />{w}</div>)}</div> : <div className="rounded-md bg-success-soft px-3 py-2 text-xs text-success">All key specifications present.</div>}
            <p className="text-2xs text-muted-foreground">Calculations (cutting plans, timber, paint, labour) run when the plan is generated, using the approved material library and productivity standards. Results show their formulas and assumptions.</p>
          </div>}
          {step === 9 && <div className="space-y-3"><p className="text-sm">Submitting sends this item to the Production Manager for technical approval, then into integrated planning.</p>{missing.length > 0 && <ul className="space-y-1">{missing.map((m, i) => <li key={i} className="rounded-md bg-danger-soft/60 px-3 py-1.5 text-xs text-danger">{m.question}</li>)}</ul>}</div>}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-2">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="rtl:-scale-x-100" />Back</Button>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={pending || !valid[2] || !projectId} onClick={() => save(false)}><Save />Save draft</Button>
            {step < 9 ? <Button disabled={!valid[step]} onClick={() => setStep((s) => s + 1)}>Next<ArrowRight className="rtl:-scale-x-100" /></Button> : <Button disabled={pending || !valid[2]} onClick={() => save(true)}>{pending ? <Loader2 className="animate-spin" /> : <Check />}Submit for planning</Button>}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
