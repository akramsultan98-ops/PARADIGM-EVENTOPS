"use client";
import { useState, useTransition } from "react";
import { FileDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { StatusBadge, TableWrap } from "@/components/ui/kit";
import { toast } from "@/components/ui/toast";
import { addQuoteAction, procurementTransitionAction, recordDeliveryAction, selectQuoteAction } from "@/server/actions/procurement";
import { cn } from "@/lib/utils";

interface Req { id: string; code: string; item: string; project: string; projectId: string; quantity: number; unit: string; requiredBy: string | null; vendor: string | null; vendorId: string | null; unitPrice: number | null; currency: string; taxPct: number; status: string; received: number; specifications: string | null; quotes: { id: string; vendor: string; unitPrice: number | null; currency: string; leadTimeDays: number | null; status: string; validUntil: string | null }[] }

export function ProcurementBoard({ requests, vendors, canManage, canApprove, locale }: { requests: Req[]; vendors: { id: string; name: string }[]; canManage: boolean; canApprove: boolean; locale: "en" | "ar" }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<Req | null>(null);
  const act = (p: Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await p; if (r.ok) toast(r.message ?? "Saved"); else toast(r.error ?? "Failed", { tone: "error" }); });
  const fmt = (n: number | null, c: string) => (n == null ? "—" : `${new Intl.NumberFormat("en-US").format(n)} ${c}`);
  void canApprove;
  return (
    <Card className="min-w-0">
      <CardHeader><div><CardTitle>Purchase requests & RFQs</CardTitle><CardDescription>RFQs and purchase orders are prepared here; sending them to vendors and committing money requires human approval.</CardDescription></div></CardHeader>
      <TableWrap>
        <table className="data-table">
          <thead><tr><th>Code</th><th>Item</th><th>Project</th><th className="num">Qty</th><th>Required by</th><th>Vendor</th><th className="num">Unit price</th><th className="num">Total incl. tax</th><th>Quotes</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{requests.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-xs font-medium">{r.code}</td>
              <td className="min-w-[180px]"><div className="font-medium">{r.item}</div><div className="text-2xs text-muted-foreground">{r.specifications}</div></td>
              <td className="text-xs">{r.project}</td>
              <td className="num">{r.quantity} <span className="text-2xs text-muted-foreground">{r.unit}</span>{r.received > 0 && <div className="text-2xs text-success">rcvd {r.received}</div>}</td>
              <td className="whitespace-nowrap text-xs">{r.requiredBy ? new Date(r.requiredBy).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: "2-digit", month: "short" }) : "—"}</td>
              <td className="text-xs">{r.vendor ?? "—"}</td>
              <td className="num">{fmt(r.unitPrice, r.currency)}</td>
              <td className="num">{r.unitPrice != null ? fmt(Math.round(r.unitPrice * r.quantity * (1 + r.taxPct / 100)), r.currency) : "—"}</td>
              <td><button className="text-xs text-primary hover:underline" onClick={() => setOpen(r)}>{r.quotes.length} quote(s)</button></td>
              <td><StatusBadge status={r.status} locale={locale} /></td>
              <td className="whitespace-nowrap">
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" asChild title="Download RFQ (PDF)"><a href={`/api/procurement/${r.id}/rfq`}><FileDown /></a></Button>
                  {canManage && r.status === "DRAFT" && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(procurementTransitionAction(r.id, "RFQ_PREPARED"))}>Prepare RFQ</Button>}
                  {canManage && ["RFQ_PREPARED", "QUOTED", "DRAFT"].includes(r.status) && <Button size="sm" variant="outline" onClick={() => setOpen(r)}><Plus />Quote</Button>}
                  {canManage && r.status === "QUOTED" && r.quotes.some((q) => q.status === "SELECTED") && <Button size="sm" disabled={pending} onClick={() => act(procurementTransitionAction(r.id, "PENDING_APPROVAL"))}>Submit for approval</Button>}
                  {canManage && r.status === "APPROVED" && <Button size="sm" disabled={pending} onClick={() => act(procurementTransitionAction(r.id, "ORDERED"))}>Mark ordered</Button>}
                  {canManage && ["ORDERED", "PARTIALLY_DELIVERED"].includes(r.status) && <Button size="sm" variant="success" disabled={pending} onClick={() => { const v = prompt(`Quantity received (${r.unit})`, String(r.quantity - r.received)); if (v) act(recordDeliveryAction(r.id, Number(v))); }}>Receive</Button>}
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </TableWrap>
      {open && <QuoteDialog req={open} vendors={vendors} onClose={() => setOpen(null)} canManage={canManage} act={act} pending={pending} />}
    </Card>
  );
}

