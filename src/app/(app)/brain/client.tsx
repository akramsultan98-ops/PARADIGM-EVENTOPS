"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { correctMemoryAction, decideMemoryAction, revokeMemoryAction, teachAction } from "@/server/actions/brain";

export function TeachBox({ workspace }: { workspace: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2 p-4 sm:p-5">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Remember: for UN agency events we apply a 15% management fee and quote in USD." aria-label="Teach the Brain" />
      <Button disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await teachAction({ workspace, text }); if (r.ok) { toast(r.message ?? "Proposed"); setText(""); router.refresh(); } else toast(r.error, { tone: "error" }); })}>Propose memory</Button>
    </div>
  );
}

export function MemoryActions({ id, mode, kind, conflicted, content }: { id: string; mode: "pending" | "active"; kind: string; conflicted: boolean; content: string }) {
  const [pending, start] = useTransition();
  const [confirmKind, setConfirmKind] = useState("RULE");
  const router = useRouter();
  const go = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await fn(); if (r.ok) { toast(r.message ?? "Saved"); router.refresh(); } else toast(r.error ?? "Failed", { tone: "error" }); });
  const uncertain = kind === "ASSUMPTION" || kind === "SUGGESTION";
  if (mode === "pending") return (
    <div className="flex flex-wrap items-center gap-2">
      {uncertain ? <NativeSelect aria-label="Confirm as" value={confirmKind} onChange={(e) => setConfirmKind(e.target.value)} className="h-8 w-36 text-xs"><option value="RULE">confirm as rule</option><option value="FACT">confirm as fact</option><option value="PREFERENCE">confirm as preference</option></NativeSelect> : null}
      <Button size="sm" disabled={pending} onClick={() => go(() => decideMemoryAction({ id, decision: "APPROVE", ...(uncertain ? { confirmKind } : {}), ...(conflicted ? { supersedeConflicting: confirm("This replaces the approved memory it contradicts (kept in history). Continue?") } : {}) }))}>{conflicted ? "Approve & replace" : "Approve"}</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => go(() => decideMemoryAction({ id, decision: "REJECT" }))}>Reject</Button>
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => { const c = prompt("Corrected text", content); if (!c || c === content) return; const reason = prompt("Why does it change?") ?? ""; go(() => correctMemoryAction({ id, content: c, reason })); }}>Correct</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => { const reason = prompt("Why revoke it?"); if (reason) go(() => revokeMemoryAction({ id, reason })); }}>Revoke</Button>
    </div>
  );
}
