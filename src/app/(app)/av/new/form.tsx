"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { saveAvRequirementsAction } from "@/server/actions/inputs";

type Eq = { id: string; code: string; model: string; category: string; owned: number; powerW: number | null };
type Line = { equipmentId: string; description: string; quantity: string; backupQuantity: string; specs: string };

export function AvForm({ projects, defaultProject, equipment }: { projects: { id: string; name: string }[]; defaultProject?: string; equipment: Eq[] }) {
  const [projectId, setProjectId] = useState(defaultProject ?? projects[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([{ equipmentId: "", description: "", quantity: "1", backupQuantity: "0", specs: "" }]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const upd = (i: number, k: keyof Line, v: string) => setLines((s) => s.map((x, j) => (j === i ? { ...x, [k]: v, ...(k === "equipmentId" && !x.description ? { description: equipment.find((e) => e.id === v)?.model ?? "" } : {}) } : x)));
  const save = (submit: boolean) => start(async () => {
    const r = await saveAvRequirementsAction({ projectId, submit, lines: lines.filter((l) => l.description).map((l) => ({ equipmentId: l.equipmentId || null, category: (equipment.find((e) => e.id === l.equipmentId)?.category ?? "OTHER") as never, description: l.description, quantity: Number(l.quantity), backupQuantity: Number(l.backupQuantity), specs: l.specs || null })) });
    if (r.ok) { toast(submit ? "Submitted for AV Manager approval" : "Saved as draft"); router.push(`/projects/${projectId}/av`); } else toast(r.error, { tone: "error" });
  });
  return (
    <Card>
      <CardContent className="space-y-4">
        <Field label="Project"><NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const eq = equipment.find((e) => e.id === l.equipmentId);
            const need = Number(l.quantity) + Number(l.backupQuantity);
            return (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1.4fr_1.4fr_90px_90px_1fr_36px]">
                <Field label="Inventory model"><NativeSelect value={l.equipmentId} onChange={(e) => upd(i, "equipmentId", e.target.value)}><option value="">Not in inventory / TBC</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.model}</option>)}</NativeSelect></Field>
                <Field label="Description"><Input value={l.description} onChange={(e) => upd(i, "description", e.target.value)} /></Field>
                <Field label="Qty"><Input type="number" min={1} value={l.quantity} onChange={(e) => upd(i, "quantity", e.target.value)} /></Field>
                <Field label="Backup"><Input type="number" min={0} value={l.backupQuantity} onChange={(e) => upd(i, "backupQuantity", e.target.value)} /></Field>
                <Field label="Specs / notes" hint={eq ? `${eq.owned} owned in service${need > eq.owned ? ` — at least ${need - eq.owned} rental` : ""}${eq.powerW ? ` · ${eq.powerW} W each` : ""}` : undefined}><Input value={l.specs} onChange={(e) => upd(i, "specs", e.target.value)} /></Field>
                <div className="flex items-end"><Button variant="ghost" size="icon" onClick={() => setLines((s) => s.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button></div>
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setLines((s) => [...s, { equipmentId: "", description: "", quantity: "1", backupQuantity: "0", specs: "" }])}><Plus />Add line</Button>
        </div>
        <p className="text-2xs text-muted-foreground">Availability shown here is total owned stock; bookings on overlapping projects are checked when the plan is generated.</p>
      </CardContent>
      <CardFooter className="justify-end gap-2"><Button variant="outline" disabled={pending || !projectId} onClick={() => save(false)}><Save />Save draft</Button><Button disabled={pending || !projectId} onClick={() => save(true)}>{pending ? <Loader2 className="animate-spin" /> : <Send />}Submit for approval</Button></CardFooter>
    </Card>
  );
}
