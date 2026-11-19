import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db, num } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { brandedPdf } from "@/server/services/pdf";

export const runtime = "nodejs";
/** Prepares an RFQ document. It is NOT sent — a person reviews and sends it (no binding requests without approval). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // RFQs are procurement documents (vendor, quantities, delivery dates): procurement staff only
  if (!u.permissions.has("procurement.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const r = await db.procurementRequest.findFirst({ where: { id, project: projectScope(u) }, include: { project: { include: { venue: true } }, vendor: true, material: true } });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { doc, h2, kv, finish } = brandedPdf(`Request for Quotation — ${r.code}`, `${r.project.name} · prepared ${new Date().toISOString().slice(0, 10)} · DRAFT for review before sending`, r.project.isDemo);
  h2("Request");
  kv([["To", r.vendor?.name ?? "Vendor to be selected"], ["Item", r.item], ["Quantity", `${r.quantity} ${r.unit}`], ["Specifications", r.material ? `${r.material.code} — ${r.material.name}${r.material.thicknessMm ? `, ${r.material.thicknessMm} mm` : ""}${r.material.stockLengthM ? `, ${r.material.stockLengthM}×${r.material.stockWidthM ?? ""} m` : ""}` : r.specifications ?? "—"], ["Required delivery", r.requiredByDate ? r.requiredByDate.toISOString().slice(0, 10) : "TBC"], ["Delivery location", "Paradigm warehouse, Cairo (to be confirmed)"], ["Reference price (internal)", num(r.unitPrice) != null ? "withheld" : "—"]]);
  h2("Please quote");
  doc.text("Unit price (excl. VAT), VAT %, total, lead time in days, validity date, payment terms and delivery conditions.");
  doc.moveDown().fontSize(8).fillColor("#666").text("This RFQ was prepared by PARADIGM EVENTOPS and must be reviewed and sent by an authorised Paradigm employee. It does not constitute a purchase order or commitment.");
  const pdf = await finish();
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="RFQ_${r.code.replace(/[^\w-]/g, "_")}.pdf"` } });
}
