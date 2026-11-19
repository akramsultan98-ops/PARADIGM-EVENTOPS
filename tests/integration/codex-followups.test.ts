import { beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import { demo, loadUser, ok } from "../support/session";
import { zipWith } from "../support/zip";

/** Codex review of 55bd7b7 — three P2 findings, verified against PostgreSQL with real row locks. */
const S = vi.hoisted(() => ({ user: null as unknown as import("@/lib/auth/session").AuthUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: vi.fn(async () => S.user), getCurrentUser: vi.fn(async () => S.user) }));

const db = new PrismaClient();
const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const as = async (email: string) => { S.user = await loadUser(email); return S.user as AuthUser; };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
let hrgId = "";

const item = (code: string, widthM: number) => ({ code, name: `Race ${code}`, category: "BACKDROP" as const, quantity: 1, widthM, heightM: 2, depthM: 0.2, finishing: "Paint", color: "White", paintCoats: 2, constructionMethod: "Frame", installationDay: 1, specs: [{ kind: "PANEL" as const, label: "Face", lengthM: 1.5, widthM: 1, quantity: 2, sides: 1 }] });

/** Holds an open transaction that ran `work` until released — a decision "in flight" holding its row locks. */
function holdTransaction(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<unknown>) {
  let release!: () => void; let locked!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const ready = new Promise<void>((r) => { locked = r; });
  const done = db.$transaction(async (tx) => { await work(tx); locked(); await gate; }, { timeout: 30000 });
  return { ready, release, done };
}

beforeAll(async () => { hrgId = (await db.project.findFirstOrThrow({ where: { code: "DEMO-HRG-2703" } })).id; });

describe("Codex P2: production save checks approval in the same transaction", () => {
  it("a review that commits while a save is in flight wins; the save is refused and approved values stay", async () => {
    const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
    const code = `RCA-${tag()}`;
    await as(demo.member);
    const { submissionId } = ok<{ submissionId: string }>(await saveProductionSubmissionAction({ projectId: hrgId, title: "Race A", items: [item(code, 3)], submit: true }));
    // reviewer's transaction: approves the submission and its items, holding the row locks
    const review = holdTransaction(async (tx) => {
      await tx.departmentSubmission.updateMany({ where: { id: submissionId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } }, data: { status: "APPROVED" } });
      await tx.productionItem.updateMany({ where: { submissionId, approvalStatus: "UNDER_REVIEW" }, data: { approvalStatus: "APPROVED" } });
    });
    await review.ready;
    // the submitter re-saves the same submission as a draft with new values while the review is in flight
    const save = saveProductionSubmissionAction({ projectId: hrgId, submissionId, title: "Race A edited", items: [item(code, 9)], submit: false });
    await pause(750);
    review.release();
    await review.done;
    const r = await save;
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/already approved/);
    const after = await db.productionItem.findFirstOrThrow({ where: { projectId: hrgId, code } });
    expect(after.widthM).toBe(3);
    expect(after.approvalStatus).toBe("APPROVED");
    expect((await db.departmentSubmission.findUniqueOrThrow({ where: { id: submissionId } })).status).toBe("APPROVED");
  });

  it("a save that commits while a review is in flight wins; the review is refused and nothing is promoted", async () => {
    const { saveProductionSubmissionAction, reviewSubmissionAction } = await import("@/server/actions/inputs");
    const code = `RCB-${tag()}`;
    await as(demo.member);
    const { submissionId } = ok<{ submissionId: string }>(await saveProductionSubmissionAction({ projectId: hrgId, title: "Race B", items: [item(code, 3)], submit: true }));
    // submitter's transaction (as the save action does): locks the submission and turns it back into a draft
    const edit = holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DepartmentSubmission" WHERE id = ${submissionId} FOR UPDATE`;
      await tx.departmentSubmission.update({ where: { id: submissionId }, data: { status: "DRAFT" } });
      await tx.productionItem.updateMany({ where: { submissionId }, data: { approvalStatus: "DRAFT", widthM: 9 } });
    });
    await edit.ready;
    await as(demo.production);
    const review = reviewSubmissionAction(submissionId, "APPROVED", "");
    await pause(750);
    edit.release();
    await edit.done;
    const r = await review;
    expect(r.ok).toBe(false);
    const after = await db.productionItem.findFirstOrThrow({ where: { projectId: hrgId, code } });
    expect(after.approvalStatus).toBe("DRAFT");
    expect(after.widthM).toBe(9);
    expect((await db.departmentSubmission.findUniqueOrThrow({ where: { id: submissionId } })).status).toBe("DRAFT");
  });

  it("editing a submission that waits for review withdraws the pending review", async () => {
    const { saveProductionSubmissionAction } = await import("@/server/actions/inputs");
    await as(demo.member);
    const code = `WDR-${tag()}`;
    const { submissionId } = ok<{ submissionId: string }>(await saveProductionSubmissionAction({ projectId: hrgId, title: "Withdraw", items: [item(code, 3)], submit: true }));
    expect(await db.approval.count({ where: { entityType: "SUBMISSION", entityId: submissionId, status: "PENDING" } })).toBe(1);
    ok(await saveProductionSubmissionAction({ projectId: hrgId, submissionId, title: "Withdraw (edited)", items: [item(code, 4)], submit: false }));
    expect(await db.approval.count({ where: { entityType: "SUBMISSION", entityId: submissionId, status: "PENDING" } })).toBe(0);
  });
});

describe("Codex P2: rejected uploads never reach storage", () => {
  const filesUnder = (dir: string): number => (!existsSync(dir) ? 0 : readdirSync(dir).reduce((n, f) => { const p = path.join(dir, f); return n + (statSync(p).isDirectory() ? filesUnder(p) : 1); }, 0));
  it("an archive bomb is refused before anything is written", async () => {
    const { uploadDocumentAction } = await import("@/server/actions/documents");
    const u = await as(demo.pm);
    const root = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage/uploads", u.companyId);
    const before = filesUnder(root);
    const f = new FormData();
    f.set("file", new File([new Uint8Array(zipWith([{ name: "xl/worksheets/sheet1.xml", csize: 2000, usize: 3_000_000_000 }]))], "bomb.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    f.set("projectId", hrgId);
    const r = await uploadDocumentAction(f);
    expect(r.ok).toBe(false);
    expect(filesUnder(root)).toBe(before);
  });
});

describe("Codex P2: login rate limits are bounded and cannot be bypassed with unique e-mails", () => {
  it("unique addresses hit the global login limit and allocate no further buckets", async () => {
    const { loginAction } = await import("@/server/actions/auth");
    const { rateLimitStats, __resetRateLimits } = await import("@/lib/rate-limit");
    __resetRateLimits();
    process.env.LOGIN_GLOBAL_LIMIT_PER_MIN = "20";
    try {
      const results: { error?: string }[] = [];
      for (let i = 0; i < 60; i++) {
        const fd = new FormData(); fd.set("email", `flood-${i}-${tag().toLowerCase()}@example.com`); fd.set("password", "x");
        results.push(await loginAction(undefined, fd));
      }
      expect(results.slice(0, 20).every((r) => r.error === "invalid")).toBe(true);
      expect(results.slice(20).every((r) => /Too many sign-in attempts/.test(r.error ?? ""))).toBe(true);
      expect(rateLimitStats().keys).toBeLessThanOrEqual(1 + 20 * 2); // global bucket + 2 per accepted attempt only
    } finally { delete process.env.LOGIN_GLOBAL_LIMIT_PER_MIN; __resetRateLimits(); }
  });
});
