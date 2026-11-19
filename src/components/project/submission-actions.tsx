"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Send, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { reviewSubmissionAction, submitSubmissionAction } from "@/server/actions/inputs";

export function SubmitButton({ submissionId }: { submissionId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await submitSubmissionAction(submissionId); if (r.ok) { toast(r.message ?? "Submitted"); router.refresh(); } else toast(r.error, { tone: "error" }); })}><Send className="rtl:-scale-x-100" />Submit for review</Button>;
}

export function ReviewActions({ submissionId }: { submissionId: string }) {
  const [mode, setMode] = useState<null | "APPROVED" | "REJECTED" | "NEEDS_INFORMATION">(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="success" onClick={() => setMode("APPROVED")}><Check />Approve</Button>
      <Button size="sm" variant="outline" onClick={() => setMode("NEEDS_INFORMATION")}><HelpCircle />Request info</Button>
      <Button size="sm" variant="outline" className="text-danger" onClick={() => setMode("REJECTED")}><X />Reject</Button>
      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{mode === "APPROVED" ? "Approve technical submission" : mode === "REJECTED" ? "Reject submission" : "Request more information"}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-2">
            {mode === "APPROVED" && <p className="text-xs text-muted-foreground">Approval confirms the specifications are correct for planning. It is not a structural, electrical or rigging certification.</p>}
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "APPROVED" ? "Optional note" : "Reason / what is needed (required)"} />
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setMode(null)}>Cancel</Button><Button disabled={pending} variant={mode === "REJECTED" ? "destructive" : "default"} onClick={() => start(async () => { const r = await reviewSubmissionAction(submissionId, mode!, note); if (r.ok) { toast(r.message ?? "Saved"); setMode(null); setNote(""); router.refresh(); } else toast(r.error, { tone: "error" }); })}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
