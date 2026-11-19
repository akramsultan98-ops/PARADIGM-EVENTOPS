import { beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/permissions";

// Server actions read the session from cookies; drive them as a real seeded user instead.
let current: AuthUser;
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/session")>()), requireUser: vi.fn(async () => current), getCurrentUser: vi.fn(async () => current) }));

const db = new PrismaClient();
let projectId = "";

async function asUser(email: string): Promise<AuthUser> {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { company: true, role: { include: { permissions: { include: { permission: true } } } }, memberships: { include: { department: true } } } });
  const departments = u.memberships.map((m) => ({ id: m.department.id, key: m.department.key, name: m.department.name, isManager: m.isManager }));
  return { id: u.id, companyId: u.companyId, companyName: u.company.name, currency: u.company.defaultCurrency, timezone: u.company.timezone, name: u.name, email: u.email, jobTitle: u.jobTitle, role: u.role.key, roleName: u.role.name, permissions: new Set(u.role.permissions.map((p) => p.permission.key as Permission)), departments, approvalDepartment: u.role.key === "PRODUCTION_MANAGER" ? "PRODUCTION" : null, primaryDepartment: departments[0]?.key ?? null, locale: u.locale, isDemo: u.isDemo };
}

const item = (code: string, widthM: number) => ({ code, name: `Guard test item ${code}`, category: "BACKDROP" as const, quantity: 1, widthM, heightM: 3, depthM: 0.2, finishing: "Paint", color: "White", paintCoats: 2, constructionMethod: "Timber frame + MDF", installationDay: 1, specs: [{ kind: "PANEL" as const, label: "Face", lengthM: widthM, widthM: 3, quantity: 1, sides: 1 }] });

beforeAll(async () => {
  projectId = (await db.project.findFirstOrThrow({ where: { code: "DEMO-HRG-2703" } })).id; // demo project awaiting inputs
  current = await asUser("production@demo.eventops.local");
});

describe("approved production source data is immutable outside change requests", () => {
  it("rejects re-saving an approved item under its own (approved) submission and leaves both untouched", async () => {
    const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
    const code = `GRD-${Date.now().toString(36).toUpperCase()}`;
    const first = await saveProductionSubmissionAction({ projectId, title: "Guard test submission", items: [item(code, 4)], submit: true });
    expect(first.ok).toBe(true);
    const submissionId = (first as { data: { submissionId: string } }).data.submissionId;
    // technical approval (what reviewSubmissionAction does)
    await db.departmentSubmission.update({ where: { id: submissionId }, data: { status: "APPROVED" } });
    await db.productionItem.updateMany({ where: { submissionId }, data: { state: "APPROVED" } });
    const before = await db.productionItem.findFirstOrThrow({ where: { projectId, code } });

    const edit = await saveProductionSubmissionAction({ projectId, submissionId, title: "Guard test submission", items: [item(code, 9)], submit: true });
    expect(edit.ok).toBe(false);
    expect((edit as { error: string }).error).toMatch(/already approved/);

    const after = await db.productionItem.findFirstOrThrow({ where: { projectId, code } });
    expect(after.widthM).toBe(before.widthM);
    expect(after.state).toBe("APPROVED");
    expect((await db.departmentSubmission.findUniqueOrThrow({ where: { id: submissionId } })).status).toBe("APPROVED");
  });

  it("rejects an approved item even when the submission itself is not approved", async () => {
    const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
    const code = `GRD2-${Date.now().toString(36).toUpperCase()}`;
    const first = await saveProductionSubmissionAction({ projectId, title: "Guard test 2", items: [item(code, 4)], submit: false });
    const submissionId = (first as { data: { submissionId: string } }).data.submissionId;
    await db.productionItem.updateMany({ where: { submissionId }, data: { state: "APPROVED" } });
    const edit = await saveProductionSubmissionAction({ projectId, submissionId, title: "Guard test 2", items: [item(code, 7)], submit: false });
    expect(edit.ok).toBe(false);
    expect((await db.productionItem.findFirstOrThrow({ where: { projectId, code } })).widthM).toBe(4);
    const viaNew = await saveProductionSubmissionAction({ projectId, title: "Guard test 2b", items: [item(code, 7)], submit: false });
    expect(viaNew.ok).toBe(false);
  });

  it("still allows editing a draft (non-approved) item", async () => {
    const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
    const code = `GRD3-${Date.now().toString(36).toUpperCase()}`;
    const first = await saveProductionSubmissionAction({ projectId, title: "Guard test 3", items: [item(code, 4)], submit: false });
    const submissionId = (first as { data: { submissionId: string } }).data.submissionId;
    const edit = await saveProductionSubmissionAction({ projectId, submissionId, title: "Guard test 3", items: [item(code, 5)], submit: false });
    expect(edit.ok).toBe(true);
    expect((await db.productionItem.findFirstOrThrow({ where: { projectId, code } })).widthM).toBe(5);
  });
});
