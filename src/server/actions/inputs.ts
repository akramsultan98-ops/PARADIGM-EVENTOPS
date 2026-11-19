"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, requireUser, type AuthUser } from "@/lib/auth/session";
import { reviewSubmission } from "@/server/services/review";
import { projectScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { DEPARTMENT_APPROVER_ROLE } from "@/lib/permissions";
import { extractInput } from "@/ai/extract";
import { missingProduction } from "@/ai/validate";
import { run } from "./_util";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const optNum = z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v)));

async function scoped(projectId: string) {
  const u = await requireUser();
  const p = await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: projectId } });
  if (["COMPLETED", "CANCELLED"].includes(p.status)) throw new Error(`Project is ${p.status.toLowerCase()}`);
  return { u, p };
}
async function dept(u: AuthUser, key: string) { return db.department.findFirstOrThrow({ where: { companyId: u.companyId, key } }); }
function guardEdit(u: AuthUser, deptKey: string) {
  assertCan(u, "submission.create");
  if (["SUPER_ADMIN", "PROJECT_MANAGER", "ACCOUNT_MANAGER"].includes(u.role)) return;
  if (u.approvalDepartment === deptKey || u.departments.some((d) => d.key === deptKey)) return;
  throw new Error(`Only ${deptKey.toLowerCase()} team members can edit these inputs`);
}
async function markDeptInProgress(projectId: string, departmentId: string) {
  await db.projectDepartment.updateMany({ where: { projectId, departmentId, status: { in: ["DRAFT", "REJECTED"] } }, data: { status: "REVISED" } });
}

// ───────────── Production structured form (multi-step wizard) ─────────────
const specSchema = z.object({ kind: z.enum(["PANEL", "FRAME_MEMBER", "PAINT_SURFACE", "ACCESSORY"]), label: z.string().min(1).max(120), materialId: z.string().optional().nullable(), lengthM: optNum, widthM: optNum, quantity: z.coerce.number().int().min(1).max(100000), sides: z.coerce.number().int().min(1).max(2).default(1), coats: optNum, drawingRef: z.string().max(120).optional().nullable() });
const itemSchema = z.object({
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9-]+$/), name: z.string().trim().min(2).max(160),
  category: z.enum(["STAGE", "BACKDROP", "PODIUM", "BOOTH", "COUNTER", "FURNITURE", "DECORATIVE", "SIGNAGE", "CARPENTRY", "PAINTING", "BRANDING_INSTALL", "FLOORING", "OTHER"]),
  quantity: z.coerce.number().int().min(1).max(1000), widthM: optNum, heightM: optNum, depthM: optNum, packedVolumeM3: optNum,
  boardMaterialId: z.string().optional().nullable(), finishing: z.string().max(200).optional().nullable(), color: z.string().max(60).optional().nullable(), paintCoats: optNum,
  constructionMethod: z.string().max(500).optional().nullable(), installationMethod: z.string().max(500).optional().nullable(), installationDay: optNum, specialTools: z.string().max(300).optional().nullable(),
  engineeringApprovalRequired: z.boolean().default(false), notes: z.string().max(2000).optional().nullable(), specs: z.array(specSchema).max(200).default([]),
});
const productionSubmission = z.object({ projectId: z.string(), submissionId: z.string().optional(), title: z.string().min(3).max(200), items: z.array(itemSchema).min(1).max(50), submit: z.boolean(), formStep: z.number().int().min(1).max(10).default(10), documentIds: z.array(z.string()).default([]) });

