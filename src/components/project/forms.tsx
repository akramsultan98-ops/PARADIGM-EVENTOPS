"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitPullRequestArrow, Loader2, Pencil, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { addBrandingAction, addCargoAction, addManualCostAction, addRequirementAction, saveGuestAction, setBrandingApprovalAction, updateRiskAction } from "@/server/actions/inputs";
import { proposeChangeAction, runWhatIfAction } from "@/server/actions/planning";

type R = { ok: boolean; error?: string; message?: string };
function useAct() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<R>, after?: () => void) => start(async () => { const r = await fn(); if (r.ok) { toast(r.message ?? "Saved"); after?.(); router.refresh(); } else toast(r.error ?? "Failed", { tone: "error" }); });
  return { pending, act };
}
const val = (f: FormData, k: string) => String(f.get(k) ?? "");

export function AddRequirementForm({ projectId }: { projectId: string }) {
  const { pending, act } = useAct();
  return (
    <form className="grid gap-2 sm:grid-cols-[140px_1fr_90px_90px_auto]" action={(f) => act(() => addRequirementAction(projectId, { category: val(f, "category"), title: val(f, "title"), quantity: val(f, "quantity"), unit: val(f, "unit") }))}>
      <NativeSelect name="category">{["Scope", "Deliverable", "Production", "AV", "Logistics", "Branding", "Hospitality"].map((c) => <option key={c}>{c}</option>)}</NativeSelect>
      <Input name="title" placeholder="New requirement" required />
      <Input name="quantity" type="number" placeholder="Qty" />
      <Input name="unit" placeholder="Unit" />
      <Button type="submit" disabled={pending}><Plus />Add</Button>
    </form>
  );
}

export function AddCargoDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { pending, act } = useAct();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus />Add cargo</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add cargo item</DialogTitle><DialogDescription>Weight and dimensions are required for vehicle allocation — unknown values are flagged, never assumed.</DialogDescription></DialogHeader>
        <form action={(f) => act(() => addCargoAction({ projectId, name: val(f, "name"), quantity: val(f, "quantity") as unknown as number, lengthM: val(f, "l"), widthM: val(f, "w"), heightM: val(f, "h"), unitWeightKg: val(f, "kg"), fragile: f.get("fragile") === "on", handlingNotes: val(f, "notes") }), () => setOpen(false))}>
          <DialogBody className="grid gap-3 sm:grid-cols-4">
            <Field label="Item" className="sm:col-span-3" required><Input name="name" required /></Field>
            <Field label="Qty" required><Input name="quantity" type="number" min={1} defaultValue={1} required /></Field>
            <Field label="Length m"><Input name="l" type="number" step="0.01" /></Field>
            <Field label="Width m"><Input name="w" type="number" step="0.01" /></Field>
            <Field label="Height m"><Input name="h" type="number" step="0.01" /></Field>
            <Field label="Weight kg / unit"><Input name="kg" type="number" step="0.1" /></Field>
            <Field label="Handling notes" className="sm:col-span-3"><Input name="notes" /></Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="fragile" className="size-4" />Fragile</label>
          </DialogBody>
          <DialogFooter><Button type="submit" disabled={pending}>Add cargo</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface GuestRow { id?: string; guestName?: string | null; employeeCode?: string | null; departmentKey?: string | null; jobRole?: string | null; hotelId?: string | null; roomTypeId?: string | null; roomLabel?: string | null; checkIn?: string | null; checkOut?: string | null; bookingStatus?: string; confirmationRef?: string | null; specialRequests?: string | null }
