"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { notify } from "@/lib/notify";
import { approvePlan, generatePlan } from "@/server/services/planning";
import { applyApprovedChange } from "@/server/services/changes";
import { reviewSubmission } from "@/server/services/review";
import { run } from "./_util";

const schema = z.object({ approvalId: z.string().min(1), decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]), note: z.string().max(2000).default(""), acknowledgeIssues: z.boolean().default(false) });

/** Approval types where the requester may never decide their own request (segregation of duties). Plan approval is
 *  excluded: generating a plan is a mechanical calculation, not a proposal of values. */
const NO_SELF_APPROVAL = new Set(["CHANGE", "SUBMISSION", "PROCUREMENT", "BUDGET", "STANDARD"]);

class AlreadyDecided extends Error { constructor() { super("This approval has already been decided by someone else"); } }

/**
 * Single entry point for every approval type; authorisation is enforced per entity type on the server.
 * Atomic (P1-3): the approval is CLAIMED with `UPDATE … WHERE status = 'PENDING'` inside one transaction together
 * with every effect of the decision. A concurrent second decision updates zero rows and is rejected; any failure
 * (e.g. an invalid change value) rolls back the whole decision, so approval records always match the data.
 */
export async function decideApprovalAction(input: z.input<typeof schema>) {
  return run(async () => {
    const u = await requireUser();
    const d = schema.parse(input);
    const a = await db.approval.findFirstOrThrow({ where: { id: d.approvalId, companyId: u.companyId } });
    if (a.status !== "PENDING") throw new Error(`This approval has already been decided (${a.status.toLowerCase().replace(/_/g, " ")})`);
    if (a.requiredRole !== u.role && u.role !== "SUPER_ADMIN") throw new Error(`This approval requires the ${a.requiredRole.replace(/_/g, " ").toLowerCase()} role`);
    if (NO_SELF_APPROVAL.has(a.entityType) && a.requestedById === u.id) throw new Error("You cannot approve or reject your own request — another approver must decide");
    if (d.decision !== "APPROVED" && d.note.trim().length < 3) throw new Error("Please give a reason");
    const ctx = { companyId: u.companyId, userId: u.id };
    const decided = { status: d.decision, approverId: u.id, decidedAt: new Date(), decisionNote: d.note || null };
    const claim = async (tx: Prisma.TransactionClient) => {
      const r = await tx.approval.updateMany({ where: { id: a.id, status: "PENDING" }, data: decided });
      if (r.count !== 1) throw new AlreadyDecided();
    };
    const auditRow = (tx: Prisma.TransactionClient) => tx.auditLog.create({ data: { companyId: u.companyId, userId: u.id, projectId: a.projectId, action: `APPROVAL_${d.decision}`, entityType: a.entityType, entityId: a.entityId, details: { approvalId: a.id, note: d.note, acknowledgeIssues: d.acknowledgeIssues } } });
    const after: (() => Promise<unknown>)[] = [];
    let message: string | undefined;

    switch (a.entityType) {
      case "PLAN":
        assertCan(u, "plan.approve");
        if (d.decision === "APPROVED") await approvePlan(ctx, a.id, d.note || null, d.acknowledgeIssues); // claims inside its own transaction
        else await db.$transaction(async (tx) => {
          await claim(tx);
          await tx.scheduleVersion.updateMany({ where: { id: a.entityId, status: "UNDER_REVIEW" }, data: { status: "DRAFT" } });
          if (a.projectId) await tx.project.update({ where: { id: a.projectId }, data: { status: "PLANNING" } });
          await auditRow(tx);
        });
        break;
      case "SUBMISSION": {
        const decision = d.decision === "CHANGES_REQUESTED" ? "NEEDS_INFORMATION" : d.decision;
        const sub = await db.$transaction(async (tx) => {
          await claim(tx);
          return reviewSubmission(tx, u, a.entityId, decision, d.note); // status gate + self-review block + item approvals
        });
        after.push(() => notify({ userIds: [sub.submittedById] }, { companyId: u.companyId, projectId: sub.projectId, type: "APPROVAL", title: `${sub.title}: ${decision.replace("_", " ").toLowerCase()}`, body: d.note || undefined, link: `/projects/${sub.projectId}/inputs?submission=${sub.id}` }));
        break;
      }
      case "PROCUREMENT":
        assertCan(u, "procurement.approve");
        await db.$transaction(async (tx) => {
          await claim(tx);
          const moved = await tx.procurementRequest.updateMany({ where: { id: a.entityId, project: { companyId: u.companyId }, status: "PENDING_APPROVAL" }, data: d.decision === "APPROVED" ? { status: "APPROVED", approvedById: u.id } : { status: "QUOTED" } });
          if (moved.count !== 1) throw new Error("The purchase request is no longer awaiting approval");
          await auditRow(tx);
        });
        after.push(() => notify({ roles: ["PROCUREMENT_MANAGER"] }, { companyId: u.companyId, projectId: a.projectId, type: "PROCUREMENT", title: `${a.title}: ${d.decision.toLowerCase().replace("_", " ")}`, link: "/procurement" }));
        break;
      case "CHANGE": {
        assertCan(u, "plan.approve");
        const ch = await db.$transaction(async (tx) => {
          await claim(tx);
          const moved = await tx.projectChange.updateMany({ where: { id: a.entityId, project: { companyId: u.companyId }, status: "PROPOSED" }, data: d.decision === "APPROVED" ? { status: "APPROVED", approvedById: u.id, decidedAt: new Date() } : { status: "REJECTED", decidedAt: new Date() } });
          if (moved.count !== 1) throw new Error("The change request is no longer awaiting a decision");
          const applied = d.decision === "APPROVED" ? await applyApprovedChange(a.entityId, u.companyId, tx) : null; // throws → whole decision rolls back
          await auditRow(tx);
          return applied;
        });
        if (ch) {
          // re-planning is a separate, retryable step: the change itself is already consistently applied
          try { await generatePlan(ctx, ch.projectId, { label: `Revision after change: ${ch.title}` }); }
          catch (e) { message = `Change applied. Plan regeneration failed (${e instanceof Error ? e.message : "error"}) — regenerate the plan manually.`; }
        }
        break;
      }
      case "STANDARD": {
        assertCan(u, "standards.approve");
        await db.$transaction(async (tx) => {
          await claim(tx);
          const st = await tx.companyStandard.findFirstOrThrow({ where: { id: a.entityId, companyId: u.companyId } });
          if (d.decision === "APPROVED") {
            const v = st.value as { activity?: string; to?: number; unit?: string };
            const m = /^PROPOSAL:([A-Z_]+):([A-Z_]+)$/.exec(st.key);
            if (m && v.to != null) {
              if (!(Number.isFinite(v.to) && v.to > 0 && v.to <= 100)) throw new Error("Proposed productivity rate is out of range");
              const unitOfWork = v.unit?.startsWith("h/") ? v.unit.slice(2) : null; // preserve the proposed unit (P3)
              const cat = await tx.laborCategory.findFirstOrThrow({ where: { companyId: u.companyId, key: m[1] }, include: { rates: true } });
              const existing = cat.rates.find((r) => r.activity === m[2]);
              if (existing && unitOfWork && existing.unitOfWork !== unitOfWork) throw new Error(`Proposed unit h/${unitOfWork} differs from the current rate unit h/${existing.unitOfWork} — propose the rate in h/${existing.unitOfWork}`);
              const meta = { status: "APPROVED" as const, approvedById: u.id, approvedAt: new Date(), source: `Approved standards change ${st.id}` };
              await tx.laborRate.upsert({ where: { laborCategoryId_activity: { laborCategoryId: cat.id, activity: m[2] } }, create: { laborCategoryId: cat.id, activity: m[2], unitOfWork: unitOfWork ?? "m2", hoursPerUnit: v.to, ...meta }, update: { hoursPerUnit: v.to, ...meta } });
            }
            await tx.companyStandard.update({ where: { id: st.id }, data: { status: "APPROVED", approvedById: u.id, approvedAt: new Date() } });
          } else await tx.companyStandard.update({ where: { id: st.id }, data: { status: "RETIRED" } });
          await auditRow(tx);
        });
        break;
      }
      case "BUDGET":
        assertCan(u, "budget.approve");
        await db.$transaction(async (tx) => {
          await claim(tx);
          const moved = await tx.projectBudget.updateMany({ where: { id: a.entityId, project: { companyId: u.companyId }, status: "PENDING" }, data: { status: d.decision, approvedById: u.id } });
          if (moved.count !== 1) throw new Error("The budget is no longer awaiting approval");
          await auditRow(tx);
        });
        break;
      default:
        await db.$transaction(async (tx) => { await claim(tx); await auditRow(tx); });
    }
    for (const f of after) await f();
    revalidatePath("/approvals");
    revalidatePath("/", "layout");
    return message ? { ok: true as const, message } : undefined;
  }, "Decision recorded");
}

export async function requestBudgetApprovalAction(projectId: string) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "plan.review");
    assertCan(u, "budget.read");
    const p = await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: projectId } });
    await db.$transaction(async (tx) => {
      const b = await tx.projectBudget.findFirst({ where: { projectId, status: "PENDING" } }) ?? await tx.projectBudget.create({ data: { projectId, currency: p.currency, totalBudget: p.budgetAmount ?? 0 } });
      // one pending request per budget (also enforced by the partial unique index Approval_one_pending_per_entity)
      if (await tx.approval.findFirst({ where: { entityType: "BUDGET", entityId: b.id, status: "PENDING" } })) throw new Error("A budget approval is already pending for this project");
      await tx.approval.create({ data: { companyId: u.companyId, projectId, entityType: "BUDGET", entityId: b.id, title: `Budget approval — ${p.name}`, requiredRole: "FINANCE", requestedById: u.id } });
    });
    await notify({ roles: ["FINANCE"] }, { companyId: u.companyId, projectId, type: "APPROVAL", title: `Budget approval requested — ${p.name}`, link: "/approvals" });
    revalidatePath(`/projects/${projectId}/budget`);
  }, "Budget approval requested from Finance");
}