export async function saveProductionSubmissionAction(input: z.input<typeof productionSubmission>) {
  return run(async () => {
    const d = productionSubmission.parse(input);
    const { u, p } = await scoped(d.projectId);
    guardEdit(u, "PRODUCTION");
    if (d.submit) assertCan(u, "submission.submit");
    const dep = await dept(u, "PRODUCTION");
    const mats = new Set((await db.material.findMany({ where: { companyId: u.companyId }, select: { id: true } })).map((m) => m.id));
    for (const it of d.items) {
      if (it.boardMaterialId && !mats.has(it.boardMaterialId)) throw new Error("Unknown board material");
      for (const s of it.specs) if (s.materialId && !mats.has(s.materialId)) throw new Error("Unknown material in components");
    }
    const missing = d.items.flatMap((it, i) => missingProduction({ name: it.name, category: it.category, quantity: it.quantity, widthM: it.widthM, heightM: it.heightM, depthM: it.depthM ?? (it.packedVolumeM3 ? 1 : null), material: it.boardMaterialId ? "board" : it.specs.length ? "specified" : null, thicknessMm: 1, finishing: it.finishing ?? null, color: it.color ?? null, paintCoats: it.paintCoats ?? (it.specs.some((s) => s.kind === "PAINT_SURFACE") ? 1 : null), constructionMethod: it.constructionMethod ?? null, installationDay: it.installationDay, notes: null }, i).filter((m) => m.field !== "drawing" || (!d.documentIds.length && it.specs.length === 0)));
    const status = d.submit ? (missing.length ? "NEEDS_INFORMATION" : "SUBMITTED") : "DRAFT";
    // Validate everything BEFORE writing: approved source data changes only through a change request.
    const prior = d.submissionId ? await db.departmentSubmission.findFirstOrThrow({ where: { id: d.submissionId, projectId: p.id, departmentId: dep.id } }) : null;
    if (prior?.status === "APPROVED") throw new Error("This submission is already approved — use a change request to modify it");
    const approved = await db.productionItem.findMany({ where: { projectId: p.id, code: { in: d.items.map((it) => it.code.toUpperCase()) }, approvalStatus: "APPROVED" }, select: { code: true } });
    if (approved.length) throw new Error(`${approved.map((a) => a.code).join(", ")} ${approved.length > 1 ? "are" : "is"} already approved — use a change request to modify ${approved.length > 1 ? "them" : "it"}`);
    const sub = prior
      ? await db.departmentSubmission.update({ where: { id: prior.id }, data: { title: d.title, status, formStep: d.formStep, missingFields: json(missing), submittedAt: d.submit ? new Date() : undefined, version: { increment: 1 } } })
      : await db.departmentSubmission.create({ data: { projectId: p.id, departmentId: dep.id, submittedById: u.id, title: d.title, method: "FORM", status, formStep: d.formStep, missingFields: json(missing), submittedAt: d.submit ? new Date() : null } });
    for (const it of d.items) {
      const existing = await db.productionItem.findUnique({ where: { projectId_code: { projectId: p.id, code: it.code.toUpperCase() } } });
      const data = { name: it.name, category: it.category, quantity: it.quantity, widthM: it.widthM, heightM: it.heightM, depthM: it.depthM, packedVolumeM3: it.packedVolumeM3, boardMaterialId: it.boardMaterialId || null, finishing: it.finishing, color: it.color, paintCoats: it.paintCoats, constructionMethod: it.constructionMethod, installationMethod: it.installationMethod, installationDay: it.installationDay, specialTools: it.specialTools, engineeringApprovalRequired: it.engineeringApprovalRequired, notes: it.notes, submissionId: sub.id, drawingStatus: (d.documentIds.length || it.specs.length ? "PROVIDED" : "MISSING") as "PROVIDED" | "MISSING", calculationState: "ESTIMATED" as const, approvalStatus: (status === "SUBMITTED" ? "UNDER_REVIEW" : "DRAFT") as "UNDER_REVIEW" | "DRAFT" };
      const item = existing ? await db.productionItem.update({ where: { id: existing.id }, data }) : await db.productionItem.create({ data: { ...data, projectId: p.id, code: it.code.toUpperCase() } });
      await db.productionSpecification.deleteMany({ where: { productionItemId: item.id } });
      if (it.specs.length) await db.productionSpecification.createMany({ data: it.specs.map((s) => ({ productionItemId: item.id, kind: s.kind, label: s.label, materialId: s.materialId || null, lengthM: s.lengthM, widthM: s.widthM, quantity: s.quantity, sides: s.sides, coats: s.coats, drawingRef: s.drawingRef || null })) });
    }
    if (d.documentIds.length) await db.uploadedDocument.updateMany({ where: { id: { in: d.documentIds }, companyId: u.companyId, projectId: p.id }, data: { submissionId: sub.id } });
    await markDeptInProgress(p.id, dep.id);
    if (status === "SUBMITTED") await requestReview(u, p.id, sub.id, "PRODUCTION", d.title);
    if (status !== "DRAFT") await db.projectDepartment.updateMany({ where: { projectId: p.id, departmentId: dep.id }, data: { status } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: `PRODUCTION_INPUT_${status}`, entityType: "DepartmentSubmission", entityId: sub.id, details: { items: d.items.map((i) => i.code), missing: missing.length } });
    revalidatePath(`/projects/${p.id}`, "layout");
    revalidatePath("/production");
    return { submissionId: sub.id, status, missing };
  });
}

