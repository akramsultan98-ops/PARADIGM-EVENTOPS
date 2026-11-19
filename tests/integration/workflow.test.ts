import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { generatePlan, approvePlan } from "@/server/services/planning";
import { applyApprovedChange, loadChangeTarget } from "@/server/services/changes";
import { buildSnapshot } from "@/server/services/snapshot";
import { buildWorkbook } from "@/server/services/workbook";
import { projectScope } from "@/lib/scope";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import type { PlanResult } from "@/engines/pipeline";
import type { AuthUser } from "@/lib/auth/session";

const db = new PrismaClient();
let companyId = "", pmId = "", aswanId = "", caiId = "";

beforeAll(async () => {
  const c = await db.company.findFirstOrThrow({ where: { slug: "paradigm" } });
  companyId = c.id;
  pmId = (await db.user.findUniqueOrThrow({ where: { email: "pm@demo.eventops.local" } })).id;
  aswanId = (await db.project.findFirstOrThrow({ where: { code: "DEMO-ASW-2612" } })).id;
  caiId = (await db.project.findFirstOrThrow({ where: { code: "DEMO-CAI-2611" } })).id;
});

describe("seeded demo environment", () => {
  it("contains connected, clearly labelled demo data", async () => {
    expect(await db.project.count()).toBe(4);
    expect(await db.user.count({ where: { isDemo: true } })).toBe(12);
    const p = await db.project.findUniqueOrThrow({ where: { id: aswanId } });
    expect(p.isDemo).toBe(true);
    expect(p.description).toContain("DEMO DATA — NOT APPROVED PARADIGM COMPANY DATA");
    expect(await db.material.count({ where: { status: "APPROVED" } })).toBe(0); // nothing pretends to be approved Paradigm data
  });

  it("stores the permission matrix in the database", async () => {
    const role = await db.role.findFirstOrThrow({ where: { companyId, key: "FINANCE" }, include: { permissions: { include: { permission: true } } } });
    expect(role.permissions.map((p) => p.permission.key).sort()).toEqual([...ROLE_PERMISSIONS.FINANCE].sort());
  });
});

describe("plan generation & persistence", () => {
  it("builds a snapshot from the database and persists a versioned plan with traces", async () => {
    const before = await db.scheduleVersion.count({ where: { projectId: aswanId } });
    const r = await generatePlan({ companyId, userId: pmId }, aswanId, { asOf: new Date("2026-11-19T08:00:00Z") });
    expect(r.version).toBe(before + 1);
    const v = await db.scheduleVersion.findUniqueOrThrow({ where: { id: r.versionId } });
    expect(v.status).toBe("UNDER_REVIEW");
    expect((v.snapshot as unknown as PlanResult).tasks.length).toBeGreaterThan(20);
    expect(await db.task.count({ where: { projectId: aswanId, generated: true } })).toBe(r.plan.tasks.length);
    expect(await db.calculationRecord.count({ where: { projectId: aswanId } })).toBe(r.plan.traces.length);
    expect(await db.materialCalculation.count({ where: { projectId: aswanId } })).toBe(r.plan.production.boq.length);
    // earlier review versions are superseded, never deleted
    expect(await db.scheduleVersion.count({ where: { projectId: aswanId, status: "SUPERSEDED" } })).toBe(before);
  });

  it("is reproducible: identical inputs produce identical calculation hashes", async () => {
    const s1 = await buildSnapshot(companyId, aswanId, new Date("2026-11-19T08:00:00Z"));
    const s2 = await buildSnapshot(companyId, aswanId, new Date("2026-11-19T08:00:00Z"));
    const { runPlanningPipeline } = await import("@/engines/pipeline");
    expect(runPlanningPipeline(s1).inputHash).toBe(runPlanningPipeline(s2).inputHash);
  });

  it("detects cross-project equipment bookings (LED cabinets held by the Alexandria gala)", async () => {
    const s = await buildSnapshot(companyId, aswanId, new Date("2026-11-19T08:00:00Z"));
    const led = s.equipment.find((e) => e.code === "LED-P39")!;
    expect(led.allocatedElsewhere.some((a) => a.projectCode === "DEMO-ALX-0412" && a.quantity === 30)).toBe(true);
  });
});

