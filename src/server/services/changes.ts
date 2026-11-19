import "server-only";
import { db } from "@/lib/db";
import { fromLocalInput } from "@/lib/format";

/** Apply an APPROVED change to the database (called from the approval action). */
export async function applyApprovedChange(changeId: string, companyId: string) {
  const ch = await db.projectChange.findFirstOrThrow({ where: { id: changeId, project: { companyId } } });
  const changes = ch.changes as { field: string; to: string | number | boolean }[];
  const data: Record<string, unknown> = {};
  for (const c of changes) data[c.field] = ["eventStart", "eventEnd", "setupStart"].includes(c.field) ? fromLocalInput(String(c.to)) : c.field === "available" ? c.to === true || c.to === "true" : Number(c.to);
  if (ch.entityType === "ProductionItem") {
    const before = await db.productionItem.findUniqueOrThrow({ where: { id: ch.entityId! }, include: { specs: true } });
    await db.productionItem.update({ where: { id: ch.entityId! }, data: { ...data, drawingStatus: "PROVIDED", state: "UNDER_REVIEW", notes: `${before.notes ?? ""}\nChanged by approved change request "${ch.title}" — revised drawing required.`.trim() } });
    // revised component list must come from the revised drawing; scale proportionally only as a flagged estimate
    const fw = data.widthM && before.widthM ? Number(data.widthM) / before.widthM : 1;
    const fh = data.heightM && before.heightM ? Number(data.heightM) / before.heightM : 1;
    for (const s of before.specs) {
      if (s.kind === "PANEL" || s.kind === "PAINT_SURFACE") await db.productionSpecification.update({ where: { id: s.id }, data: { quantity: Math.max(1, Math.ceil(s.quantity * fw * fh - 1e-9)), notes: "Scaled from change request — confirm with revised drawing" } });
      if (s.kind === "FRAME_MEMBER") await db.productionSpecification.update({ where: { id: s.id }, data: { quantity: Math.max(1, Math.ceil(s.quantity * Math.max(fw, fh) - 1e-9)), notes: "Scaled from change request — confirm with revised drawing" } });
    }
  } else if (ch.entityType === "Project") await db.project.update({ where: { id: ch.entityId! }, data });
  else if (ch.entityType === "Vehicle") await db.vehicle.update({ where: { id: ch.entityId! }, data });
  else if (ch.entityType === "EquipmentRequirement") await db.equipmentRequirement.update({ where: { id: ch.entityId! }, data });
  await db.projectChange.update({ where: { id: ch.id }, data: { status: "APPLIED" } });
  return ch;
}
