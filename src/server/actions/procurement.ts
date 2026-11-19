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

/** Vendor and quotations can only change before Finance sees the request (P2-C). */
const EDITABLE = ["DRAFT", "RFQ_PREPARED", "QUOTED"];

export async function procurementTransitionAction(id: string, to: string, vendorId?: string | null) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "procurement.manage");
    const r = await loadReq(u.companyId, id);
    if (!NEXT[r.status]?.includes(to)) throw new Error(`Cannot move from ${r.status} to ${to}`);
    if (vendorId !== undefined && vendorId !== r.vendorId) {
      if (!EDITABLE.includes(r.status)) throw new Error("The vendor cannot change after the request was submitted for approval");
      if (vendorId) await db.vendor.findFirstOrThrow({ where: { id: vendorId, companyId: u.companyId } }).catch(() => { throw new Error("Unknown vendor"); });
    }
    const selected = await db.vendorQuote.findFirst({ where: { procurementRequestId: id, status: "SELECTED" } });
    if (to === "PENDING_APPROVAL" && !selected) throw new Error("Select a quotation before submitting for approval");
    if (to === "ORDERED" && (!selected || selected.vendorId !== r.vendorId)) throw new Error("Orders can only be placed with the vendor of the approved quotation");
    await db.$transaction(async (tx) => {
      const moved = await tx.procurementRequest.updateMany({ where: { id, status: r.status }, data: { status: to as never, ...(vendorId !== undefined && EDITABLE.includes(r.status) ? { vendorId } : {}) } });
      if (moved.count !== 1) throw new Error("The request was changed by someone else — reload and try again");
      if (to === "PENDING_APPROVAL") await tx.approval.create({ data: { companyId: u.companyId, projectId: r.projectId, entityType: "PROCUREMENT", entityId: r.id, title: `Purchase request ${r.code} — ${r.item}`, description: `${r.quantity} ${r.unit} @ ${selected!.unitPrice} ${selected!.currency}`, requiredRole: "FINANCE", requestedById: u.id } });
      await tx.auditLog.create({ data: { companyId: u.companyId, userId: u.id, projectId: r.projectId, action: `PROCUREMENT_${to}`, entityType: "ProcurementRequest", entityId: id } });
    });
    if (to === "PENDING_APPROVAL") await notify({ roles: ["FINANCE"] }, { companyId: u.companyId, projectId: r.projectId, type: "APPROVAL", title: `Purchase request ${r.code} needs approval`, link: "/approvals" });
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
    if (!EDITABLE.includes(r.status)) throw new Error("Quotations cannot be added after the request was submitted for approval");
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
    const q = await db.vendorQuote.findFirstOrThrow({ where: { id: quoteId, vendor: { companyId: u.companyId }, procurementRequest: { project: { companyId: u.companyId } } } });
    if (!q.procurementRequestId) throw new Error("Quote is not linked to a request");
    const reqId = q.procurementRequestId;
    await db.$transaction(async (tx) => {
      // an approved (or ordered) selection can never be silently replaced
      const locked = await tx.procurementRequest.updateMany({ where: { id: reqId, status: { in: EDITABLE as never } }, data: { vendorId: q.vendorId, unitPrice: q.unitPrice, currency: q.currency, status: "QUOTED" } });
      if (locked.count !== 1) throw new Error("The quotation cannot change after the request was submitted for approval");
      await tx.vendorQuote.updateMany({ where: { procurementRequestId: reqId }, data: { status: "RECEIVED" } });
      await tx.vendorQuote.update({ where: { id: q.id }, data: { status: "SELECTED" } });
      await tx.auditLog.create({ data: { companyId: u.companyId, userId: u.id, action: "QUOTE_SELECTED", entityType: "ProcurementRequest", entityId: reqId, details: { quoteId: q.id, vendorId: q.vendorId } } });
    });
    revalidatePath("/procurement");
  }, "Quotation selected — submit for approval when ready");
}

export async function recordDeliveryAction(id: string, received: number) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "procurement.manage");
    const r = await loadReq(u.companyId, id);
    if (!["ORDERED", "PARTIALLY_DELIVERED"].includes(r.status)) throw new Error("Only ordered items can be received");
    if (!(Number.isFinite(received) && received > 0 && received <= 1e7)) throw new Error("Invalid quantity");
    // atomic increment under the row lock: concurrent deliveries can never lose an update (P3)
    const total = await db.$transaction(async (tx) => {
      const inc = await tx.procurementRequest.updateMany({ where: { id, status: { in: ["ORDERED", "PARTIALLY_DELIVERED"] } }, data: { receivedQuantity: { increment: received } } });
      if (inc.count !== 1) throw new Error("Only ordered items can be received");
      const now = await tx.procurementRequest.findUniqueOrThrow({ where: { id } });
      await tx.procurementRequest.update({ where: { id }, data: { status: now.receivedQuantity >= now.quantity ? "DELIVERED" : "PARTIALLY_DELIVERED" } });
      return now.receivedQuantity;
    });
    await audit({ companyId: u.companyId, userId: u.id, projectId: r.projectId, action: "DELIVERY_RECORDED", entityType: "ProcurementRequest", entityId: id, details: { received, total } });
    revalidatePath("/procurement");
  }, "Delivery recorded");
}
