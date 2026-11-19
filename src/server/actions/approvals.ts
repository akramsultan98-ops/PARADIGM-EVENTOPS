"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { approvePlan, generatePlan } from "@/server/services/planning";
import { applyApprovedChange } from "@/server/services/changes";
import { reviewSubmissionAction } from "./inputs";
import { run } from "./_util";

const schema = z.object({ approvalId: z.string(), decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]), note: z.string().max(2000).default(""), acknowledgeIssues: z.boolean().default(false) });

/** Single entry point for every approval type; authorisation is enforced per entity type on the server. */
export async function decideApprovalAction(input: z.input<typeof schema>) {
  return run(async () => {
    const u = await requireUser();
    const d = schema.parse(input);
    const a = await db.approval.findFirstOrThrow({ where: { id: d.approvalId, companyId: u.companyId, status: "PENDING" } });
    if (a.requiredRole !== u.role && u.role !== "SUPER_ADMIN") throw new Error(`This approval requires the ${a.requiredRole.replace(/_/g, " ").toLowerCase()} role`);
    const ctx = { companyId: u.companyId, userId: u.id };
    const reject = async () => { await db.approval.update({ where: { id: a.id }, data: { status: d.decision, approverId: u.id, decidedAt: new Date(), decisionNote: d.note || null } }); };
    if (d.decision !== "APPROVED" && d.note.trim().length < 3) throw new Error("Please give a reason");

    switch (a.entityType) {
      case "PLAN":
        assertCan(u, "plan.approve");
        if (d.decision === "APPROVED") await approvePlan(ctx, a.id, d.note || null, d.acknowledgeIssues);
        else { await reject(); await db.scheduleVersion.update({ where: { id: a.entityId }, data: { status: "DRAFT" } }); if (a.projectId) await db.project.update({ where: { id: a.projectId }, data: { status: "PLANNING" } }); }
        break;
      case "SUBMISSION": {
        const r = await reviewSubmissionAction(a.entityId, d.decision === "CHANGES_REQUESTED" ? "NEEDS_INFORMATION" : d.decision, d.note);
        if (!r.ok) throw new Error(r.error);
        break;
      }
      case "PROCUREMENT":
        assertCan(u, "procurement.approve");
        await db.procurementRequest.update({ where: { id: a.entityId }, data: d.decision === "APPROVED" ? { status: "APPROVED", approvedById: u.id } : { status: "QUOTED" } });
        await db.approval.update({ where: { id: a.id }, data: { status: d.decision, approverId: u.id, decidedAt: new Date(), decisionNote: d.note || null } });
        await notify({ roles: ["PROCUREMENT_MANAGER"] }, { companyId: u.companyId, projectId: a.projectId, type: "PROCUREMENT", title: `${a.title}: ${d.decision.toLowerCase().replace("_", " ")}`, link: "/procurement" });
        break;
      case "CHANGE":
        assertCan(u, "plan.approve");
        await db.approval.update({ where: { id: a.id }, data: { status: d.decision, approverId: u.id, decidedAt: new Date(), decisionNote: d.note || null } });
        if (d.decision === "APPROVED") {
          await db.projectChange.update({ where: { id: a.entityId }, data: { status: "APPROVED", approvedById: u.id, decidedAt: new Date() } });
          const ch = await applyApprovedChange(a.entityId, u.companyId);
          await generatePlan(ctx, ch.projectId, { label: `Revision after change: ${ch.title}` });
        } else await db.projectChange.update({ where: { id: a.entityId }, data: { status: "REJECTED", decidedAt: new Date() } });
        break;
      case "STANDARD": {
        assertCan(u, "standards.approve");
        const s = await db.companyStandard.findFirstOrThrow({ where: { id: a.entityId, companyId: u.companyId } });
        await db.approval.update({ where: { id: a.id }, data: { status: d.decision, approverId: u.id, decidedAt: new Date(), decisionNote: d.note || null } });
        if (d.decision === "APPROVED") {
          const v = s.value as { activity?: string; to?: number };
          const m = /^PROPOSAL:([A-Z_]+):([A-Z_]+)$/.exec(s.key);
          if (m && v.to != null) {
            const cat = await db.laborCategory.findFirstOrThrow({ where: { companyId: u.companyId, key: m[1] } });
            await db.laborRate.upsert({ where: { laborCategoryId_activity: { laborCategoryId: cat.id, activity: m[2] } }, create: { laborCategoryId: cat.id, activity: m[2], unitOfWork: "m2", hoursPerUnit: v.to, status: "APPROVED", approvedById: u.id, approvedAt: new Date(), source: `Approved standards change ${s.id}` }, update: { hoursPerUnit: v.to, status: "APPROVED", approvedById: u.id, approvedAt: new Date(), source: `Approved standards change ${s.id}` } });
          }
          await db.companyStandard.update({ where: { id: s.id }, data: { status: "APPROVED", approvedById: u.id, approvedAt: new Date() } });
        } else await db.companyStandard.update({ where: { id: s.id }, data: { status: "RETIRED" } });
        break;
      }
      case "BUDGET":
        assertCan(u, "budget.approve");
        await db.projectBudget.update({ where: { id: a.entityId }, data: { status: d.decision, approvedById: u.id } });
        await reject();
        break;
      default:
        await reject();
    }
    await audit({ companyId: u.companyId, userId: u.id, projectId: a.projectId, action: `APPROVAL_${d.decision}`, entityType: a.entityType, entityId: a.entityId, details: { approvalId: a.id, note: d.note, acknowledgeIssues: d.acknowledgeIssues } });
    revalidatePath("/approvals");
    revalidatePath("/", "layout");
  }, "Decision recorded");
}

export async function requestBudgetApprovalAction(projectId: string) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "plan.review");
    const p = await db.project.findFirstOrThrow({ where: { id: projectId, companyId: u.companyId } });
    const b = await db.projectBudget.findFirst({ where: { projectId, status: "PENDING" } }) ?? await db.projectBudget.create({ data: { projectId, currency: p.currency, totalBudget: p.budgetAmount ?? 0 } });
    await db.approval.create({ data: { companyId: u.companyId, projectId, entityType: "BUDGET", entityId: b.id, title: `Budget approval — ${p.name}`, requiredRole: "FINANCE", requestedById: u.id } });
    await notify({ roles: ["FINANCE"] }, { companyId: u.companyId, projectId, type: "APPROVAL", title: `Budget approval requested — ${p.name}`, link: "/approvals" });
    revalidatePath(`/projects/${projectId}/budget`);
  }, "Budget approval requested from Finance");
}
