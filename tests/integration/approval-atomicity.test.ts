import { beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import { demo, loadUser, ok } from "../support/session";

/**
 * P1-3 regression: approval decisions are atomic, single-winner and never self-approved.
 * Real server actions and real PostgreSQL transactions; concurrent decisions run in parallel against the DB.
 */
const S = vi.hoisted(() => ({ user: null as unknown as import("@/lib/auth/session").AuthUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: vi.fn(async () => S.user), getCurrentUser: vi.fn(async () => S.user) }));

const db = new PrismaClient();
const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const as = async (email: string) => { S.user = await loadUser(email); return S.user as AuthUser; };
let companyId = "", projectId = "";

/** Fresh scratch project (so date changes cannot disturb other suites) with the production member assigned. */
async function scratchProject() {
  const member = await loadUser(demo.member);
  const prod = await db.department.findFirstOrThrow({ where: { companyId, key: "PRODUCTION" } });
  const p = await db.project.create({ data: { companyId, code: `ATOM-${tag()}`, name: "Atomicity scratch", client: "Test", category: "Test", location: "Cairo", participants: 50,
    setupStart: new Date("2027-03-01T05:00:00Z"), setupEnd: new Date("2027-03-02T20:00:00Z"), eventStart: new Date("2027-03-03T07:00:00Z"), eventEnd: new Date("2027-03-03T18:00:00Z"),
    status: "PLANNING", members: { create: [{ userId: member.id, role: "Engineer" }] }, departments: { create: [{ departmentId: prod.id }] } } });
  return p.id;
}

async function approvedItem(code: string) {
  const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
  const { decideApprovalAction } = await import("@/server/actions/approvals");
  await as(demo.member);
  const { submissionId } = ok<{ submissionId: string }>(await saveProductionSubmissionAction({ projectId, title: `Atomic ${code}`, items: [{ code, name: `Atomic ${code}`, category: "BACKDROP", quantity: 2, widthM: 4, heightM: 3, depthM: 0.2, finishing: "Paint", color: "White", paintCoats: 2, constructionMethod: "Frame", installationDay: 1, specs: [{ kind: "PANEL", label: "Face", lengthM: 2, widthM: 1.2, quantity: 2, sides: 1 }] }], submit: true }));
  const a = await db.approval.findFirstOrThrow({ where: { entityType: "SUBMISSION", entityId: submissionId, status: "PENDING" } });
  await as(demo.production);
  ok(await decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" }));
  return db.productionItem.findFirstOrThrow({ where: { projectId, code } });
}

async function proposeAsMember(entityType: "ProductionItem" | "Project", entityId: string, changes: { field: string; to: string | number }[]) {
  const { proposeChangeAction } = await import("@/server/actions/planning");
  await as(demo.member);
  return proposeChangeAction({ projectId, title: `Change ${tag()}`, entityType, entityId, changes });
}

beforeAll(async () => {
  companyId = (await db.company.findFirstOrThrow({ where: { slug: "paradigm" } })).id;
  projectId = await scratchProject();
});

describe("P1-3 change values are validated before approval", () => {
  it("rejects a fractional quantity for an integer field at proposal time (nothing stored)", async () => {
    const item = await approvedItem(`FRA-${tag()}`);
    const before = await db.projectChange.count({ where: { projectId } });
    const r = await proposeAsMember("ProductionItem", item.id, [{ field: "quantity", to: 2.5 }]);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/whole number/);
    expect(await db.projectChange.count({ where: { projectId } })).toBe(before);
  });

  it("rejects negative/zero dimensions, eventStart after eventEnd, and budget changes without budget.read", async () => {
    const item = await approvedItem(`NEG-${tag()}`);
    expect((await proposeAsMember("ProductionItem", item.id, [{ field: "widthM", to: -4 }])).ok).toBe(false);
    expect((await proposeAsMember("ProductionItem", item.id, [{ field: "heightM", to: 0 }])).ok).toBe(false);
    expect((await proposeAsMember("Project", projectId, [{ field: "eventStart", to: "2027-03-04T09:00" }])).ok).toBe(false); // after eventEnd
    const budget = await proposeAsMember("Project", projectId, [{ field: "budgetAmount", to: 1000 }]);
    expect((budget as { error: string }).error).toMatch(/budget\.read/);
  });
});

describe("P1-3 atomic decisions", () => {
  it("a change that fails to apply rolls back the whole decision (approval stays PENDING)", async () => {
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const { id: changeId } = ok<{ id: string }>(await proposeAsMember("Project", projectId, [{ field: "eventStart", to: "2027-03-03T10:00" }]));
    // meanwhile the event end is moved earlier: the approved change would now invert the event dates
    await db.project.update({ where: { id: projectId }, data: { eventEnd: new Date("2027-03-03T07:30:00Z") } });
    const a = await db.approval.findFirstOrThrow({ where: { entityType: "CHANGE", entityId: changeId } });
    await as(demo.pm);
    const r = await decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/Event start must be before event end/);
    expect((await db.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PENDING");
    expect((await db.projectChange.findUniqueOrThrow({ where: { id: changeId } })).status).toBe("PROPOSED");
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).eventStart.toISOString()).toBe("2027-03-03T07:00:00.000Z");
    expect(await db.auditLog.count({ where: { entityType: "CHANGE", entityId: changeId, action: "APPROVAL_APPROVED" } })).toBe(0);
    await db.project.update({ where: { id: projectId }, data: { eventEnd: new Date("2027-03-03T18:00:00Z") } });
  });

  it("an invalid stored value (bypassing proposal) cannot be half-applied", async () => {
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const item = await approvedItem(`LEG-${tag()}`);
    const member = await loadUser(demo.member);
    const ch = await db.projectChange.create({ data: { projectId, title: "legacy fractional", entityType: "ProductionItem", entityId: item.id, changes: [{ field: "quantity", from: 2, to: 2.5 }, { field: "widthM", from: 4, to: 6 }], requestedById: member.id } });
    const a = await db.approval.create({ data: { companyId, projectId, entityType: "CHANGE", entityId: ch.id, title: "legacy", requiredRole: "PROJECT_MANAGER", requestedById: member.id } });
    await as(demo.pm);
    const r = await decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" });
    expect(r.ok).toBe(false);
    const after = await db.productionItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.widthM).toBe(4); // the valid widthM part was NOT applied either
    expect(after.quantity).toBe(2);
    expect((await db.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PENDING");
    expect((await db.projectChange.findUniqueOrThrow({ where: { id: ch.id } })).status).toBe("PROPOSED");
  });

  it("two approvers deciding the same change concurrently: exactly one wins, change applied once", async () => {
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const { requireUser } = await import("@/lib/auth/session");
    const item = await approvedItem(`CON-${tag()}`);
    const { id: changeId } = ok<{ id: string }>(await proposeAsMember("ProductionItem", item.id, [{ field: "widthM", to: 5 }]));
    const a = await db.approval.findFirstOrThrow({ where: { entityType: "CHANGE", entityId: changeId } });
    const pm = await loadUser(demo.pm), admin = await loadUser(demo.admin);
    vi.mocked(requireUser).mockResolvedValueOnce(pm).mockResolvedValueOnce(admin);
    const results = await Promise.all([
      decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" }),
      decideApprovalAction({ approvalId: a.id, decision: "REJECTED", note: "Rejected concurrently" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok) as { error: string };
    expect(loser.error).toMatch(/already been decided/);
    const finalA = await db.approval.findUniqueOrThrow({ where: { id: a.id } });
    const finalCh = await db.projectChange.findUniqueOrThrow({ where: { id: changeId } });
    const finalItem = await db.productionItem.findUniqueOrThrow({ where: { id: item.id } });
    if (finalA.status === "APPROVED") { expect(finalCh.status).toBe("APPLIED"); expect(finalItem.widthM).toBe(5); }
    else { expect(finalA.status).toBe("REJECTED"); expect(finalCh.status).toBe("REJECTED"); expect(finalItem.widthM).toBe(4); }
    expect(await db.auditLog.count({ where: { entityType: "CHANGE", entityId: changeId, action: { startsWith: "APPROVAL_" } } })).toBe(1);
  });

  it("two reviewers deciding the same submission concurrently: exactly one wins, item states consistent", async () => {
    const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const { requireUser } = await import("@/lib/auth/session");
    const code = `SUB-${tag()}`;
    await as(demo.member);
    const { submissionId } = ok<{ submissionId: string }>(await saveProductionSubmissionAction({ projectId, title: "Concurrent review", items: [{ code, name: code, category: "COUNTER", quantity: 1, widthM: 2, heightM: 1, depthM: 0.6, finishing: "Laminate", color: "White", constructionMethod: "MDF", installationDay: 1, specs: [{ kind: "PANEL", label: "Top", lengthM: 2, widthM: 0.6, quantity: 1, sides: 1 }] }], submit: true }));
    const a = await db.approval.findFirstOrThrow({ where: { entityType: "SUBMISSION", entityId: submissionId, status: "PENDING" } });
    vi.mocked(requireUser).mockResolvedValueOnce(await loadUser(demo.production)).mockResolvedValueOnce(await loadUser(demo.admin));
    const results = await Promise.all([
      decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" }),
      decideApprovalAction({ approvalId: a.id, decision: "REJECTED", note: "Rejected concurrently" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const sub = await db.departmentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    const it0 = await db.productionItem.findFirstOrThrow({ where: { projectId, code } });
    expect(it0.approvalStatus).toBe(sub.status === "APPROVED" ? "APPROVED" : "REJECTED");
    expect((await db.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(sub.status === "APPROVED" ? "APPROVED" : "REJECTED");
  });
});

describe("P1-3 conditional claim under a real row lock (deterministic race)", () => {
  it("a decision that read PENDING but loses the row lock is rejected and rolled back", async () => {
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const item = await approvedItem(`LCK-${tag()}`);
    const { id: changeId } = ok<{ id: string }>(await proposeAsMember("ProductionItem", item.id, [{ field: "widthM", to: 7 }]));
    const a = await db.approval.findFirstOrThrow({ where: { entityType: "CHANGE", entityId: changeId } });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => { locked = r; });
    // "approver A": claims the approval in an open transaction and holds the row lock
    const holder = db.$transaction(async (tx) => {
      await tx.approval.updateMany({ where: { id: a.id, status: "PENDING" }, data: { status: "REJECTED", decisionNote: "decided by A" } });
      locked();
      await gate;
    }, { timeout: 30000 });
    await lockTaken;
    // "approver B": still sees PENDING (A has not committed), passes the pre-checks, then blocks on the claim
    await as(demo.pm);
    const b = decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" });
    await new Promise((r) => setTimeout(r, 750));
    release();
    await holder;
    const rb = await b;
    expect(rb.ok).toBe(false);
    expect((rb as { error: string }).error).toMatch(/already been decided by someone else/);
    expect((await db.approval.findUniqueOrThrow({ where: { id: a.id } })).decisionNote).toBe("decided by A");
    expect((await db.projectChange.findUniqueOrThrow({ where: { id: changeId } })).status).toBe("PROPOSED"); // B's change application rolled back
    expect((await db.productionItem.findUniqueOrThrow({ where: { id: item.id } })).widthM).toBe(4);
  });
});

describe("P1-3 no self-approval", () => {
  it("the requester cannot approve their own change request (PM and Super Admin alike)", async () => {
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const { proposeChangeAction } = await import("@/server/actions/planning");
    const item = await approvedItem(`SLF-${tag()}`);
    for (const who of [demo.pm, demo.admin]) {
      await as(who);
      const { id: changeId } = ok<{ id: string }>(await proposeChangeAction({ projectId, title: `Self ${tag()}`, entityType: "ProductionItem", entityId: item.id, changes: [{ field: "quantity", to: 3 }] }));
      const a = await db.approval.findFirstOrThrow({ where: { entityType: "CHANGE", entityId: changeId } });
      const r = await decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" });
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toMatch(/your own request/);
      expect((await db.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PENDING");
    }
    expect((await db.productionItem.findUniqueOrThrow({ where: { id: item.id } })).quantity).toBe(2);
  });

  it("an already-decided approval cannot be decided again", async () => {
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const item = await approvedItem(`TWC-${tag()}`);
    const { id: changeId } = ok<{ id: string }>(await proposeAsMember("ProductionItem", item.id, [{ field: "quantity", to: 3 }]));
    const a = await db.approval.findFirstOrThrow({ where: { entityType: "CHANGE", entityId: changeId } });
    await as(demo.pm);
    ok(await decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" }));
    const again = await decideApprovalAction({ approvalId: a.id, decision: "REJECTED", note: "second thoughts" });
    expect(again.ok).toBe(false);
    expect((await db.productionItem.findUniqueOrThrow({ where: { id: item.id } })).quantity).toBe(3);
    expect((await db.projectChange.findUniqueOrThrow({ where: { id: changeId } })).status).toBe("APPLIED");
  });
});
