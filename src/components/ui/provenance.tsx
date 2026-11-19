"use client";
import { FlaskConical } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";
import { StatusBadge } from "./kit";
import type { CalcTrace } from "@/engines/trace";

/** Shows how a number was produced: formula, inputs, outputs, assumptions, units, state, version. */
export function ProvenanceButton({ trace, label = "How was this calculated?" }: { trace: CalcTrace | null | undefined; label?: string }) {
  if (!trace) return null;
  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center gap-1 rounded px-1 text-2xs font-medium text-primary hover:underline" aria-label={label}>
        <FlaskConical className="size-3" />trace
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{trace.title}</DialogTitle>
          <DialogDescription>Engine <code>{trace.engine}</code> v{trace.engineVersion} · input hash <code>{trace.inputHash}</code></DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 text-sm">
          <div className="flex items-center gap-2"><StatusBadge status={trace.state} /><span className="text-xs text-muted-foreground">Units: {trace.units ?? "—"}</span></div>
          <section><div className="section-title mb-1">Formula</div><div className="rounded-md bg-muted p-3 font-mono text-xs">{trace.formula}</div></section>
          <section><div className="section-title mb-1">Outputs</div><pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(trace.outputs, null, 2)}</pre></section>
          <section><div className="section-title mb-1">Inputs</div><pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(trace.inputs, null, 2)}</pre></section>
          {trace.assumptions.length > 0 && <section><div className="section-title mb-1">Assumptions</div><ul className="list-disc space-y-1 ps-5 text-xs">{trace.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></section>}
          <p className="text-2xs text-muted-foreground">A calculated value is not an engineering verification. Structural, electrical and rigging designs require approval by qualified professionals.</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