function QuoteDialog({ req, vendors, onClose, canManage, act, pending }: { req: Req; vendors: { id: string; name: string }[]; onClose: () => void; canManage: boolean; act: (p: Promise<{ ok: boolean; error?: string; message?: string }>) => void; pending: boolean }) {
  const priced = req.quotes.map((q) => q.unitPrice).filter((v): v is number => v != null);
  const best = priced.length ? Math.min(...priced) : null; // prices are null for users without budget.read
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Supplier comparison — {req.item}</DialogTitle><DialogDescription>{req.code} · {req.quantity} {req.unit}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <table className="data-table"><thead><tr><th>Vendor</th><th className="num">Unit price</th><th className="num">Total</th><th className="num">Lead time</th><th>Valid until</th><th /></tr></thead>
            <tbody>{req.quotes.map((q) => (
              <tr key={q.id} className={cn(q.status === "SELECTED" && "bg-success-soft/50")}><td className="font-medium">{q.vendor}{q.unitPrice === best && <span className="ms-2 rounded bg-success-soft px-1 text-[10px] font-bold text-success">LOWEST</span>}</td><td className="num">{q.unitPrice == null ? "—" : `${q.unitPrice.toLocaleString()} ${q.currency}`}</td><td className="num">{q.unitPrice == null ? "—" : `${(q.unitPrice * req.quantity).toLocaleString()} ${q.currency}`}</td><td className="num">{q.leadTimeDays ?? "—"} d</td><td className="text-xs">{q.validUntil?.slice(0, 10) ?? "—"}</td><td>{canManage && q.status !== "SELECTED" && !["PENDING_APPROVAL", "APPROVED", "ORDERED", "DELIVERED"].includes(req.status) && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(selectQuoteAction(q.id))}>Select</Button>}{q.status === "SELECTED" && <StatusBadge status="APPROVED" />}</td></tr>
            ))}</tbody></table>
          {req.quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotations yet.</p>}
          {canManage && !["PENDING_APPROVAL", "APPROVED", "ORDERED", "DELIVERED", "CANCELLED"].includes(req.status) && (
            <form className="grid gap-3 rounded-md border p-3 sm:grid-cols-4" action={(f) => act(addQuoteAction({ requestId: req.id, vendorId: String(f.get("vendorId")), unitPrice: String(f.get("unitPrice")) as unknown as number, currency: String(f.get("currency")), leadTimeDays: f.get("lead") ? (String(f.get("lead")) as unknown as number) : undefined, validUntil: String(f.get("valid") || "") || undefined }))}>
              <Field label="Vendor" className="sm:col-span-2"><NativeSelect name="vendorId" required>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</NativeSelect></Field>
              <Field label="Unit price"><Input name="unitPrice" type="number" step="0.01" min="0" required /></Field>
              <Field label="Currency"><Input name="currency" defaultValue={req.currency} maxLength={3} required /></Field>
              <Field label="Lead time (days)"><Input name="lead" type="number" min="0" /></Field>
              <Field label="Valid until"><Input name="valid" type="date" /></Field>
              <div className="flex items-end sm:col-span-2"><Button type="submit" disabled={pending}><Plus />Record quotation</Button></div>
            </form>
          )}
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