async function requestReview(u: AuthUser, projectId: string, submissionId: string, deptKey: string, title: string) {
  await db.approval.updateMany({ where: { entityType: "SUBMISSION", entityId: submissionId, status: "PENDING" }, data: { status: "CHANGES_REQUESTED", decisionNote: "Superseded by resubmission", decidedAt: new Date() } });
  await db.approval.create({ data: { companyId: u.companyId, projectId, entityType: "SUBMISSION", entityId: submissionId, title, requiredRole: DEPARTMENT_APPROVER_ROLE[deptKey] ?? "PROJECT_MANAGER", requestedById: u.id } });
  await notify({ roles: [DEPARTMENT_APPROVER_ROLE[deptKey] ?? "PROJECT_MANAGER"] }, { companyId: u.companyId, projectId, type: "APPROVAL", title: `Technical review requested: ${title}`, link: "/approvals" });
}

// ───────────── Conversational (AI / rule-based) input ─────────────
export async function conversationalExtractAction(projectId: string, department: string, text: string) {
  return run(async () => {
    const { u, p } = await scoped(projectId);
    guardEdit(u, department);
    const body = z.string().trim().min(10).max(20000).parse(text);
    const dep = await dept(u, department);
    const sub = await db.departmentSubmission.create({ data: { projectId: p.id, departmentId: dep.id, submittedById: u.id, title: `Conversational input — ${body.slice(0, 60)}${body.length > 60 ? "…" : ""}`, method: "AI_CONVERSATION", status: "EXTRACTING", rawText: body } });
    const ctx = `${p.name} (${p.code}), ${p.location}; setup ${p.setupStart.toISOString().slice(0, 10)}, event ${p.eventStart.toISOString().slice(0, 10)}; ${p.participants} participants.`;
    const out = await extractInput(body, { department, projectContext: ctx });
    const status = out.missing.length ? "NEEDS_INFORMATION" : "DRAFT";
    await db.departmentSubmission.update({ where: { id: sub.id }, data: { status, extracted: json({ ...out.extraction, engineNote: out.engineNote, aiError: out.aiError ?? null }), missingFields: json(out.missing) } });
    await db.submissionField.createMany({ data: out.extraction.evidence.map((e) => ({ submissionId: sub.id, key: e.field, label: e.field, value: e.snippet, state: "UNDER_REVIEW" as const, method: out.extraction.engine === "AI" ? ("AI" as const) : ("RULE_BASED" as const), isAssumption: false, sourceSnippet: e.snippet })) });
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: "CONVERSATIONAL_EXTRACTION", entityType: "DepartmentSubmission", entityId: sub.id, details: { engine: out.extraction.engine, missing: out.missing.length } });
    revalidatePath(`/projects/${p.id}/inputs`);
    return { submissionId: sub.id, extraction: out.extraction, missing: out.missing, engineNote: out.engineNote };
  });
}

