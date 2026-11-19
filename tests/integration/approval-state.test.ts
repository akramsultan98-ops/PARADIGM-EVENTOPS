import { beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import { demo, loadUser, ok } from "../support/session";

/**
 * P1-1 regression: technical approval must survive (re)calculation.
 * Real server actions against the test database; only the cookie lookup is replaced.
 */
const S = vi.hoisted(() => ({ user: null as unknown as import("@/lib/auth/session").AuthUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: vi.fn(async () => S.user), getCurrentUser: vi.fn(async () => S.user) }));

const db = new PrismaClient();
let projectId = "";
const as = async (email: string) => { S.user = await loadUser(email); return S.user as AuthUser; };
const tag = () => Date.now().toString(36).toUpperCase().slice(-6);

const item = (code: string, widthM: number) => ({ code, name: `Approval-state item ${code}`, category: "BACKDROP" as const, quantity: 1, widthM, heightM: 3, depthM: 0.2, boardMaterialId: null, finishing: "Paint", color: "White", paintCoats: 2, constructionMethod: "Timber frame + MDF", installationDay: 1, specs: [{ kind: "PANEL" as const, label: "Face", lengthM: widthM, widthM: 1.2, quantity: 1, sides: 1 }] });

async function decidePendingSubmission(submissionId: string, approverEmail: string) {
  const { decideApprovalAction } = await import("@/server/actions/approvals");
  const a = await db.approval.findFirstOrThrow({ where: { entityType: "SUBMISSION", entityId: submissionId, status: "PENDING" } });
  await as(approverEmail);
  ok(await decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" }));
}

async function generateTwice() {
  const { generatePlanAction } = await import("@/server/actions/projects");
  await as(demo.pm);
  ok(await generatePlanAction(projectId));
  ok(await generatePlanAction(projectId));
}

beforeAll(async () => {
  projectId = (await db.project.findFirstOrThrow({ where: { code: "DEMO-HRG-2703" } })).id;
});

describe("P1-1 technical approval survives plan (re)generation", () => {
  it("production: submit → approve → generate → regenerate → edit is rejected", async () => {
    const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
    const code = `APS-${tag()}`;
    await as(demo.member);
    const { submissionId } = ok<{ submissionId: string; status: string }>(await saveProductionSubmissionAction({ projectId, title: "Approval state — production", items: [item(code, 4)], submit: true }));
    expect((await db.productionItem.findFirstOrThrow({ where: { projectId, code } })).approvalStatus).toBe("UNDER_REVIEW");

    await decidePendingSubmission(submissionId, demo.production);
    expect((await db.productionItem.findFirstOrThrow({ where: { projectId, code } })).approvalStatus).toBe("APPROVED");

    await generateTwice();
    const afterPlans = await db.productionItem.findFirstOrThrow({ where: { projectId, code } });
    expect(afterPlans.approvalStatus).toBe("APPROVED"); // plan generation never changes approval
    expect(["CALCULATED", "ESTIMATED", "NEEDS_INFORMATION"]).toContain(afterPlans.calculationState); // engine state lives separately

    await as(demo.member);
    const viaNewSubmission = await saveProductionSubmissionAction({ projectId, title: "Sneaky edit", items: [item(code, 9)], submit: false });
    expect(viaNewSubmission.ok).toBe(false);
    const viaOriginal = await saveProductionSubmissionAction({ projectId, submissionId, title: "Sneaky edit", items: [item(code, 9)], submit: false });
    expect(viaOriginal.ok).toBe(false);
    const final = await db.productionItem.findFirstOrThrow({ where: { projectId, code }, include: { specs: true } });
    expect(final.widthM).toBe(4);
    expect(final.specs[0].lengthM).toBe(4);
    expect(final.approvalStatus).toBe("APPROVED");
  });

  it("AV: submit → approve → generate → regenerate → delete is rejected", async () => {
    const { saveAvRequirementsAction, deleteAvRequirementAction } = await import("@/server/actions/inputs");
    const desc = `Approval-state mics ${tag()}`;
    await as(demo.pm); // a different user than the AV approver
    const { submissionId } = ok<{ submissionId: string }>(await saveAvRequirementsAction({ projectId, submit: true, lines: [{ category: "MICROPHONE", description: desc, quantity: 2, backupQuantity: 0 }] }));
    const req = await db.equipmentRequirement.findFirstOrThrow({ where: { projectId, description: desc } });
    expect(req.approvalStatus).toBe("UNDER_REVIEW");

    await decidePendingSubmission(submissionId, demo.av);
    await generateTwice();
    expect((await db.equipmentRequirement.findUniqueOrThrow({ where: { id: req.id } })).approvalStatus).toBe("APPROVED");

    await as(demo.av);
    const del = await deleteAvRequirementAction(req.id);
    expect(del.ok).toBe(false);
    expect(await db.equipmentRequirement.findUnique({ where: { id: req.id } })).not.toBeNull();
  });

  it("an approved change request is the only path that modifies an approved item, and approval is kept", async () => {
    const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
    const { proposeChangeAction } = await import("@/server/actions/planning");
    const { decideApprovalAction } = await import("@/server/actions/approvals");
    const code = `APC-${tag()}`;
    await as(demo.member);
    const { submissionId } = ok<{ submissionId: string }>(await saveProductionSubmissionAction({ projectId, title: "Approval state — CR", items: [item(code, 4)], submit: true }));
    await decidePendingSubmission(submissionId, demo.production);
    const it0 = await db.productionItem.findFirstOrThrow({ where: { projectId, code } });

    await as(demo.member);
    const { id: changeId } = ok<{ id: string }>(await proposeChangeAction({ projectId, title: `Widen ${code}`, entityType: "ProductionItem", entityId: it0.id, changes: [{ field: "widthM", to: 5 }] }));
    const a = await db.approval.findFirstOrThrow({ where: { entityType: "CHANGE", entityId: changeId } });
    await as(demo.pm);
    ok(await decideApprovalAction({ approvalId: a.id, decision: "APPROVED", note: "" }));
    const it1 = await db.productionItem.findUniqueOrThrow({ where: { id: it0.id } });
    expect(it1.widthM).toBe(5);
    expect(it1.approvalStatus).toBe("APPROVED");
  });
});
