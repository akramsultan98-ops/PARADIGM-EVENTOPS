"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, ClipboardCheck, Clock, Loader2, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/kit";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { recordActualAction, reportDelayAction, reportIssueAction, updateTaskProgressAction } from "@/server/actions/execution";
import { uploadDocumentAction } from "@/server/actions/documents";
import { cn } from "@/lib/utils";

export interface ExecTask { id: string; wbs: string; name: string; phase: string; department: string | null; status: string; percent: number; plannedStart: string | null; plannedEnd: string | null; actualStart: string | null; critical: boolean; floatHours: number | null; crew: number | null; trade: string | null }
export interface PlannedActual { category: string; description: string; planned: number; unit: string; resourceType: string; materialId?: string | null }

const fmt = (s: string | null) => (s ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s)) : "—");

export function ExecutionBoard({ projectId, tasks, plannedActuals, canUpdate, now, active }: { projectId: string; tasks: ExecTask[]; plannedActuals: PlannedActual[]; canUpdate: boolean; now: string; active: boolean }) {
  const [filter, setFilter] = useState<"now" | "all" | "delayed" | "done">("now");
  const [dept, setDept] = useState("ALL");
  const [pending, start] = useTransition();
  const [delayFor, setDelayFor] = useState<ExecTask | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [actualOpen, setActualOpen] = useState(false);
  const router = useRouter();
  const nowMs = Date.parse(now);
  const depts = useMemo(() => [...new Set(tasks.map((t) => t.department).filter(Boolean) as string[])].sort(), [tasks]);
  const shown = tasks.filter((t) => (dept === "ALL" || t.department === dept) && (filter === "all" ? true : filter === "delayed" ? t.status === "DELAYED" || t.status === "BLOCKED" || (t.status !== "COMPLETED" && t.plannedEnd && Date.parse(t.plannedEnd) < nowMs) : filter === "done" ? t.status === "COMPLETED" : t.status !== "COMPLETED" && t.plannedStart && Date.parse(t.plannedStart) < nowMs + 36 * 3600000));
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>, after?: (d: unknown) => void) => start(async () => { const r = await fn(); if (r.ok) { toast(r.message ?? "Saved"); after?.(r.data); router.refresh(); } else toast(r.error ?? "Failed", { tone: "error" }); });
  const done = tasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-2xs text-muted-foreground">Progress</div><div className="font-display text-2xl font-semibold">{tasks.length ? Math.round((done / tasks.length) * 100) : 0}%</div><Progress value={tasks.length ? (done / tasks.length) * 100 : 0} className="mt-1" /></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xs text-muted-foreground">In progress</div><div className="font-display text-2xl font-semibold">{tasks.filter((t) => t.status === "IN_PROGRESS").length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xs text-muted-foreground">Delayed / blocked</div><div className="font-display text-2xl font-semibold text-danger">{tasks.filter((t) => ["DELAYED", "BLOCKED"].includes(t.status)).length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xs text-muted-foreground">Critical open</div><div className="font-display text-2xl font-semibold text-warning">{tasks.filter((t) => t.critical && t.status !== "COMPLETED").length}</div></CardContent></Card>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["now", "delayed", "all", "done"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{f === "now" ? "Now & next 36 h" : f === "delayed" ? "Delayed" : f === "done" ? "Completed" : "All"}</button>)}
        <NativeSelect value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 w-40 text-xs" aria-label="Department"><option value="ALL">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</NativeSelect>
        {canUpdate && active && <div className="ms-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => setIssueOpen(true)}><AlertTriangle />Report issue</Button><Button size="sm" variant="outline" onClick={() => setActualOpen(true)}><Plus />Record actual</Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-xs font-medium hover:bg-muted"><Camera className="size-4" />Site photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("file", f); fd.set("projectId", projectId); fd.set("category", "PHOTO"); act(() => uploadDocumentAction(fd)); e.target.value = ""; }} /></label></div>}
      </div>
      {!active && <div className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">Execution updates open once the master plan is approved.</div>}
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {shown.map((t) => {
          const late = t.status !== "COMPLETED" && t.plannedEnd && Date.parse(t.plannedEnd) < nowMs;
          return (
            <Card key={t.id} className={cn("min-w-0", t.critical && "border-danger/40", t.status === "DELAYED" && "border-danger")}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-2xs text-muted-foreground">{t.wbs} · {t.department ?? "—"}{t.critical && <span className="ms-1 font-bold text-danger">· CRITICAL</span>}</div><div className="font-medium leading-snug">{t.name}</div></div><StatusBadge status={t.status} /></div>
                <div className="grid grid-cols-2 gap-2 text-xs"><div><div className="text-2xs text-muted-foreground">Planned</div>{fmt(t.plannedStart)} → {fmt(t.plannedEnd)}</div><div><div className="text-2xs text-muted-foreground">Actual start</div>{fmt(t.actualStart)}{late && <div className="font-semibold text-danger">past planned finish</div>}</div></div>
                {t.crew ? <div className="text-xs text-muted-foreground">{t.crew} × {t.trade} · float {t.floatHours ?? "—"} h</div> : null}
                <Progress value={t.percent} tone={t.status === "DELAYED" ? "danger" : t.status === "COMPLETED" ? "success" : "primary"} />
                {canUpdate && active && t.status !== "COMPLETED" && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.status === "NOT_STARTED" && <Button size="sm" disabled={pending} onClick={() => act(() => updateTaskProgressAction(t.id, "IN_PROGRESS", 5))}><Play />Start</Button>}
                    {t.status !== "NOT_STARTED" && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => updateTaskProgressAction(t.id, "IN_PROGRESS", Math.min(95, t.percent + 25)))}>+25%</Button>}
                    <Button size="sm" variant="success" disabled={pending} onClick={() => act(() => updateTaskProgressAction(t.id, "COMPLETED"))}><CheckCircle2 />Done</Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDelayFor(t)}><Clock />Delay</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {shown.length === 0 && <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground md:col-span-2">No tasks in this view.</div>}
      </div>

      <Dialog open={!!delayFor} onOpenChange={(o) => !o && setDelayFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report delay — {delayFor?.name}</DialogTitle><DialogDescription>The system calculates recovery options from float, crew capacity and overtime rules.</DialogDescription></DialogHeader>
          <form action={(f) => act(() => reportDelayAction(delayFor!.id, Number(f.get("minutes")), String(f.get("reason"))), (d) => { setDelayFor(null); const r = (d as { recovery: string[] }).recovery; toast("Recovery options", { description: r.join(" · ") }); })}>
            <DialogBody className="grid gap-3 sm:grid-cols-3"><Field label="Delay (minutes)" required><Input name="minutes" type="number" min={5} required defaultValue={60} /></Field><Field label="Reason" className="sm:col-span-2" required><Input name="reason" required placeholder="e.g. Rigging points not released" /></Field></DialogBody>
            <DialogFooter><Button type="submit" variant="destructive" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Report delay</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Site update</DialogTitle></DialogHeader>
          <form action={(f) => act(() => reportIssueAction(projectId, { type: String(f.get("type")) as never, message: String(f.get("message")), taskId: String(f.get("taskId") || "") || undefined }), () => setIssueOpen(false))}>
            <DialogBody className="space-y-3"><Field label="Type"><NativeSelect name="type"><option value="ISSUE">Issue</option><option value="INSPECTION">Site inspection result</option><option value="REQUIREMENT">Additional requirement</option></NativeSelect></Field><Field label="Related task"><NativeSelect name="taskId"><option value="">—</option>{tasks.filter((t) => t.status !== "COMPLETED").map((t) => <option key={t.id} value={t.id}>{t.wbs} {t.name}</option>)}</NativeSelect></Field><Field label="Details" required><Textarea name="message" required /></Field></DialogBody>
            <DialogFooter><Button type="submit" disabled={pending}><ClipboardCheck />Submit</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={actualOpen} onOpenChange={setActualOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record actual consumption</DialogTitle><DialogDescription>Compared against the approved plan in Actual vs Planned.</DialogDescription></DialogHeader>
          <form action={(f) => { const sel = plannedActuals.find((p) => p.category === f.get("category")); if (!sel) return; act(() => recordActualAction({ projectId, resourceType: sel.resourceType as never, category: sel.category, description: sel.description, plannedQuantity: sel.planned, actualQuantity: Number(f.get("actual")), unit: sel.unit, materialId: sel.materialId ?? null, note: String(f.get("note") || "") || undefined }), () => setActualOpen(false)); }}>
            <DialogBody className="space-y-3"><Field label="Planned item"><NativeSelect name="category">{plannedActuals.map((p) => <option key={p.category} value={p.category}>{p.description} — planned {p.planned} {p.unit}</option>)}</NativeSelect></Field><Field label="Actual quantity" required><Input name="actual" type="number" step="0.01" min={0} required /></Field><Field label="Note"><Input name="note" /></Field></DialogBody>
            <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
