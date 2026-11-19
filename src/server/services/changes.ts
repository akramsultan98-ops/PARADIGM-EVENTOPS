import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { normaliseChanges, projectDatesAfter, toUpdateData } from "./change-validation";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Load a change-request target only if it belongs to the request's project (or, for vehicles, the company).
 * Used when a change is proposed AND again when it is applied, so an approval on project A can never
 * read or mutate an entity of project B or of another company.
 */
export async function loadChangeTarget(entityType: string, entityId: string, projectId: string, companyId: string, client: Client = db): Promise<Record<string, unknown>> {
  const notFound = () => { throw new Error("The change target does not belong to this project"); };
  let row: unknown = null;
  if (entityType === "ProductionItem") row = await client.productionItem.findFirst({ where: { id: entityId, projectId, project: { companyId } } });
  else if (entityType === "EquipmentRequirement") row = await client.equipmentRequirement.findFirst({ where: { id: entityId, projectId, project: { companyId } } });
  else if (entityType === "Project") row = entityId === projectId ? await client.project.findFirst({ where: { id: projectId, companyId } }) : null;
  else if (entityType === "Vehicle") row = await client.vehicle.findFirst({ where: { id: entityId, companyId } });
  else throw new Error(`Unsupported change target ${entityType}`);
  return (row as Record<string, unknown> | null) ?? notFound();
}

/**
 * Apply an APPROVED change. Pass the approval transaction as `client` so that a failure here rolls back the
 * approval decision too (P1-3). Values are re-validated against the CURRENT record: ownership, types, ranges
 * and project date order — a stale or invalid request fails before anything is written.
 */
export async function applyApprovedChange(changeId: string, companyId: string, client: Client = db) {
  const ch = await client.projectChange.findFirstOrThrow({ where: { id: changeId, project: { companyId } } });
  if (ch.status !== "APPROVED") throw new Error(`Change request is ${ch.status.toLowerCase()}, not approved`);
  if (!ch.entityId) throw new Error("Change request has no target");
  const current = await loadChangeTarget(ch.entityType, ch.entityId, ch.projectId, companyId, client);
  const changes = normaliseChanges(ch.entityType, ch.changes as { field: string; to: unknown }[]);
  if (ch.entityType === "Project") {
    const p = current as unknown as { setupStart: Date; setupEnd: Date; eventStart: Date; eventEnd: Date; dismantleStart: Date | null; dismantleEnd: Date | null };
    projectDatesAfter(p, changes);
  }
  const data = toUpdateData(changes);
  if (ch.entityType === "ProductionItem") {
    const before = await client.productionItem.findUniqueOrThrow({ where: { id: ch.entityId }, include: { specs: true } });
    // the approved change request IS the authorisation: approvalStatus stays APPROVED; the calculation becomes an estimate until the revised drawing
    await client.productionItem.update({ where: { id: ch.entityId }, data: { ...data, drawingStatus: "PROVIDED", calculationState: "ESTIMATED", notes: `${before.notes ?? ""}\nChanged by approved change request "${ch.title}" — revised drawing required.`.trim() } });
    // revised component list must come from the revised drawing; scale proportionally only as a flagged estimate
    const fw = data.widthM && before.widthM ? Number(data.widthM) / before.widthM : 1;
    const fh = data.heightM && before.heightM ? Number(data.heightM) / before.heightM : 1;
    for (const s of before.specs) {
      if (s.kind === "PANEL" || s.kind === "PAINT_SURFACE") await client.productionSpecification.update({ where: { id: s.id }, data: { quantity: Math.max(1, Math.ceil(s.quantity * fw * fh - 1e-9)), notes: "Scaled from change request — confirm with revised drawing" } });
      if (s.kind === "FRAME_MEMBER") await client.productionSpecification.update({ where: { id: s.id }, data: { quantity: Math.max(1, Math.ceil(s.quantity * Math.max(fw, fh) - 1e-9)), notes: "Scaled from change request — confirm with revised drawing" } });
    }
  } else if (ch.entityType === "Project") await client.project.update({ where: { id: ch.entityId }, data });
  else if (ch.entityType === "Vehicle") await client.vehicle.update({ where: { id: ch.entityId }, data });
  else if (ch.entityType === "EquipmentRequirement") await client.equipmentRequirement.update({ where: { id: ch.entityId }, data });
  const applied = await client.projectChange.updateMany({ where: { id: ch.id, status: "APPROVED" }, data: { status: "APPLIED" } });
  if (applied.count !== 1) throw new Error("Change request was modified concurrently");
  return ch;
}
