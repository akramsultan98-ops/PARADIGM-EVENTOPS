"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { run } from "./_util";

async function loadReq(companyId: string, id: string) {
  return db.procurementRequest.findFirstOrThrow({ where: { id, project: { companyId } }, include: { project: true } });
}

const NEXT: Record<string, string[]> = {
  DRAFT: ["RFQ_PREPARED", "CANCELLED"], RFQ_PREPARED: ["QUOTED", "CANCELLED"], QUOTED: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: [], APPROVED: ["ORDERED"], ORDERED: ["PARTIALLY_DELIVERED", "DELIVERED"], PARTIALLY_DELIVERED: ["DELIVERED"],
};

export async function procurementTransitionAction(id: string, to: string, vendorId?: string | null) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "procurement.manage");
    const r = await loadReq(u.companyId, id);
    if (!NEXT[r.status]?.includes(to)) throw new Error(`Cannot move from ${r.status} to ${to}`);
    if (to === "PENDING_APPROVAL") {
      const q = await db.vendorQuote.findFirst({ where: { procurementRequestId: id, status: "SELECTED" } });
      if (!q) throw new Error("Select a quotation before submitting for approval");
      await db.approval.create({ data: { companyId: u.companyId, projectId: r.projectId, entityType: "PROCUREMENT", entityId: r.id, title: `Purchase request ${r.code} — ${r.item}`, description: `${r.quantity} ${r.unit} @ ${q.unitPrice} ${q.currency}`, requiredRole: "FINANCE", requestedById: u.id } });
      await notify({ roles: ["FINANCE"] }, { companyId: u.companyId, projectId: r.projectId, type: "APPROVAL", title: `Purchase request ${r.code} needs approval`, link: "/approvals" });
    }
    await db.procurementRequest.update({ where: { id }, data: { status: to as never, ...(vendorId !== undefined ? { vendorId } : {}) } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: r.projectId, action: `PROCUREMENT_${to}`, entityType: "ProcurementRequest", entityId: id });
    revalidatePath("/procurement");
  }, "Procurement request updated");
}

const quoteSchema = z.object({ requestId: z.string(), vendorId: z.string(), unitPrice: z.coerce.number().positive(), currency: z.string().length(3), leadTimeDays: z.coerce.number().int().min(0).optional(), validUntil: z.string().optional() });

export async function addQuoteAction(input: z.input<typeof quoteSchema>) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "procurement.manage");
    const d = quoteSchema.parse(input);
    const r = await loadReq(u.companyId, d.requestId);
    await db.vendor.findFirstOrThrow({ where: { id: d.vendorId, companyId: u.companyId } });
    await db.vendorQuote.create({ data: { vendorId: d.vendorId, projectId: r.projectId, procurementRequestId: r.id, item: r.item, quantity: r.quantity, unitPrice: d.unitPrice, currency: d.currency.toUpperCase(), leadTimeDays: d.leadTimeDays, validUntil: d.validUntil ? new Date(d.validUntil) : null } });
    if (["DRAFT", "RFQ_PREPARED"].includes(r.status)) await db.procurementRequest.update({ where: { id: r.id }, data: { status: "QUOTED" } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: r.projectId, action: "QUOTE_RECORDED", entityType: "ProcurementRequest", entityId: r.id, details: { vendorId: d.vendorId, unitPrice: d.unitPrice } });
    revalidatePath("/procurement");
  }, "Quotation recorded");
}

export async function selectQuoteAction(quoteId: string) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "procurement.manage");
    const q = await db.vendorQuote.findFirstOrThrow({ where: { id: quoteId, vendor: { companyId: u.companyId } } });
    if (!q.procurementRequestId) throw new Error("Quote is not linked to a request");
    await db.$transaction([
      db.vendorQuote.updateMany({ where: { procurementRequestId: q.procurementRequestId }, data: { status: "RECEIVED" } }),
      db.vendorQuote.update({ where: { id: q.id }, data: { status: "SELECTED" } }),
      db.procurementRequest.update({ where: { id: q.procurementRequestId }, data: { vendorId: q.vendorId, unitPrice: q.unitPrice, currency: q.currency, status: "QUOTED" } }),
    ]);
    revalidatePath("/procurement");
  }, "Quotation selected — submit for approval when ready");
}

export async function recordDeliveryAction(id: string, received: number) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "procurement.manage");
    const r = await loadReq(u.companyId, id);
    if (!["ORDERED", "PARTIALLY_DELIVERED"].includes(r.status)) throw new Error("Only ordered items can be received");
    if (!(received >= 0)) throw new Error("Invalid quantity");
    const total = r.receivedQuantity + received;
    await db.procurementRequest.update({ where: { id }, data: { receivedQuantity: total, status: total >= r.quantity ? "DELIVERED" : "PARTIALLY_DELIVERED" } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: r.projectId, action: "DELIVERY_RECORDED", entityType: "ProcurementRequest", entityId: id, details: { received, total } });
    revalidatePath("/procurement");
  }, "Delivery recorded");
}