/** Employee-confirmed (corrected) extraction → production items as DRAFT (never auto-approved). */
export async function confirmExtractionAction(submissionId: string, items: z.input<typeof itemSchema>[], submit: boolean, documentIds: string[] = []) {
  return run(async () => {
    const u = await requireUser();
    const sub = await db.departmentSubmission.findFirstOrThrow({ where: { id: submissionId, project: projectScope(u) }, include: { department: true } });
    const linked = (await db.uploadedDocument.findMany({ where: { OR: [{ id: { in: documentIds } }, { submissionId: sub.id }], companyId: u.companyId, projectId: sub.projectId }, select: { id: true } })).map((d) => d.id);
    const r = await saveProductionSubmissionAction({ projectId: sub.projectId, submissionId: sub.id, title: sub.title.replace("Conversational input — ", "Confirmed: "), items, submit, formStep: 10, documentIds: linked });
    if (!r.ok) throw new Error(r.error);
    await db.submissionField.updateMany({ where: { submissionId }, data: { state: "VERIFIED" } });
    return r.data;
  });
}

// ───────────── submit & technical review ─────────────
export async function submitSubmissionAction(submissionId: string) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "submission.submit");
    const s = await db.departmentSubmission.findFirstOrThrow({ where: { id: submissionId, project: projectScope(u) }, include: { department: true } });
    guardEdit(u, s.department.key);
    if (!["DRAFT", "NEEDS_INFORMATION", "REJECTED", "REVISED"].includes(s.status)) throw new Error(`Submission is already ${s.status.toLowerCase()}`);
    const missing = (s.missingFields as unknown[] | null) ?? [];
    // every submission method (form, conversation, document) must be complete before review
    if (missing.length) throw new Error(`Complete the ${missing.length} missing field(s) before submitting`);
    await db.departmentSubmission.update({ where: { id: s.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    await db.productionItem.updateMany({ where: { submissionId: s.id, approvalStatus: { in: ["DRAFT", "REJECTED"] } }, data: { approvalStatus: "UNDER_REVIEW" } });
    await db.equipmentRequirement.updateMany({ where: { submissionId: s.id, approvalStatus: { in: ["DRAFT", "REJECTED"] } }, data: { approvalStatus: "UNDER_REVIEW" } });
    await db.projectDepartment.updateMany({ where: { projectId: s.projectId, departmentId: s.departmentId }, data: { status: "SUBMITTED" } });
    await requestReview(u, s.projectId, s.id, s.department.key, s.title);
    await audit({ companyId: u.companyId, userId: u.id, projectId: s.projectId, action: "SUBMISSION_SUBMITTED", entityType: "DepartmentSubmission", entityId: s.id });
    revalidatePath(`/projects/${s.projectId}`, "layout");
  }, "Submitted for technical review");
}

export async function reviewSubmissionAction(submissionId: string, decision: "APPROVED" | "REJECTED" | "NEEDS_INFORMATION", note: string) {
  return run(async () => {
    const u = await requireUser();
    const d = z.object({ submissionId: z.string().min(1), decision: z.enum(["APPROVED", "REJECTED", "NEEDS_INFORMATION"]), note: z.string().max(2000) }).parse({ submissionId, decision, note: note ?? "" });
    // atomic: status gate, self-review block, item approvals and the pending approval are decided together
    const s = await db.$transaction((tx) => reviewSubmission(tx, u, d.submissionId, d.decision, d.note));
    await notify({ userIds: [s.submittedById] }, { companyId: u.companyId, projectId: s.projectId, type: "APPROVAL", title: `${s.title}: ${d.decision.replace("_", " ").toLowerCase()}`, body: d.note || undefined, link: `/projects/${s.projectId}/inputs?submission=${s.id}` });
    revalidatePath(`/projects/${s.projectId}`, "layout");
    revalidatePath("/approvals");
  }, "Review recorded");
}

