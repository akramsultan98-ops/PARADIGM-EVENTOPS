"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { decideApprovalAction } from "@/server/actions/approvals";

export function DecisionButtons({ approvalId, title, errors = 0, entityType }: { approvalId: string; title: string; errors?: number; entityType: string }) {
  const [mode, setMode] = useState<null | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED">(null);
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="success" onClick={() => setMode("APPROVED")}><Check />Approve</Button>
        <Button size="sm" variant="outline" onClick={() => setMode("CHANGES_REQUESTED")}>Request changes</Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setMode("REJECTED")}><X />Reject</Button>
      </div>
      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{mode === "APPROVED" ? "Approve" : mode === "REJECTED" ? "Reject" : "Request changes"}: {title}</DialogTitle><DialogDescription>{entityType === "PLAN" ? "Approving sets this version as the baseline for execution and actual-vs-planned analysis." : entityType === "CHANGE" ? "Approving applies the change and generates a new plan revision for review." : entityType === "STANDARD" ? "Approving changes a company standard used by all future calculations." : "Your decision is recorded in the audit history."}</DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            {mode === "APPROVED" && entityType === "PLAN" && errors > 0 && (
              <label className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4" />The plan has {errors} open error(s). I acknowledge these open issues and approve with documented exceptions.</label>
            )}
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "APPROVED" ? "Optional note" : "Reason (required)"} />
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setMode(null)}>Cancel</Button><Button disabled={pending} variant={mode === "REJECTED" ? "destructive" : "default"} onClick={() => start(async () => { const r = await decideApprovalAction({ approvalId, decision: mode!, note, acknowledgeIssues: ack }); if (r.ok) { toast("Decision recorded"); setMode(null); router.refresh(); } else toast(r.error, { tone: "error" }); })}>{pending && <Loader2 className="animate-spin" />}Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
