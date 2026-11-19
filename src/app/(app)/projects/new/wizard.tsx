"use client";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { KeyValue } from "@/components/ui/kit";
import { createProjectAction, type ProjectInput } from "@/server/actions/projects";
import { cn } from "@/lib/utils";

type Dept = { key: string; leadId?: string; dueDate?: string };
const STEPS = ["Brief", "Dates & venue", "Team & departments", "Budget & scope", "Review"];
const DRAFT_KEY = "peo:new-project-draft";

export function ProjectWizard({ venues, users, departments, currentUserId }: { venues: { id: string; name: string; city: string; accessOpens: string | null; accessCloses: string | null }[]; users: { id: string; name: string; role: string; departments: string[] }[]; departments: { key: string; name: string }[]; currentUserId: string }) {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [f, setF] = useState<Omit<ProjectInput, "requirements" | "departments"> & { departments: Dept[]; requirements: { category: string; title: string; quantity?: string; unit?: string }[] }>({
    name: "", client: "", category: "Corporate conference", participants: 100, description: "", location: "", venueId: "", newVenueName: "", newVenueCity: "", accessOpens: "", accessCloses: "", powerCapacityKw: "",
    eventStart: "", eventEnd: "", setupStart: "", setupEnd: "", dismantleStart: "", dismantleEnd: "", budgetAmount: "", currency: "EGP",
    projectManagerId: users.find((u) => u.role === "PROJECT_MANAGER")?.id, accountManagerId: users.find((u) => u.id === currentUserId && u.role === "ACCOUNT_MANAGER")?.id ?? users.find((u) => u.role === "ACCOUNT_MANAGER")?.id,
    departments: [{ key: "PRODUCTION" }, { key: "AV" }, { key: "LOGISTICS" }, { key: "ACCOMMODATION" }], requirements: [],
  });
  useEffect(() => { try { const d = localStorage.getItem(DRAFT_KEY); if (d) setF((x) => ({ ...x, ...JSON.parse(d) })); } catch { /* storage unavailable */ } }, []);
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)); } catch { /* ignore */ } }, [f]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const valid = [
    f.name.length >= 3 && f.client.length >= 2 && Number(f.participants) > 0,
    !!f.location && !!f.eventStart && !!f.eventEnd && !!f.setupStart && !!f.setupEnd && f.eventEnd > f.eventStart && f.setupStart < f.eventStart,
    true, true, true,
  ];
  const managers = (dept: string) => users.filter((u) => u.departments.includes(dept) || u.role.startsWith(dept));
  const submit = () => start(async () => {
    const res = await createProjectAction({ ...f, requirements: f.requirements.filter((r) => r.title) });
    if (res && !res.ok) toast(res.error, { tone: "error" });
    else { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col">
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" onClick={() => i <= step && setStep(i)} className={cn("flex w-full items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-start text-sm", i === step ? "bg-card font-semibold shadow-card" : "text-muted-foreground")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold", i < step ? "bg-success text-white" : i === step ? "bg-primary text-white" : "bg-muted")}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>{s}
          </button></li>
        ))}
      </ol>
      <Card>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Aswan Corporate Conference" /></Field>
              <Field label="Client" required><Input value={f.client} onChange={(e) => set("client", e.target.value)} /></Field>
              <Field label="Event category" required><NativeSelect value={f.category} onChange={(e) => set("category", e.target.value)}>{["Corporate conference", "Product launch", "Gala dinner", "Exhibition", "Dealer conference", "Festival", "Government event", "Other"].map((c) => <option key={c}>{c}</option>)}</NativeSelect></Field>
              <Field label="Participants" required><Input type="number" min={1} value={String(f.participants)} onChange={(e) => set("participants", Number(e.target.value))} /></Field>
              <Field label="Brief / description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Objectives, programme, key deliverables…" /></Field>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location (city)" required><Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Aswan" /></Field>
              <Field label="Venue"><NativeSelect value={f.venueId} onChange={(e) => set("venueId", e.target.value)}><option value="">New / not yet known</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.city}</option>)}</NativeSelect></Field>
              {!f.venueId && <>
                <Field label="New venue name" hint="Optional — creates a venue record"><Input value={f.newVenueName} onChange={(e) => set("newVenueName", e.target.value)} /></Field>
                <Field label="Venue city"><Input value={f.newVenueCity} onChange={(e) => set("newVenueCity", e.target.value)} /></Field>
                <Field label="Daily access opens"><Input type="time" value={f.accessOpens} onChange={(e) => set("accessOpens", e.target.value)} /></Field>
                <Field label="Daily access closes"><Input type="time" value={f.accessCloses} onChange={(e) => set("accessCloses", e.target.value)} /></Field>
                <Field label="Venue power capacity (kW)" hint="Leave empty if unknown — the system will ask AV to confirm"><Input type="number" min={0} value={String(f.powerCapacityKw ?? "")} onChange={(e) => set("powerCapacityKw", e.target.value)} /></Field>
              </>}
              <div className="sm:col-span-2 grid gap-4 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
                <Field label="Setup starts" required><Input type="datetime-local" value={f.setupStart} onChange={(e) => set("setupStart", e.target.value)} /></Field>
                <Field label="Setup ends" required><Input type="datetime-local" value={f.setupEnd} onChange={(e) => set("setupEnd", e.target.value)} /></Field>
                <Field label="Event starts" required><Input type="datetime-local" value={f.eventStart} onChange={(e) => set("eventStart", e.target.value)} /></Field>
                <Field label="Event ends" required><Input type="datetime-local" value={f.eventEnd} onChange={(e) => set("eventEnd", e.target.value)} /></Field>
                <Field label="Dismantle starts"><Input type="datetime-local" value={f.dismantleStart} onChange={(e) => set("dismantleStart", e.target.value)} /></Field>
                <Field label="Venue hand-back"><Input type="datetime-local" value={f.dismantleEnd} onChange={(e) => set("dismantleEnd", e.target.value)} /></Field>
                <p className="text-2xs text-muted-foreground sm:col-span-2">Times are Africa/Cairo local time.</p>
              </div>
              {!valid[1] && f.eventStart && f.setupStart && <p className="text-xs text-danger sm:col-span-2">Check the dates: setup must start before the event, and the event must end after it starts.</p>}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project Manager"><NativeSelect value={f.projectManagerId} onChange={(e) => set("projectManagerId", e.target.value)}><option value="">—</option>{users.filter((u) => ["PROJECT_MANAGER", "SUPER_ADMIN"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></Field>
                <Field label="Account Manager"><NativeSelect value={f.accountManagerId} onChange={(e) => set("accountManagerId", e.target.value)}><option value="">—</option>{users.filter((u) => u.role === "ACCOUNT_MANAGER").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></Field>
              </div>
              <div>
                <div className="field-label">Participating departments</div>
                <div className="divide-y rounded-md border">
                  {departments.map((d) => {
                    const sel = f.departments.find((x) => x.key === d.key);
                    return (
                      <div key={d.key} className="grid items-center gap-3 p-3 sm:grid-cols-[1fr_1fr_160px]">
                        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!sel} onChange={(e) => set("departments", e.target.checked ? [...f.departments, { key: d.key }] : f.departments.filter((x) => x.key !== d.key))} className="size-4 accent-[hsl(var(--primary))]" />{d.name}</label>
                        <NativeSelect disabled={!sel} value={sel?.leadId ?? ""} onChange={(e) => set("departments", f.departments.map((x) => (x.key === d.key ? { ...x, leadId: e.target.value } : x)))} aria-label={`${d.name} lead`}><option value="">Department lead…</option>{managers(d.key).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect>
                        <Input disabled={!sel} type="date" value={sel?.dueDate ?? ""} onChange={(e) => set("departments", f.departments.map((x) => (x.key === d.key ? { ...x, dueDate: e.target.value } : x)))} aria-label={`${d.name} input due date`} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Budget" className="sm:col-span-2"><Input type="number" min={0} value={String(f.budgetAmount ?? "")} onChange={(e) => set("budgetAmount", e.target.value)} /></Field>
                <Field label="Currency"><NativeSelect value={f.currency} onChange={(e) => set("currency", e.target.value)}>{["EGP", "USD", "EUR", "SAR", "AED"].map((c) => <option key={c}>{c}</option>)}</NativeSelect></Field>
              </div>
              <div>
                <div className="field-label">Scope & client requirements</div>
                <div className="space-y-2">
                  {f.requirements.map((r, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[140px_1fr_90px_90px_36px]">
                      <NativeSelect value={r.category} onChange={(e) => set("requirements", f.requirements.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}>{["Scope", "Deliverable", "Production", "AV", "Logistics", "Branding", "Hospitality"].map((c) => <option key={c}>{c}</option>)}</NativeSelect>
                      <Input placeholder="Requirement" value={r.title} onChange={(e) => set("requirements", f.requirements.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                      <Input placeholder="Qty" type="number" value={r.quantity ?? ""} onChange={(e) => set("requirements", f.requirements.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                      <Input placeholder="Unit" value={r.unit ?? ""} onChange={(e) => set("requirements", f.requirements.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                      <Button variant="ghost" size="icon" onClick={() => set("requirements", f.requirements.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => set("requirements", [...f.requirements, { category: "Scope", title: "" }])}><Plus />Add requirement</Button>
                </div>
              </div>
            </div>
          )}
          {step === 4 && (
            <KeyValue cols={2} items={[["Project", f.name], ["Client", f.client], ["Category", f.category], ["Participants", f.participants], ["Location", f.location], ["Venue", venues.find((v) => v.id === f.venueId)?.name ?? (f.newVenueName || "TBC")], ["Setup", `${f.setupStart.replace("T", " ")} → ${f.setupEnd.replace("T", " ")}`], ["Event", `${f.eventStart.replace("T", " ")} → ${f.eventEnd.replace("T", " ")}`], ["Departments", f.departments.map((d) => d.key).join(", ") || "None"], ["Budget", f.budgetAmount ? `${f.budgetAmount} ${f.currency}` : "Not set"], ["Requirements", `${f.requirements.filter((r) => r.title).length} line(s)`]]} />
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="rtl:-scale-x-100" />Back</Button>
          {step < STEPS.length - 1
            ? <Button disabled={!valid[step]} onClick={() => setStep((s) => s + 1)}>Next<ArrowRight className="rtl:-scale-x-100" /></Button>
            : <Button disabled={pending || !valid[0] || !valid[1]} onClick={submit}>{pending ? <Loader2 className="animate-spin" /> : <Check />}Create project</Button>}
        </CardFooter>
      </Card>
    </div>
  );
}