// ───────────── AV requirements ─────────────
const avSchema = z.object({ projectId: z.string(), submit: z.boolean().default(false), lines: z.array(z.object({ equipmentId: z.string().optional().nullable(), category: z.string(), description: z.string().min(2).max(200), quantity: z.coerce.number().int().min(1).max(10000), backupQuantity: z.coerce.number().int().min(0).max(1000).default(0), specs: z.string().max(500).optional().nullable() })).min(1).max(100) });
export async function saveAvRequirementsAction(input: z.input<typeof avSchema>) {
  return run(async () => {
    const d = avSchema.parse(input);
    const { u, p } = await scoped(d.projectId);
    guardEdit(u, "AV");
    const dep = await dept(u, "AV");
    const eqIds = new Set((await db.equipment.findMany({ where: { companyId: u.companyId }, select: { id: true } })).map((e) => e.id));
    const sub = await db.departmentSubmission.create({ data: { projectId: p.id, departmentId: dep.id, submittedById: u.id, title: `AV requirements (${d.lines.length} lines)`, method: "FORM", status: d.submit ? "SUBMITTED" : "DRAFT", submittedAt: d.submit ? new Date() : null } });
    for (const l of d.lines) await db.equipmentRequirement.create({ data: { projectId: p.id, submissionId: sub.id, equipmentId: l.equipmentId && eqIds.has(l.equipmentId) ? l.equipmentId : null, category: l.category as never, description: l.description, quantity: l.quantity, backupQuantity: l.backupQuantity, specs: l.specs, approvalStatus: d.submit ? "UNDER_REVIEW" : "DRAFT" } });
    await markDeptInProgress(p.id, dep.id);
    if (d.submit) { await db.projectDepartment.updateMany({ where: { projectId: p.id, departmentId: dep.id }, data: { status: "SUBMITTED" } }); await requestReview(u, p.id, sub.id, "AV", sub.title); }
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: "AV_INPUT_SAVED", entityType: "DepartmentSubmission", entityId: sub.id });
    revalidatePath(`/projects/${p.id}`, "layout");
    return { submissionId: sub.id };
  }, "AV requirements saved");
}

export async function deleteAvRequirementAction(id: string) {
  return run(async () => {
    const u = await requireUser();
    const r = await db.equipmentRequirement.findFirstOrThrow({ where: { id, project: projectScope(u) } });
    guardEdit(u, "AV");
    if (r.approvalStatus === "APPROVED") throw new Error("Approved requirements can only change through a change request");
    await db.equipmentRequirement.delete({ where: { id } });
    revalidatePath(`/projects/${r.projectId}/av`);
  }, "Requirement removed");
}

// ───────────── Logistics cargo, accommodation, creative ─────────────
const cargoSchema = z.object({ projectId: z.string(), name: z.string().min(2).max(160), quantity: z.coerce.number().int().min(1), lengthM: optNum, widthM: optNum, heightM: optNum, unitWeightKg: optNum, fragile: z.boolean().default(false), handlingNotes: z.string().max(300).optional() });
export async function addCargoAction(input: z.input<typeof cargoSchema>) {
  return run(async () => {
    const d = cargoSchema.parse(input);
    const { u, p } = await scoped(d.projectId);
    guardEdit(u, "LOGISTICS");
    await db.cargoItem.create({ data: { projectId: p.id, sourceType: "OTHER", name: d.name, quantity: d.quantity, lengthM: d.lengthM, widthM: d.widthM, heightM: d.heightM, unitWeightKg: d.unitWeightKg, fragile: d.fragile, handlingNotes: d.handlingNotes, state: d.unitWeightKg && d.lengthM && d.widthM && d.heightM ? "VERIFIED" : "NEEDS_INFORMATION" } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: "CARGO_ADDED", entityType: "CargoItem", details: { name: d.name } });
    revalidatePath(`/projects/${p.id}/logistics`);
  }, "Cargo added — regenerate the plan to update the fleet allocation");
}

