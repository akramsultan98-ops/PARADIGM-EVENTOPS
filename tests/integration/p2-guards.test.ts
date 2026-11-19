import { beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import { demo, loadUser, ok } from "../support/session";
import { zipWith } from "../support/zip";

/**
 * P2 regression suite (audit items A, C, D, E, F, G, H) — real server actions and services against PostgreSQL.
 */
const S = vi.hoisted(() => ({ user: null as unknown as import("@/lib/auth/session").AuthUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: vi.fn(async () => S.user), getCurrentUser: vi.fn(async () => S.user) }));

const db = new PrismaClient();
const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const as = async (email: string) => { S.user = await loadUser(email); return S.user as AuthUser; };
const fail = (r: { ok: boolean; error?: string }, re: RegExp) => { expect(r.ok).toBe(false); expect(r.error).toMatch(re); };
let companyId = "", aswanId = "", caiId = "", hrgId = "";

const item = (code: string, extra: Record<string, unknown> = {}) => ({ code, name: `P2 ${code}`, category: "BACKDROP" as const, quantity: 1, widthM: 3, heightM: 2, depthM: 0.2, finishing: "Paint", color: "White", paintCoats: 2, constructionMethod: "Frame", installationDay: 1, specs: [{ kind: "PANEL" as const, label: "Face", lengthM: 1.5, widthM: 1, quantity: 2, sides: 1 }], ...extra });

beforeAll(async () => {
  companyId = (await db.company.findFirstOrThrow({ where: { slug: "paradigm" } })).id;
  aswanId = (await db.project.findFirstOrThrow({ where: { code: "DEMO-ASW-2612" } })).id;
  caiId = (await db.project.findFirstOrThrow({ where: { code: "DEMO-CAI-2611" } })).id;
  hrgId = (await db.project.findFirstOrThrow({ where: { code: "DEMO-HRG-2703" } })).id;
});

describe("P2-A submission approval integrity", () => {
  it("DRAFT and NEEDS_INFORMATION submissions cannot be reviewed; incomplete inputs cannot be submitted", async () => {
    const { saveProductionSubmissionAction, reviewSubmissionAction, submitSubmissionAction } = await import("@/server/actions/inputs");
    await as(demo.member);
    const draft = ok<{ submissionId: string }>(await saveProductionSubmissionAction({ projectId: hrgId, title: "P2 draft", items: [item(`DRF-${tag()}`)], submit: false }));
    const incomplete = ok<{ submissionId: string; status: string }>(await saveProductionSubmissionAction({ projectId: hrgId, title: "P2 incomplete", items: [item(`INC-${tag()}`, { widthM: null, heightM: null })], submit: true }));
    expect(incomplete.status).toBe("NEEDS_INFORMATION");
    fail(await submitSubmissionAction(incomplete.submissionId), /missing field/);
    await as(demo.production);
    fail(await reviewSubmissionAction(draft.submissionId, "APPROVED", ""), /Only submitted inputs can be reviewed/);
    fail(await reviewSubmissionAction(incomplete.submissionId, "APPROVED", ""), /Only submitted inputs can be reviewed/);
  });

  it("a manager cannot review their own submission", async () => {
    const { saveProductionSubmissionAction, reviewSubmissionAction } = await import("@/server/actions/inputs");
    await as(demo.production);
    const own = ok<{ submissionId: string }>(await saveProductionSubmissionAction({ projectId: hrgId, title: "P2 own", items: [item(`OWN-${tag()}`)], submit: true }));
    fail(await reviewSubmissionAction(own.submissionId, "APPROVED", ""), /your own submission/);
  });

  it("approval never promotes records that were not submitted for review", async () => {
    const { reviewSubmissionAction } = await import("@/server/actions/inputs");
    const member = await loadUser(demo.member);
    const prod = await db.department.findFirstOrThrow({ where: { companyId, key: "PRODUCTION" } });
    const sub = await db.departmentSubmission.create({ data: { projectId: hrgId, departmentId: prod.id, submittedById: member.id, title: "P2 mixed", status: "SUBMITTED", method: "FORM" } });
    const submitted = await db.productionItem.create({ data: { projectId: hrgId, submissionId: sub.id, code: `RV-${tag()}`, name: "reviewed", category: "BACKDROP", approvalStatus: "UNDER_REVIEW" } });
    const draftItem = await db.productionItem.create({ data: { projectId: hrgId, submissionId: sub.id, code: `DR-${tag()}`, name: "estimated draft", category: "BACKDROP", approvalStatus: "DRAFT", calculationState: "ESTIMATED" } });
    await as(demo.production);
    ok(await reviewSubmissionAction(sub.id, "APPROVED", ""));
    expect((await db.productionItem.findUniqueOrThrow({ where: { id: submitted.id } })).approvalStatus).toBe("APPROVED");
    expect((await db.productionItem.findUniqueOrThrow({ where: { id: draftItem.id } })).approvalStatus).toBe("DRAFT");
  });
});

describe("P2-C procurement security", () => {
  it("vendor is company-scoped and locked after approval; quotations cannot be replaced; orders use the approved vendor", async () => {
    const { procurementTransitionAction, addQuoteAction, selectQuoteAction, recordDeliveryAction } = await import("@/server/actions/procurement");
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const vendors = await db.vendor.findMany({ where: { companyId }, take: 2, orderBy: { name: "asc" } });
    const other = await db.company.create({ data: { name: "Other vendor co", slug: `ov-${tag().toLowerCase()}` } });
    const foreign = await db.vendor.create({ data: { companyId: other.id, name: "Foreign vendor" } });
    const req = await db.procurementRequest.create({ data: { projectId: aswanId, code: `P2:${tag()}`, item: "Test plywood", quantity: 10, unit: "sheet" } });

    await as(demo.procurement);
    fail(await procurementTransitionAction(req.id, "RFQ_PREPARED", foreign.id), /Unknown vendor/);
    ok(await procurementTransitionAction(req.id, "RFQ_PREPARED", vendors[0].id));
    ok(await addQuoteAction({ requestId: req.id, vendorId: vendors[0].id, unitPrice: 100, currency: "EGP" }));
    ok(await addQuoteAction({ requestId: req.id, vendorId: vendors[1].id, unitPrice: 90, currency: "EGP" }));
    const [q1, q2] = await db.vendorQuote.findMany({ where: { procurementRequestId: req.id }, orderBy: { unitPrice: "desc" } });
    ok(await selectQuoteAction(q1.id));
    ok(await procurementTransitionAction(req.id, "PENDING_APPROVAL"));
    fail(await selectQuoteAction(q2.id), /cannot change after/);
    fail(await addQuoteAction({ requestId: req.id, vendorId: vendors[1].id, unitPrice: 50, currency: "EGP" }), /cannot be added/);

    const a = await db.approval.findFirstOrThrow({ where: { entityType: "PROCUREMENT", entityId: req.id, status: "PENDING" } });
    await as(demo.finance);
    ok(await decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" }));
    await as(demo.procurement);
    fail(await selectQuoteAction(q2.id), /cannot change after/);
    fail(await procurementTransitionAction(req.id, "ORDERED", vendors[1].id), /vendor cannot change/);
    ok(await procurementTransitionAction(req.id, "ORDERED"));
    const ordered = await db.procurementRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(ordered.vendorId).toBe(q1.vendorId);
    expect(Number(ordered.unitPrice)).toBe(100);

    // concurrent deliveries are both counted (atomic increment)
    const rs = await Promise.all([recordDeliveryAction(req.id, 4), recordDeliveryAction(req.id, 6)]);
    expect(rs.every((r) => r.ok)).toBe(true);
    const done = await db.procurementRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(done.receivedQuantity).toBe(10);
    expect(done.status).toBe("DELIVERED");
  });
});

describe("P2-D scheduling integrity", () => {
  async function taskWithPredecessor(projectId: string, dept?: string) {
    const deps = await db.taskDependency.findMany({ where: { type: "FS", successor: { projectId, isMilestone: false, plannedStart: { not: null }, ...(dept ? { department: { key: dept } } : {}) }, predecessor: { plannedEnd: { not: null } } }, include: { successor: { include: { department: true } }, predecessor: true }, take: 1 });
    expect(deps.length).toBe(1);
    return deps[0];
  }
  const local = (ms: number) => new Date(ms + 2 * 3600000).toISOString().slice(0, 16); // Cairo local input (UTC+2 in winter)

  it("an approved schedule can only be changed with plan-approval authority, never ahead of predecessors", async () => {
    const { rescheduleTaskAction } = await import("@/server/actions/schedule");
    const dep = await taskWithPredecessor(caiId);
    await as(demo.production);
    fail(await rescheduleTaskAction(dep.successorId, local(dep.successor.plannedStart!.getTime() + 3600000), "late delivery"), /approved/);
    await as(demo.pm);
    fail(await rescheduleTaskAction(dep.successorId, local(dep.predecessor.plannedEnd!.getTime() - 4 * 3600000), "pull earlier"), /cannot start before .* predecessor/);
    const later = dep.successor.plannedStart!.getTime() + 2 * 3600000;
    ok(await rescheduleTaskAction(dep.successorId, local(later), "crane arrives later"));
    expect((await db.task.findUniqueOrThrow({ where: { id: dep.successorId } })).plannedStart!.getTime()).toBe(later);
    const ch = await db.projectChange.findFirstOrThrow({ where: { entityType: "Task", entityId: dep.successorId }, orderBy: { createdAt: "desc" } });
    expect(ch.approvedById).toBe((await loadUser(demo.pm)).id); // the approval is recorded with the change
  });

  it("department managers move only their own department's tasks; event milestones never move", async () => {
    const { rescheduleTaskAction } = await import("@/server/actions/schedule");
    const { generatePlan } = await import("@/server/services/planning");
    // own, unapproved project with a planned production task (independent of other suites)
    const mdf = await db.material.findFirstOrThrow({ where: { companyId, category: "BOARD" } });
    const p = await db.project.create({ data: { companyId, code: `SCH-${tag()}`, name: "Schedule scope", client: "T", category: "T", location: "Cairo", participants: 10, status: "PLANNING",
      setupStart: new Date("2027-04-10T05:00:00Z"), setupEnd: new Date("2027-04-11T20:00:00Z"), eventStart: new Date("2027-04-12T07:00:00Z"), eventEnd: new Date("2027-04-12T18:00:00Z") } });
    await db.productionItem.create({ data: { projectId: p.id, code: "BKD-01", name: "Backdrop", category: "BACKDROP", quantity: 1, widthM: 4, heightM: 3, depthM: 0.2, boardMaterialId: mdf.id, specs: { create: [{ kind: "PANEL", label: "Face", materialId: mdf.id, lengthM: 2, widthM: 1.2, quantity: 4 }] } } });
    await generatePlan({ companyId, userId: (await loadUser(demo.pm)).id }, p.id, { asOf: new Date("2027-03-01T08:00:00Z") });
    const prodTask = await db.task.findFirstOrThrow({ where: { projectId: p.id, department: { key: "PRODUCTION" }, plannedStart: { not: null }, isMilestone: false } });
    await as(demo.av);
    fail(await rescheduleTaskAction(prodTask.id, local(prodTask.plannedStart!.getTime() + 3600000), "not mine"), /Only Production or the Project Manager/);
    const event = await db.task.findFirstOrThrow({ where: { projectId: p.id, planKey: "EVENT:START" } });
    await as(demo.pm);
    fail(await rescheduleTaskAction(event.id, local(event.plannedStart!.getTime() + 3600000), "move event"), /Event milestones are fixed/);
  });
});

describe("P2-E input validation", () => {
  it("rejects negative/zero/non-numeric dimensions and oversized piece counts", async () => {
    const { saveProductionSubmissionAction, addCargoAction, saveAvRequirementsAction } = await import("@/server/actions/inputs");
    await as(demo.member);
    fail(await saveProductionSubmissionAction({ projectId: hrgId, title: "neg", items: [item(`NG-${tag()}`, { widthM: -3 })], submit: false }), /greater than zero/);
    fail(await saveProductionSubmissionAction({ projectId: hrgId, title: "zero", items: [item(`ZR-${tag()}`, { heightM: 0 })], submit: false }), /greater than zero/);
    fail(await saveProductionSubmissionAction({ projectId: hrgId, title: "text", items: [item(`TX-${tag()}`, { depthM: "abc" })], submit: false }), /not a valid number/);
    fail(await saveProductionSubmissionAction({ projectId: hrgId, title: "huge", items: [item(`HG-${tag()}`, { quantity: 1000, specs: [{ kind: "PANEL", label: "tile", lengthM: 0.1, widthM: 0.1, quantity: 100, sides: 1 }] })], submit: false }), /individual pieces/);
    await as(demo.pm);
    fail(await addCargoAction({ projectId: hrgId, name: "ghost crate", quantity: 1, lengthM: 1, widthM: 1, heightM: 1, unitWeightKg: -50 }), /greater than zero/);
    fail(await addCargoAction({ projectId: hrgId, name: "bolts", quantity: 1_000_000, lengthM: 0.1, widthM: 0.1, heightM: 0.1, unitWeightKg: 1 }), /Number must be less than or equal|less than or equal|too_big|10000/i);
    fail(await saveAvRequirementsAction({ projectId: hrgId, lines: [{ category: "NOT_A_CATEGORY" as never, description: "x speaker", quantity: 1, backupQuantity: 0 }] }), /category|Invalid/i);
  });

  it("runtime status fields are validated", async () => {
    const { updateTaskProgressAction } = await import("@/server/actions/execution");
    const t = await db.task.findFirstOrThrow({ where: { projectId: caiId } });
    await as(demo.pm);
    fail(await updateTaskProgressAction(t.id, "HACKED" as never), /Invalid|enum/i);
    fail(await updateTaskProgressAction(t.id, "IN_PROGRESS", Number.NaN), /Invalid|number|finite/i);
  });
});

describe("P2-F cross-project resource planning", () => {
  it("the standby vehicle is reserved, so an overlapping project cannot plan it (Codex)", async () => {
    const { generatePlan } = await import("@/server/services/planning");
    const { buildSnapshot } = await import("@/server/services/snapshot");
    const { runPlanningPipeline } = await import("@/engines/pipeline");
    const pm = await loadUser(demo.pm);
    const asOf = new Date("2027-05-01T08:00:00Z");
    // a period with a free fleet: the first project gets trip vehicle(s) AND a standby
    const dates = { setupStart: new Date("2027-06-10T05:00:00Z"), setupEnd: new Date("2027-06-11T20:00:00Z"), eventStart: new Date("2027-06-12T07:00:00Z"), eventEnd: new Date("2027-06-12T18:00:00Z"), dismantleStart: new Date("2027-06-12T18:00:00Z"), dismantleEnd: new Date("2027-06-13T10:00:00Z") };
    const mk = async (name: string) => {
      const p = await db.project.create({ data: { companyId, code: `VEH-${tag()}`, name, client: "T", category: "T", location: "Aswan", participants: 10, ...dates } });
      await db.cargoItem.create({ data: { projectId: p.id, sourceType: "OTHER", name: "crate", quantity: 2, lengthM: 1, widthM: 1, heightM: 1, unitWeightKg: 200 } });
      return p;
    };
    const first = await mk("Standby owner");
    await generatePlan({ companyId, userId: pm.id }, first.id, { asOf, label: "P2 reservation" });
    const backup = await db.vehicleAssignment.findFirst({ where: { projectId: first.id, isBackup: true } });
    expect(backup).not.toBeNull();
    expect(await db.resourceAssignment.count({ where: { projectId: first.id, resourceType: "VEHICLE", resourceId: backup!.vehicleId } })).toBe(1);
    // an overlapping project now sees that vehicle as booked and never assigns it — not as a trip, not as its own standby
    const twin = await mk("Overlapping twin");
    const snap = await buildSnapshot(companyId, twin.id, asOf);
    expect(snap.vehicles.find((v) => v.id === backup!.vehicleId)!.bookedElsewhere.length).toBeGreaterThan(0);
    const plan = runPlanningPipeline(snap);
    expect(plan.logistics.trips.some((t) => t.vehicleId === backup!.vehicleId)).toBe(false);
    expect(plan.logistics.backupVehicle?.id).not.toBe(backup!.vehicleId);
  });

  it("labour already planned on an overlapping project reduces the crew available", async () => {
    const { buildSnapshot } = await import("@/server/services/snapshot");
    const { runPlanningPipeline } = await import("@/engines/pipeline");
    const asOf = new Date("2026-11-19T08:00:00Z");
    const before = runPlanningPipeline(await buildSnapshot(companyId, aswanId, asOf)).trades.find((t) => t.laborKey === "CARPENTER" && t.phase === "SITE")!;
    const a = await db.project.findUniqueOrThrow({ where: { id: aswanId } });
    const carpenter = await db.laborCategory.findFirstOrThrow({ where: { companyId, key: "CARPENTER" } });
    const other = await db.project.create({ data: { companyId, code: `BUSY-${tag()}`, name: "Busy elsewhere", client: "T", category: "T", location: "Cairo", participants: 10, setupStart: a.setupStart, setupEnd: a.setupEnd, eventStart: a.eventStart, eventEnd: a.eventEnd, status: "APPROVED" } });
    await db.laborAssignment.create({ data: { projectId: other.id, laborCategoryId: carpenter.id, workDate: new Date(a.setupStart.getTime() + 3600000), crewSize: carpenter.headcountAvailable, hours: 8 } });
    const after = runPlanningPipeline(await buildSnapshot(companyId, aswanId, asOf)).trades.find((t) => t.laborKey === "CARPENTER" && t.phase === "SITE")!;
    expect(after.committedElsewhere).toBe(carpenter.headcountAvailable);
    expect(after.available).toBe(0);
    expect(after.shortfall).toBe(after.requiredCrew);
    expect(before.available).toBe(carpenter.headcountAvailable);
    await db.project.update({ where: { id: other.id }, data: { status: "CANCELLED" } }); // cancelled projects free their crews
    expect(runPlanningPipeline(await buildSnapshot(companyId, aswanId, asOf)).trades.find((t) => t.laborKey === "CARPENTER" && t.phase === "SITE")!.committedElsewhere).toBe(0);
  });
});

describe("P2-G upload limits and ownership", () => {
  const form = (file: File, extra: Record<string, string> = {}) => { const f = new FormData(); f.set("file", file); Object.entries(extra).forEach(([k, v]) => f.set(k, v)); return f; };
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  it("rejects archive bombs, oversized files and foreign task references", async () => {
    const { uploadDocumentAction } = await import("@/server/actions/documents");
    await as(demo.pm);
    const bomb = new File([new Uint8Array(zipWith([{ name: "xl/worksheets/sheet1.xml", csize: 2000, usize: 3_000_000_000 }]))], "bomb.xlsx", { type: XLSX });
    fail(await uploadDocumentAction(form(bomb, { projectId: hrgId })), /zip bomb|ratio|expands/i);
    const big = new File([new Uint8Array(21 * 1024 * 1024)], "big.txt", { type: "text/plain" });
    fail(await uploadDocumentAction(form(big, { projectId: hrgId })), /exceeds/);
    const foreignTask = await db.task.findFirstOrThrow({ where: { projectId: caiId } });
    const photo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "site.png", { type: "image/png" });
    fail(await uploadDocumentAction(form(photo, { projectId: hrgId, category: "PHOTO", taskId: foreignTask.id })), /does not belong/);
    expect(await db.uploadedDocument.count({ where: { fileName: { in: ["bomb.xlsx", "big.txt"] } } })).toBe(0);
  });
});

describe("P2-H cross-company / cross-project references and authorisation", () => {
  it("rejects foreign leads, mismatched room types, foreign task actuals; viewers cannot comment", async () => {
    const { assignDepartmentsAction, addCommentAction } = await import("@/server/actions/projects");
    const { saveGuestAction } = await import("@/server/actions/inputs");
    const { recordActualAction } = await import("@/server/actions/execution");
    const other = await db.company.create({ data: { name: "Other people co", slug: `op-${tag().toLowerCase()}` } });
    const role = await db.role.create({ data: { companyId: other.id, key: "VIEWER", name: "Viewer" } });
    const outsider = await db.user.create({ data: { companyId: other.id, roleId: role.id, name: "Outsider", email: `outsider-${tag().toLowerCase()}@other.test`, passwordHash: "x" } });
    await as(demo.pm);
    fail(await assignDepartmentsAction(hrgId, [{ key: "PRODUCTION", leadId: outsider.id }]), /Unknown department lead/);

    const hotels = await db.hotel.findMany({ where: { companyId }, include: { roomTypes: true }, take: 2 });
    expect(hotels.length).toBe(2);
    fail(await saveGuestAction({ projectId: hrgId, guestName: "Mismatch", hotelId: hotels[0].id, roomTypeId: hotels[1].roomTypes[0].id, bookingStatus: "REQUESTED" } as never), /does not belong to the selected hotel/);

    const foreignTask = await db.task.findFirstOrThrow({ where: { projectId: caiId } });
    fail(await recordActualAction({ projectId: aswanId, resourceType: "MATERIAL", category: "MAT:X", description: "boards", actualQuantity: 3, unit: "sheet", taskId: foreignTask.id }), /does not belong/);

    await as(demo.viewer);
    fail(await addCommentAction(aswanId, "drive-by comment"), /read-only/);
    await as(demo.member);
    ok(await addCommentAction(hrgId, "member comment is fine"));
  });
});
