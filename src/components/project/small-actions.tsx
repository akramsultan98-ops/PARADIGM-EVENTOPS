"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { deleteAvRequirementAction } from "@/server/actions/inputs";
import { rescheduleTaskAction } from "@/server/actions/schedule";
import { requestBudgetApprovalAction } from "@/server/actions/approvals";

export function DeleteAvRequirement({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button size="icon-sm" variant="ghost" disabled={pending} aria-label="Remove" onClick={() => confirm("Remove this requirement?") && start(async () => { const r = await deleteAvRequirementAction(id); if (r.ok) { toast("Removed"); router.refresh(); } else toast(r.error, { tone: "error" }); })}><Trash2 /></Button>;
}

export function RescheduleButton({ taskId, name, start: initial }: { taskId: string; name: string; start: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Reschedule"><CalendarClock /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reschedule “{name}”</DialogTitle><DialogDescription>Dependent tasks are pushed to keep all dependencies valid; affected tasks and deadline breaches are reported.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-3"><Field label="New start (Cairo time)"><Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} /></Field><Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></DialogBody>
        <DialogFooter><Button disabled={pending} onClick={() => start(async () => { const r = await rescheduleTaskAction(taskId, value, reason); if (r.ok) { const d = r.data as { affected: string[]; warnings: string[] }; toast(`${d.affected.length} task(s) updated`, { description: d.warnings.join("; ") || "All dependencies satisfied", tone: d.warnings.length ? "error" : "success" }); setOpen(false); router.refresh(); } else toast(r.error, { tone: "error" }); })}>Apply</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestBudgetApproval({ projectId }: { projectId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await requestBudgetApprovalAction(projectId); if (r.ok) { toast(r.message ?? "Requested"); router.refresh(); } else toast(r.error, { tone: "error" }); })}>Request Finance approval</Button>;
}