const guestSchema = z.object({ projectId: z.string(), id: z.string().optional(), guestName: z.string().max(120).optional().nullable(), employeeCode: z.string().max(40).optional().nullable(), departmentKey: z.string().optional().nullable(), jobRole: z.string().max(80).optional().nullable(), hotelId: z.string().optional().nullable(), roomTypeId: z.string().optional().nullable(), roomLabel: z.string().max(30).optional().nullable(), checkIn: z.string().optional().nullable(), checkOut: z.string().optional().nullable(), bookingStatus: z.enum(["REQUESTED", "QUOTED", "CONFIRMED", "CANCELLED"]).default("REQUESTED"), confirmationRef: z.string().max(60).optional().nullable(), specialRequests: z.string().max(300).optional().nullable() });
export async function saveGuestAction(input: z.input<typeof guestSchema>) {
  return run(async () => {
    const d = guestSchema.parse(input);
    const { u, p } = await scoped(d.projectId);
    guardEdit(u, "ACCOMMODATION");
    if (d.checkIn && d.checkOut && d.checkOut <= d.checkIn) throw new Error("Check-out must be after check-in");
    if (d.bookingStatus === "CONFIRMED" && !d.confirmationRef) throw new Error("A confirmation reference is required for confirmed bookings");
    if (d.hotelId) await db.hotel.findFirstOrThrow({ where: { id: d.hotelId, companyId: u.companyId } });
    const dep = d.departmentKey ? await db.department.findFirst({ where: { companyId: u.companyId, key: d.departmentKey } }) : null;
    const data = { guestName: d.guestName || null, employeeCode: d.employeeCode || null, departmentId: dep?.id ?? null, jobRole: d.jobRole || null, hotelId: d.hotelId || null, roomTypeId: d.roomTypeId || null, roomLabel: d.roomLabel || null, sharedRoom: !!d.roomLabel, checkIn: d.checkIn ? new Date(`${d.checkIn}T12:00:00Z`) : null, checkOut: d.checkOut ? new Date(`${d.checkOut}T12:00:00Z`) : null, arrivalDate: d.checkIn ? new Date(`${d.checkIn}T12:00:00Z`) : null, bookingStatus: d.bookingStatus, confirmationRef: d.confirmationRef || null, specialRequests: d.specialRequests || null };
    if (d.id) await db.accommodationAssignment.update({ where: { id: (await db.accommodationAssignment.findFirstOrThrow({ where: { id: d.id, projectId: p.id } })).id }, data });
    else await db.accommodationAssignment.create({ data: { ...data, projectId: p.id } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: d.id ? "GUEST_UPDATED" : "GUEST_ADDED", entityType: "AccommodationAssignment", entityId: d.id, details: { guest: d.guestName, status: d.bookingStatus } });
    revalidatePath(`/projects/${p.id}/accommodation`);
    revalidatePath("/accommodation/rooming");
  }, "Rooming list updated");
}

const brandingSchema = z.object({ projectId: z.string(), name: z.string().min(2).max(160), widthM: optNum, heightM: optNum, quantity: optNum, material: z.string().max(120).optional(), printMethod: z.string().max(120).optional(), installationMethod: z.string().max(200).optional(), vendorId: z.string().optional().nullable(), leadTimeDays: optNum, unitCost: optNum, clientApprovalDeadline: z.string().optional().nullable(), deliveryDeadline: z.string().optional().nullable() });
export async function addBrandingAction(input: z.input<typeof brandingSchema>) {
  return run(async () => {
    const d = brandingSchema.parse(input);
    const { u, p } = await scoped(d.projectId);
    guardEdit(u, "CREATIVE");
    if (d.vendorId) await db.vendor.findFirstOrThrow({ where: { id: d.vendorId, companyId: u.companyId } });
    await db.brandingItem.create({ data: { projectId: p.id, name: d.name, widthM: d.widthM, heightM: d.heightM, quantity: d.quantity == null ? null : Math.round(d.quantity), material: d.material, printMethod: d.printMethod, installationMethod: d.installationMethod, vendorId: d.vendorId || null, leadTimeDays: d.leadTimeDays == null ? null : Math.round(d.leadTimeDays), unitCost: d.unitCost, clientApprovalDeadline: d.clientApprovalDeadline ? new Date(`${d.clientApprovalDeadline}T12:00:00Z`) : null, deliveryDeadline: d.deliveryDeadline ? new Date(`${d.deliveryDeadline}T12:00:00Z`) : null, state: d.widthM && d.heightM && d.quantity ? "ESTIMATED" : "NEEDS_INFORMATION" } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: "BRANDING_ADDED", entityType: "BrandingItem", details: { name: d.name } });
    revalidatePath(`/projects/${p.id}/creative`);
  }, "Branding item added");
}