describe("approval gates", () => {
  it("refuses plan approval while department technical approvals are outstanding", async () => {
    const a = await db.approval.findFirstOrThrow({ where: { projectId: aswanId, entityType: "PLAN", status: "PENDING" } });
    await expect(approvePlan({ companyId, userId: pmId }, a.id, null, true)).rejects.toThrow(/technical approvals outstanding/i);
  });

  it("requires explicit acknowledgement of open errors, then approves and keeps history", async () => {
    await db.departmentSubmission.updateMany({ where: { projectId: aswanId }, data: { status: "APPROVED" } });
    const a = await db.approval.findFirstOrThrow({ where: { projectId: aswanId, entityType: "PLAN", status: "PENDING" } });
    await expect(approvePlan({ companyId, userId: pmId }, a.id, null, false)).rejects.toThrow(/acknowledge/i);
    const v = await approvePlan({ companyId, userId: pmId }, a.id, "integration test", true);
    expect((await db.scheduleVersion.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("APPROVED");
    expect((await db.project.findUniqueOrThrow({ where: { id: aswanId } })).status).toBe("APPROVED");
    expect(await db.auditLog.count({ where: { projectId: aswanId, action: "PLAN_APPROVED" } })).toBeGreaterThan(0);
  });
});

describe("change requests never overwrite an approved plan", () => {
  it("applies an approved change and produces a NEW version for review", async () => {
    const approvedBefore = await db.scheduleVersion.findFirstOrThrow({ where: { projectId: aswanId, status: "APPROVED" } });
    const bkd = await db.productionItem.findFirstOrThrow({ where: { projectId: aswanId, code: "BKD-01" }, include: { specs: true } });
    const panelsBefore = bkd.specs.find((s) => s.kind === "PANEL")!.quantity;
    const ch = await db.projectChange.create({ data: { projectId: aswanId, title: "Backdrop 8 → 10 m", entityType: "ProductionItem", entityId: bkd.id, changes: [{ field: "widthM", from: 8, to: 10 }], status: "APPROVED" } });
    await applyApprovedChange(ch.id, companyId);
    const r = await generatePlan({ companyId, userId: pmId }, aswanId, { asOf: new Date("2026-11-19T08:00:00Z"), label: "after change" });
    const after = await db.productionItem.findUniqueOrThrow({ where: { id: bkd.id }, include: { specs: true } });
    expect(after.widthM).toBe(10);
    expect(after.specs.find((s) => s.kind === "PANEL")!.quantity).toBeGreaterThan(panelsBefore);
    expect(after.drawingStatus).toBe("PROVIDED"); // revised drawing required
    expect((await db.scheduleVersion.findUniqueOrThrow({ where: { id: approvedBefore.id } })).status).toBe("APPROVED");
    expect((await db.scheduleVersion.findUniqueOrThrow({ where: { id: r.versionId } })).status).toBe("UNDER_REVIEW");
  });

  it("refuses to apply a change whose target belongs to another project or company", async () => {
    // item of the Cairo project, change approved on the Aswan project
    const foreign = await db.productionItem.findFirstOrThrow({ where: { projectId: caiId } });
    const ch = await db.projectChange.create({ data: { projectId: aswanId, title: "cross-project", entityType: "ProductionItem", entityId: foreign.id, changes: [{ field: "widthM", from: foreign.widthM, to: 99 }], status: "APPROVED" } });
    await expect(applyApprovedChange(ch.id, companyId)).rejects.toThrow(/does not belong/);
    expect((await db.productionItem.findUniqueOrThrow({ where: { id: foreign.id } })).widthM).toBe(foreign.widthM);
    // a Project target other than the request's own project
    const ch2 = await db.projectChange.create({ data: { projectId: aswanId, title: "other project", entityType: "Project", entityId: caiId, changes: [{ field: "participants", from: 0, to: 1 }], status: "APPROVED" } });
    await expect(applyApprovedChange(ch2.id, companyId)).rejects.toThrow(/does not belong/);
    // a vehicle of another company
    const other = await db.company.create({ data: { name: "Other fleet", slug: `fleet-${Date.now()}` } });
    try {
      const v = await db.vehicle.create({ data: { companyId: other.id, code: "OTH-1", type: "VAN", payloadKg: 1000, volumeM3: 10 } });
      expect(await loadChangeTarget("Vehicle", v.id, aswanId, companyId).catch((e: Error) => e.message)).toMatch(/does not belong/);
    } finally {
      await db.vehicle.deleteMany({ where: { companyId: other.id } });
      await db.company.delete({ where: { id: other.id } });
    }
  });
});

describe("tenant isolation", () => {
  it("scopes project queries by company and by membership for department members", async () => {
    const other = await db.company.create({ data: { name: "Other Co", slug: `other-${Date.now()}` } });
    const role = await db.role.create({ data: { companyId: other.id, key: "PROJECT_MANAGER", name: "PM" } });
    const outsider = { id: "x", companyId: other.id, role: role.key, departments: [], approvalDepartment: "PMO", permissions: new Set() } as unknown as AuthUser;
    expect(await db.project.count({ where: projectScope(outsider) })).toBe(0);
    const member = await db.user.findUniqueOrThrow({ where: { email: "production.member@demo.eventops.local" }, include: { memberships: { include: { department: true } } } });
    const mu = { id: member.id, companyId, role: "DEPARTMENT_MEMBER", approvalDepartment: null, departments: member.memberships.map((m) => ({ id: m.departmentId, key: m.department.key, name: m.department.name, isManager: false })), permissions: new Set() } as unknown as AuthUser;
    const visible = await db.project.findMany({ where: projectScope(mu), select: { code: true } });
    expect(visible.map((v) => v.code)).not.toContain("DEMO-NONE");
    expect(visible.length).toBeGreaterThan(0);
    await db.role.delete({ where: { id: role.id } });
    await db.company.delete({ where: { id: other.id } });
  });

  it("keeps the membership restriction when search filters add their own OR (projects list & global search)", async () => {
    const probe = await db.project.create({ data: { companyId, code: `SCOPE-PROBE-${Date.now()}`, name: "Scope probe confidential", client: "Probe client", category: "Corporate conference", location: "Cairo", participants: 10, setupStart: new Date("2027-01-08T06:00:00Z"), setupEnd: new Date("2027-01-09T20:00:00Z"), eventStart: new Date("2027-01-10T08:00:00Z"), eventEnd: new Date("2027-01-11T18:00:00Z") } });
    try {
      const member = await db.user.findUniqueOrThrow({ where: { email: "production.member@demo.eventops.local" }, include: { memberships: { include: { department: true } } } });
      const mu = { id: member.id, companyId, role: "DEPARTMENT_MEMBER", approvalDepartment: null, departments: member.memberships.map((m) => ({ id: m.departmentId, key: m.department.key, name: m.department.name, isManager: false })), permissions: new Set() } as unknown as AuthUser;
      const pm = { id: pmId, companyId, role: "PROJECT_MANAGER", approvalDepartment: null, departments: [], permissions: new Set() } as unknown as AuthUser;
      const c = { contains: "scope probe", mode: "insensitive" as const };
      const search = (u: AuthUser) => db.project.count({ where: { ...projectScope(u), OR: [{ name: c }, { client: c }, { code: c }] } });
      expect(await search(mu)).toBe(0); // not a member and none of their departments assigned
      expect(await search(pm)).toBe(1); // company-wide roles still find it
    } finally {
      await db.project.delete({ where: { id: probe.id } });
    }
  });
});

describe("exports", () => {
  it("builds the 20-sheet master workbook with the required naming", async () => {
    const { buffer, fileName } = await buildWorkbook(companyId, caiId);
    expect(fileName).toBe("PARADIGM_EVENTOPS_CAIRO_PRODUCT_LAUNCH_MASTER_PLAN.xlsx");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toHaveLength(20);
    expect(wb.getWorksheet("18_Actual_vs_Planned")!.rowCount).toBeGreaterThan(5);
  });

  it("refuses to export a project of another company", async () => {
    await expect(buildWorkbook("not-a-company", caiId)).rejects.toThrow();
  });
});