export function GuestDialog({ projectId, hotels, guest, trigger }: { projectId: string; hotels: { id: string; name: string; roomTypes: { id: string; name: string; capacity: number }[] }[]; guest?: GuestRow; trigger?: "edit" | "add" }) {
  const [open, setOpen] = useState(false);
  const [hotelId, setHotelId] = useState(guest?.hotelId ?? hotels[0]?.id ?? "");
  const { pending, act } = useAct();
  const types = hotels.find((h) => h.id === hotelId)?.roomTypes ?? [];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger === "edit" ? <Button size="icon-sm" variant="ghost" aria-label="Edit guest"><Pencil /></Button> : <Button size="sm"><Plus />Add guest</Button>}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{guest?.id ? "Edit rooming entry" : "Add staff accommodation"}</DialogTitle></DialogHeader>
        <form action={(f) => act(() => saveGuestAction({ projectId, id: guest?.id, guestName: val(f, "guestName"), employeeCode: val(f, "employeeCode"), departmentKey: val(f, "dept"), jobRole: val(f, "jobRole"), hotelId, roomTypeId: val(f, "roomTypeId"), roomLabel: val(f, "roomLabel"), checkIn: val(f, "checkIn"), checkOut: val(f, "checkOut"), bookingStatus: val(f, "bookingStatus") as never, confirmationRef: val(f, "confirmationRef"), specialRequests: val(f, "special") }), () => setOpen(false))}>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Guest name" hint="Leave empty only if not yet known — it will be flagged"><Input name="guestName" defaultValue={guest?.guestName ?? ""} /></Field>
            <Field label="Employee ID"><Input name="employeeCode" defaultValue={guest?.employeeCode ?? ""} /></Field>
            <Field label="Department"><NativeSelect name="dept" defaultValue={guest?.departmentKey ?? "PRODUCTION"}>{["PMO", "ACCOUNT", "PRODUCTION", "AV", "LOGISTICS", "CREATIVE", "MANAGEMENT"].map((d) => <option key={d}>{d}</option>)}</NativeSelect></Field>
            <Field label="Job role"><Input name="jobRole" defaultValue={guest?.jobRole ?? ""} /></Field>
            <Field label="Hotel"><NativeSelect value={hotelId} onChange={(e) => setHotelId(e.target.value)}>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</NativeSelect></Field>
            <Field label="Room type"><NativeSelect name="roomTypeId" defaultValue={guest?.roomTypeId ?? ""}>{types.map((t) => <option key={t.id} value={t.id}>{t.name} (×{t.capacity})</option>)}</NativeSelect></Field>
            <Field label="Shared room label" hint="Guests with the same label share one room"><Input name="roomLabel" defaultValue={guest?.roomLabel ?? ""} /></Field>
            <Field label="Booking status"><NativeSelect name="bookingStatus" defaultValue={guest?.bookingStatus ?? "REQUESTED"}>{["REQUESTED", "QUOTED", "CONFIRMED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}</NativeSelect></Field>
            <Field label="Check-in" required><Input name="checkIn" type="date" defaultValue={guest?.checkIn ?? ""} required /></Field>
            <Field label="Check-out" required><Input name="checkOut" type="date" defaultValue={guest?.checkOut ?? ""} required /></Field>
            <Field label="Confirmation ref."><Input name="confirmationRef" defaultValue={guest?.confirmationRef ?? ""} /></Field>
            <Field label="Special requirements"><Input name="special" defaultValue={guest?.specialRequests ?? ""} /></Field>
          </DialogBody>
          <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BrandingDialog({ projectId, vendors }: { projectId: string; vendors: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const { pending, act } = useAct();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus />Add branding item</Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Branding & printing requirement</DialogTitle><DialogDescription>Leave dimensions or quantity empty if not confirmed — they will be flagged, never invented.</DialogDescription></DialogHeader>
        <form action={(f) => act(() => addBrandingAction({ projectId, name: val(f, "name"), widthM: val(f, "w"), heightM: val(f, "h"), quantity: val(f, "q"), material: val(f, "material"), printMethod: val(f, "method"), installationMethod: val(f, "install"), vendorId: val(f, "vendor") || null, leadTimeDays: val(f, "lead"), unitCost: val(f, "cost"), clientApprovalDeadline: val(f, "approval") || null, deliveryDeadline: val(f, "delivery") || null }), () => setOpen(false))}>
          <DialogBody className="grid gap-3 sm:grid-cols-3">
            <Field label="Item" className="sm:col-span-3" required><Input name="name" required /></Field>
            <Field label="Width m"><Input name="w" type="number" step="0.01" /></Field>
            <Field label="Height m"><Input name="h" type="number" step="0.01" /></Field>
            <Field label="Quantity"><Input name="q" type="number" /></Field>
            <Field label="Material"><Input name="material" /></Field>
            <Field label="Print method"><Input name="method" /></Field>
            <Field label="Installation"><Input name="install" /></Field>
            <Field label="Vendor"><NativeSelect name="vendor"><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</NativeSelect></Field>
            <Field label="Lead time (days)"><Input name="lead" type="number" /></Field>
            <Field label="Unit cost (EGP)"><Input name="cost" type="number" /></Field>
            <Field label="Client approval deadline"><Input name="approval" type="date" /></Field>
            <Field label="Delivery deadline"><Input name="delivery" type="date" /></Field>
          </DialogBody>
          <DialogFooter><Button type="submit" disabled={pending}>Add</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BrandingApproval({ id, status }: { id: string; status: string }) {
  const { pending, act } = useAct();
  return <NativeSelect className="h-8 w-36 text-xs" disabled={pending} defaultValue={status} onChange={(e) => act(() => setBrandingApprovalAction(id, e.target.value as never))} aria-label="Client approval">{["PENDING", "APPROVED", "REJECTED"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</NativeSelect>;
}

export function ManualCostDialog({ projectId, currency }: { projectId: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const { pending, act } = useAct();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus />Add cost / quotation</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add cost line</DialogTitle><DialogDescription>Actuals, approved quotes, pending quotes and estimates are tracked separately.</DialogDescription></DialogHeader>
        <form action={(f) => act(() => addManualCostAction(projectId, { category: val(f, "category"), description: val(f, "description"), quantity: val(f, "quantity"), unit: val(f, "unit"), unitCost: val(f, "unitCost"), currency: val(f, "currency"), basis: val(f, "basis") }), () => setOpen(false))}>
          <DialogBody className="grid gap-3 sm:grid-cols-3">
            <Field label="Category"><NativeSelect name="category">{["MATERIALS", "LABOR", "AV_EQUIPMENT", "RENTALS", "TRANSPORTATION", "ACCOMMODATION", "VENDORS", "PRINTING", "OPERATIONS"].map((c) => <option key={c}>{c}</option>)}</NativeSelect></Field>
            <Field label="Basis"><NativeSelect name="basis">{["ACTUAL", "APPROVED_QUOTE", "PENDING_QUOTE", "ESTIMATE"].map((c) => <option key={c}>{c}</option>)}</NativeSelect></Field>
            <Field label="Currency"><Input name="currency" defaultValue={currency} maxLength={3} /></Field>
            <Field label="Description" className="sm:col-span-3" required><Input name="description" required /></Field>
            <Field label="Quantity" required><Input name="quantity" type="number" step="0.01" required /></Field>
            <Field label="Unit" required><Input name="unit" required /></Field>
            <Field label="Unit cost" required><Input name="unitCost" type="number" step="0.01" required /></Field>
          </DialogBody>
          <DialogFooter><Button type="submit" disabled={pending}>Add</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RiskEditor({ risk }: { risk: { id: string; status: string; probability: number; impact: number; prevention: string | null; contingency: string | null } }) {
  const [open, setOpen] = useState(false);
  const { pending, act } = useAct();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Edit risk"><Pencil /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Update risk</DialogTitle><DialogDescription>Marking a risk TRIGGERED records an actual incident and alerts the Project Manager.</DialogDescription></DialogHeader>
        <form action={(f) => act(() => updateRiskAction(risk.id, { status: val(f, "status"), probability: Number(val(f, "p")), impact: Number(val(f, "i")), prevention: val(f, "prevention"), contingency: val(f, "contingency") }), () => setOpen(false))}>
          <DialogBody className="grid gap-3 sm:grid-cols-3">
            <Field label="Status"><NativeSelect name="status" defaultValue={risk.status}>{["IDENTIFIED", "MONITORING", "MITIGATED", "TRIGGERED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}</NativeSelect></Field>
            <Field label="Probability (1–5)"><Input name="p" type="number" min={1} max={5} defaultValue={risk.probability} /></Field>
            <Field label="Impact (1–5)"><Input name="i" type="number" min={1} max={5} defaultValue={risk.impact} /></Field>
            <Field label="Prevention" className="sm:col-span-3"><Textarea name="prevention" defaultValue={risk.prevention ?? ""} rows={2} /></Field>
            <Field label="Contingency (Plan B)" className="sm:col-span-3"><Textarea name="contingency" defaultValue={risk.contingency ?? ""} rows={2} /></Field>
          </DialogBody>
          <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const WHATIFS = ["What if we only get one setup day?", "What if the main truck breaks down?", "What if the LED delivery is delayed 6 hours?", "What if the participant count increases by 50?", "What if the budget decreases by 15%?"];
export function WhatIfForm({ projectId }: { projectId: string }) {
  const [q, setQ] = useState("");
  const { pending, act } = useAct();
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a what-if question…" /><Button disabled={pending || q.length < 8} onClick={() => act(() => runWhatIfAction(projectId, q), () => setQ(""))}>{pending ? <Loader2 className="animate-spin" /> : <Sparkles />}Simulate</Button></div>
      <div className="flex flex-wrap gap-1.5">{WHATIFS.map((w) => <button key={w} type="button" onClick={() => setQ(w)} className="rounded-full border bg-card px-2.5 py-1 text-2xs hover:bg-muted">{w}</button>)}</div>
    </div>
  );
}

export function ChangeRequestDialog({ projectId, items, vehicles, project }: { projectId: string; items: { id: string; code: string; name: string; widthM: number | null; heightM: number | null; depthM: number | null; quantity: number }[]; vehicles: { id: string; code: string; available: boolean }[]; project: { participants: number; budget: number | null } }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"item" | "project" | "vehicle">("item");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const { pending, act } = useAct();
  const it = items.find((x) => x.id === itemId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><GitPullRequestArrow />Request change</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Change request with impact analysis</DialogTitle><DialogDescription>The approved plan is never overwritten. The system recalculates the impact and routes the change for approval.</DialogDescription></DialogHeader>
        <form action={(f) => {
          const changes: { field: string; to: string | number | boolean }[] = [];
          let entityType: "ProductionItem" | "Project" | "Vehicle" = "ProductionItem", entityId = itemId, title = val(f, "title");
          if (kind === "item") { for (const k of ["widthM", "heightM", "depthM", "quantity"]) { const v = val(f, k); if (v !== "" && Number(v) !== (it as unknown as Record<string, number | null>)[k]) changes.push({ field: k, to: Number(v) }); } title ||= `${it?.code} change`; }
          if (kind === "project") { entityType = "Project"; entityId = projectId; for (const k of ["participants", "budgetAmount", "setupStart", "eventStart"]) { const v = val(f, k); if (v) changes.push({ field: k, to: k.endsWith("Start") ? v : Number(v) }); } title ||= "Project change"; }
          if (kind === "vehicle") { entityType = "Vehicle"; entityId = val(f, "vehicleId"); changes.push({ field: "available", to: false }); title ||= `Vehicle ${vehicles.find((v) => v.id === entityId)?.code} unavailable`; }
          if (!changes.length) { toast("Enter at least one changed value", { tone: "error" }); return; }
          act(() => proposeChangeAction({ projectId, title, entityType, entityId, changes }), () => setOpen(false));
        }}>
          <DialogBody className="space-y-3">
            <Field label="Change type"><NativeSelect value={kind} onChange={(e) => setKind(e.target.value as never)}><option value="item">Production item dimensions / quantity</option><option value="project">Participants / budget / dates</option><option value="vehicle">Vehicle becomes unavailable</option></NativeSelect></Field>
            <Field label="Title"><Input name="title" placeholder="e.g. Backdrop widened to 10 m per client request" /></Field>
            {kind === "item" && <>
              <Field label="Item"><NativeSelect value={itemId} onChange={(e) => setItemId(e.target.value)}>{items.map((i) => <option key={i.id} value={i.id}>{i.code} {i.name}</option>)}</NativeSelect></Field>
              <div className="grid grid-cols-4 gap-2">{(["widthM", "heightM", "depthM", "quantity"] as const).map((k) => <Field key={k + itemId} label={`${k.replace("M", "")} (now ${it?.[k] ?? "?"})`}><Input name={k} type="number" step="0.01" defaultValue={it?.[k] ?? ""} /></Field>)}</div>
            </>}
            {kind === "project" && <div className="grid grid-cols-2 gap-2"><Field label={`Participants (now ${project.participants})`}><Input name="participants" type="number" /></Field><Field label={`Budget (now ${project.budget ?? "—"})`}><Input name="budgetAmount" type="number" /></Field><Field label="New setup start"><Input name="setupStart" type="datetime-local" /></Field><Field label="New event start"><Input name="eventStart" type="datetime-local" /></Field></div>}
            {kind === "vehicle" && <Field label="Vehicle"><NativeSelect name="vehicleId">{vehicles.filter((v) => v.available).map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}</NativeSelect></Field>}
          </DialogBody>
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}Analyse impact & submit</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