export async function setBrandingApprovalAction(id: string, status: "APPROVED" | "REJECTED" | "PENDING") {
  return run(async () => {
    const u = await requireUser();
    const b = await db.brandingItem.findFirstOrThrow({ where: { id, project: projectScope(u) } });
    guardEdit(u, "CREATIVE");
    await db.brandingItem.update({ where: { id }, data: { approvalStatus: status } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: b.projectId, action: `CLIENT_ARTWORK_${status}`, entityType: "BrandingItem", entityId: id, details: { note: "Recorded client decision" } });
    revalidatePath(`/projects/${b.projectId}/creative`);
  }, "Client approval status recorded");
}

// ───────────── brief requirements, manual costs, risks ─────────────
export async function addRequirementAction(projectId: string, input: { category: string; title: string; quantity?: string; unit?: string }) {
  return run(async () => {
    const { u, p } = await scoped(projectId);
    assertCan(u, "project.edit");
    const d = z.object({ category: z.string().min(2).max(40), title: z.string().min(2).max(300), quantity: optNum, unit: z.string().max(30).optional() }).parse(input);
    await db.eventRequirement.create({ data: { projectId: p.id, category: d.category, title: d.title, quantity: d.quantity, unit: d.unit || null } });
    revalidatePath(`/projects/${p.id}/brief`);
  }, "Requirement added");
}

export async function addManualCostAction(projectId: string, input: { category: string; description: string; quantity: string; unit: string; unitCost: string; currency: string; basis: string }) {
  return run(async () => {
    const { u, p } = await scoped(projectId);
    if (!u.permissions.has("budget.approve") && !u.permissions.has("procurement.manage") && u.role !== "PROJECT_MANAGER") throw new Error("Not permitted to enter costs");
    const d = z.object({ category: z.enum(["MATERIALS", "LABOR", "AV_EQUIPMENT", "RENTALS", "TRANSPORTATION", "ACCOMMODATION", "VENDORS", "PRINTING", "OPERATIONS"]), description: z.string().min(2).max(200), quantity: z.coerce.number().positive(), unit: z.string().min(1).max(30), unitCost: z.coerce.number().min(0), currency: z.string().length(3), basis: z.enum(["ACTUAL", "APPROVED_QUOTE", "ESTIMATE", "PENDING_QUOTE"]) }).parse(input);
    await db.costItem.create({ data: { projectId: p.id, category: d.category, description: d.description, quantity: d.quantity, unit: d.unit, unitCost: d.unitCost, amount: Math.round(d.quantity * d.unitCost * 100) / 100, currency: d.currency.toUpperCase(), basis: d.basis } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: "COST_ADDED", entityType: "CostItem", details: d });
    revalidatePath(`/projects/${p.id}/budget`);
  }, "Cost line added — regenerate the plan to refresh totals");
}

export async function updateRiskAction(riskId: string, input: { status: string; probability?: number; impact?: number; prevention?: string; contingency?: string }) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "risk.manage");
    const r = await db.risk.findFirstOrThrow({ where: { id: riskId, project: projectScope(u) } });
    const d = z.object({ status: z.enum(["IDENTIFIED", "MONITORING", "MITIGATED", "TRIGGERED", "CLOSED"]), probability: z.number().int().min(1).max(5).optional(), impact: z.number().int().min(1).max(5).optional(), prevention: z.string().max(1000).optional(), contingency: z.string().max(1000).optional() }).parse(input);
    const prob = d.probability ?? r.probability, imp = d.impact ?? r.impact;
    await db.risk.update({ where: { id: riskId }, data: { status: d.status, probability: prob, impact: imp, severity: prob * imp, prevention: d.prevention ?? r.prevention, contingency: d.contingency ?? r.contingency, generated: false } });
    if (d.status === "TRIGGERED") await notify({ roles: ["PROJECT_MANAGER"] }, { companyId: u.companyId, projectId: r.projectId, type: "RISK", title: `Risk triggered: ${r.title}`, body: `Plan B: ${r.contingency}`, link: `/projects/${r.projectId}/risks` });
    await audit({ companyId: u.companyId, userId: u.id, projectId: r.projectId, action: "RISK_UPDATED", entityType: "Risk", entityId: riskId, details: d });
    revalidatePath(`/projects/${r.projectId}/risks`);
    revalidatePath("/risks");
  }, "Risk updated");
}
