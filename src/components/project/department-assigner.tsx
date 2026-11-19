"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { assignDepartmentsAction } from "@/server/actions/projects";

const DEPTS = [["ACCOUNT", "Account Management"], ["PRODUCTION", "Production"], ["AV", "AV & Technical"], ["LOGISTICS", "Logistics"], ["ACCOMMODATION", "Accommodation"], ["CREATIVE", "Creative & Branding"], ["PROCUREMENT", "Procurement"], ["FINANCE", "Finance"]] as const;

export function DepartmentAssigner({ projectId, current, users }: { projectId: string; current: { key: string; leadId?: string; dueDate?: string }[]; users: { id: string; name: string; departments: string[] }[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(current);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><UserPlus />Assign departments</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Assign participating departments</DialogTitle></DialogHeader>
        <DialogBody className="divide-y">
          {DEPTS.map(([k, name]) => {
            const s = sel.find((x) => x.key === k);
            return (
              <div key={k} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_1fr_150px]">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={!!s} onChange={(e) => setSel(e.target.checked ? [...sel, { key: k }] : sel.filter((x) => x.key !== k))} />{name}</label>
                <NativeSelect disabled={!s} value={s?.leadId ?? ""} onChange={(e) => setSel(sel.map((x) => (x.key === k ? { ...x, leadId: e.target.value } : x)))} aria-label="Lead"><option value="">Lead…</option>{users.filter((u) => u.departments.includes(k)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect>
                <Input disabled={!s} type="date" value={s?.dueDate ?? ""} onChange={(e) => setSel(sel.map((x) => (x.key === k ? { ...x, dueDate: e.target.value } : x)))} aria-label="Due date" />
              </div>
            );
          })}
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending} onClick={() => start(async () => { const r = await assignDepartmentsAction(projectId, sel); if (r.ok) { toast("Departments assigned and notified"); setOpen(false); router.refresh(); } else toast(r.error, { tone: "error" }); })}>Save & notify</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
