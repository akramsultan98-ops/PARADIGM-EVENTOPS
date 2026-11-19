import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { runPlanningPipeline, type PlanResult } from "@/engines/pipeline";
import { buildSnapshot } from "./snapshot";

export interface Ctx { companyId: string; userId: string | null }

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const dt = (ms: number | null | undefined) => (ms == null ? null : new Date(ms));

export async function latestPlan(projectId: string, opts: { approvedOnly?: boolean } = {}) {
  const v = await db.scheduleVersion.findFirst({
    where: { projectId, ...(opts.approvedOnly ? { status: "APPROVED" } : { status: { not: "SUPERSEDED" } }) },
    orderBy: { version: "desc" },
  });
  if (!v) return null;
  return { version: v, plan: v.snapshot as unknown as PlanResult };
}

/**
 * Run the deterministic planning pipeline for a project and persist the results:
 * versioned schedule (with the full plan + traces), tasks & dependencies, calculation records,
 * material calculations, cutting plans, procurement requests, generated cost items, risks,
 * vehicle assignments, resource reservations and a PLAN approval request.
 * Approved plans are never overwritten — a new version is created for review.
 */
export async function generatePlan(ctx: Ctx, projectId: string, opts: { asOf?: Date; label?: string } = {}) {
  const project = await db.project.findFirstOrThrow({ where: { id: projectId, companyId: ctx.companyId, deletedAt: null } });
  if (["COMPLETED", "CANCELLED"].includes(project.status)) throw new Error(`Cannot re-plan a ${project.status.toLowerCase()} project`);
  const snapshot = await buildSnapshot(ctx.companyId, projectId, opts.asOf ?? new Date());
  const plan = runPlanningPipeline(snapshot);
  const executing = project.status === "IN_EXECUTION";

  const result = await db.$transaction(async (tx) => {
    const last = await tx.scheduleVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
    const versionNo = (last?.version ?? 0) + 1;
    await tx.scheduleVersion.updateMany({ where: { projectId, status: { in: ["DRAFT", "UNDER_REVIEW"] } }, data: { status: "SUPERSEDED" } });
    const version = await tx.scheduleVersion.create({
      data: {
        projectId, version: versionNo, label: opts.label ?? `Plan v${versionNo}`, status: "UNDER_REVIEW", method: plan.schedule.method,
        makespanHours: plan.schedule.makespanHours, feasible: plan.readiness.feasible, snapshot: json(plan), conflicts: json(plan.schedule.conflicts), criticalPath: json(plan.schedule.criticalPath), createdById: ctx.userId,
      },
    });

    // calculation provenance
    await tx.calculationRecord.deleteMany({ where: { projectId, state: { notIn: ["APPROVED", "VERIFIED"] } } });
    const traceIds: string[] = [];
    for (const t of plan.traces) {
      const r = await tx.calculationRecord.create({ data: { companyId: ctx.companyId, projectId, engine: t.engine, subjectType: t.subjectType, subjectId: t.subjectId, title: t.title, formula: t.formula, inputs: json(t.inputs), outputs: json(t.outputs), assumptions: json(t.assumptions), units: t.units, engineVersion: t.engineVersion, inputHash: t.inputHash, state: t.state, createdById: ctx.userId } });
      traceIds.push(r.id);
    }
    await tx.materialCalculation.deleteMany({ where: { projectId } });
    for (const l of plan.production.boq) {
      await tx.materialCalculation.create({ data: { projectId, productionItemId: l.itemIds.length === 1 ? l.itemIds[0] : null, materialId: l.materialId, netQuantity: l.netQuantity, wastePct: l.wastePct, grossQuantity: l.grossQuantity, purchaseQuantity: l.purchaseQuantity, unit: l.unit, method: l.method, state: l.state, calculationId: traceIds[l.traceIndex] ?? null } });
    }
    await tx.cuttingPlan.deleteMany({ where: { projectId } });
    for (const c of plan.production.cutting) {
      const ti = plan.traces.findIndex((t) => t.inputHash === c.result.trace.inputHash);
      await tx.cuttingPlan.create({ data: { projectId, materialId: c.materialId, boardsUsed: c.result.boardsUsed, utilizationPct: c.result.utilizationPct, kerfMm: (c.result.trace.inputs as { board: { kerfMm: number } }).board.kerfMm, layout: json(c.result.layouts), unplaced: json(c.result.unplaced), calculationId: traceIds[ti] ?? null } });
    }

    // calculation states only — technical approval (approvalStatus) is owned by the review workflow and is never touched here
    for (const m of plan.production.items) await tx.productionItem.update({ where: { id: m.itemId }, data: { calculationState: m.state } });
    for (const l of plan.av.lines) await tx.equipmentRequirement.update({ where: { id: l.requirementId }, data: { allocatedQty: l.allocated, rentalQty: l.rental, calculationState: l.state } });

    // tasks — while executing, keep task records (status/actuals) and update dates only
    const depts = await tx.department.findMany({ where: { companyId: ctx.companyId } });
    const deptId = (k: string) => depts.find((d) => d.key === k)?.id ?? null;
    const labor = await tx.laborCategory.findMany({ where: { companyId: ctx.companyId } });
    const laborId = (k: string | null) => (k ? labor.find((l) => l.key === k)?.id ?? null : null);
    if (!executing) await tx.task.deleteMany({ where: { projectId, generated: true } });
    const existing = executing ? await tx.task.findMany({ where: { projectId, generated: true } }) : [];
    const idByKey = new Map<string, string>();
    for (const t of plan.tasks) {
      const data = {
        wbsCode: t.wbsCode, name: t.name, phase: t.phase, departmentId: deptId(t.department), laborCategoryId: laborId(t.laborKey), crewSize: t.crewSize, laborHours: t.laborHours,
        durationHours: t.durationHours, plannedStart: dt(t.start), plannedEnd: dt(t.finish), totalFloatH: t.floatHours, isCritical: t.critical, isMilestone: t.isMilestone,
        priority: t.critical ? ("HIGH" as const) : ("MEDIUM" as const), location: t.location, deadline: dt(t.deadline), sourceType: t.sourceType, sourceId: t.sourceId,
        description: t.durationState === "NEEDS_INFORMATION" ? "Duration not verified — missing productivity or route data" : null, requiresApproval: t.phase === "SETUP" && t.key === "INSPECT",
      };
      const prev = existing.find((e) => e.planKey === t.key);
      if (prev) {
        await tx.task.update({ where: { id: prev.id }, data: { ...data, wbsCode: prev.wbsCode } });
        idByKey.set(t.key, prev.id);
      } else {
        let wbs = t.wbsCode;
        if (executing && (await tx.task.findFirst({ where: { projectId, wbsCode: wbs } }))) wbs = `${wbs}-v${versionNo}`;
        const c = await tx.task.create({ data: { ...data, wbsCode: wbs, projectId, planKey: t.key, generated: true } });
        idByKey.set(t.key, c.id);
      }
    }
    await tx.taskDependency.deleteMany({ where: { successor: { projectId, generated: true } } });
    const seen = new Set<string>();
    for (const d of plan.dependencies) {
      const a = idByKey.get(d.from), b = idByKey.get(d.to);
      if (!a || !b || seen.has(`${a}|${b}`)) continue;
      seen.add(`${a}|${b}`);
      await tx.taskDependency.create({ data: { predecessorId: a, successorId: b, type: d.type, lagHours: d.lagHours } });
    }
    await tx.laborAssignment.deleteMany({ where: { projectId, status: "PLANNED" } });
    for (const t of plan.tasks) {
      if (!t.laborKey || !t.crewSize || !t.start || !t.laborHours) continue;
      await tx.laborAssignment.create({ data: { projectId, taskId: idByKey.get(t.key), laborCategoryId: laborId(t.laborKey)!, workDate: new Date(t.start), crewSize: t.crewSize, hours: t.laborHours } });
    }

    // resource reservations (for cross-project conflict detection)
    await tx.resourceAssignment.deleteMany({ where: { projectId, status: "PLANNED" } });
    const p = snapshot.project;
    const resEnd = p.dismantleEnd ?? new Date(p.eventEnd.getTime() + 86400000);
    for (const l of plan.av.lines) {
      const eqId = snapshot.equipmentRequirements.find((r) => r.id === l.requirementId)?.equipmentId;
      if (eqId && l.allocated > 0) await tx.resourceAssignment.create({ data: { projectId, resourceType: "EQUIPMENT", resourceId: eqId, quantity: l.allocated, startAt: p.setupStart, endAt: resEnd } });
    }
    await tx.vehicleAssignment.deleteMany({ where: { projectId, status: "PLANNED" } });
    const travel = plan.tasks.find((t) => t.key === "TRAVEL:OUT");
    const ret = plan.tasks.find((t) => t.key === "TRAVEL:RETURN");
    for (const trip of plan.logistics.trips) {
      await tx.vehicleAssignment.create({ data: { projectId, vehicleId: trip.vehicleId, tripLabel: `Outbound ${snapshot.project.originCity} → ${snapshot.venue?.city ?? p.location}`, direction: "OUTBOUND", departureAt: dt(travel?.start), arrivalAt: dt(travel?.finish), loadedWeightKg: trip.weightKg, loadedVolumeM3: trip.volumeM3 } });
      await tx.vehicleAssignment.create({ data: { projectId, vehicleId: trip.vehicleId, tripLabel: `Return ${snapshot.venue?.city ?? p.location} → ${snapshot.project.originCity}`, direction: "RETURN", departureAt: dt(ret?.start), arrivalAt: dt(ret?.finish), loadedWeightKg: trip.weightKg, loadedVolumeM3: trip.volumeM3 } });
      await tx.resourceAssignment.create({ data: { projectId, resourceType: "VEHICLE", resourceId: trip.vehicleId, startAt: dt(travel?.start) ?? p.setupStart, endAt: dt(ret?.finish) ?? resEnd } });
    }
    if (plan.logistics.backupVehicle) await tx.vehicleAssignment.create({ data: { projectId, vehicleId: plan.logistics.backupVehicle.id, tripLabel: "Standby backup vehicle", isBackup: true, departureAt: dt(travel?.start) } });

    // procurement requests — create/update DRAFT lines, never touch committed ones
    const vendors = await tx.vendor.findMany({ where: { companyId: ctx.companyId } });
    const procDept = deptId("PROCUREMENT");
    for (const l of plan.procurement) {
      const prev = await tx.procurementRequest.findUnique({ where: { projectId_code: { projectId, code: l.key } } });
      const data = { item: l.item, materialId: l.materialId, quantity: l.quantity, unit: l.unit, requiredByDate: dt(l.requiredBy), vendorId: vendors.find((v) => v.name === l.vendor)?.id ?? null, unitPrice: l.unitPrice, currency: l.currency, specifications: `${l.type}${l.orderBy ? ` · order by ${new Date(l.orderBy).toISOString().slice(0, 10)}` : ""}${l.leadTimeDays != null ? ` · lead time ${l.leadTimeDays} d` : ""}` };
      if (!prev) await tx.procurementRequest.create({ data: { ...data, projectId, code: l.key, departmentId: l.type === "RENTAL" ? deptId("AV") : l.type === "PRINT" ? deptId("CREATIVE") : procDept } });
      else if (["DRAFT", "RFQ_PREPARED"].includes(prev.status)) await tx.procurementRequest.update({ where: { id: prev.id }, data });
    }

    // generated cost lines
    await tx.costItem.deleteMany({ where: { projectId, generated: true } });
    for (const c of plan.budget.lines.filter((l) => l.source !== "Entered cost / quotation")) {
      await tx.costItem.create({ data: { projectId, category: c.category as never, description: c.description, quantity: c.quantity, unit: c.unit, unitCost: c.unitCost, amount: c.amount, currency: c.currency, basis: c.basis, generated: true } });
    }

    // risks: regenerate hypothetical ones; keep anything a person has touched
    await tx.risk.deleteMany({ where: { projectId, generated: true, status: "IDENTIFIED" } });
    const kept = await tx.risk.findMany({ where: { projectId }, select: { ruleKey: true, code: true } });
    const keptRules = new Set(kept.map((k) => k.ruleKey));
    const usedCodes = new Set(kept.map((k) => k.code));
    const owners = await tx.user.findMany({ where: { companyId: ctx.companyId, active: true }, include: { role: true } });
    let n = 1;
    for (const r of plan.risks) {
      if (keptRules.has(r.ruleKey)) continue;
      while (usedCodes.has(`R-${String(n).padStart(2, "0")}`)) n++;
      const code = `R-${String(n).padStart(2, "0")}`;
      usedCodes.add(code);
      await tx.risk.create({ data: { projectId, code, departmentId: deptId(r.department), title: r.title, description: r.description, probability: r.probability, impact: r.impact, severity: r.severity, ownerId: owners.find((o) => o.role.key === r.ownerRole)?.id ?? null, trigger: r.trigger, warningSigns: r.warningSigns, prevention: r.prevention, immediateAction: r.immediateAction, contingency: r.contingency, responseTimeMin: r.responseTimeMin, requiredResources: r.requiredResources, timeImpactHours: r.timeImpactHours, costImpact: r.costImpact, costCurrency: r.costCurrency, generated: true, ruleKey: r.ruleKey } });
    }

    await tx.approval.updateMany({ where: { projectId, entityType: "PLAN", status: "PENDING" }, data: { status: "CHANGES_REQUESTED", decisionNote: `Superseded by plan v${versionNo}`, decidedAt: new Date() } });
    await tx.approval.create({ data: { companyId: ctx.companyId, projectId, entityType: "PLAN", entityId: version.id, title: `Integrated master plan v${versionNo} — ${project.name}`, description: `${plan.tasks.length} tasks · ${plan.readiness.errors} open errors · ${plan.readiness.warnings} warnings · ${plan.schedule.feasible ? "schedule feasible" : "schedule has conflicts"}`, requiredRole: "PROJECT_MANAGER", requestedById: ctx.userId } });
    await tx.project.update({ where: { id: projectId }, data: { planVersion: versionNo, status: ["LEAD", "PLANNING", "AWAITING_INPUTS"].includes(project.status) ? "UNDER_REVIEW" : project.status } });
    await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.userId, projectId, action: "PLAN_GENERATED", entityType: "ScheduleVersion", entityId: version.id, details: json({ version: versionNo, tasks: plan.tasks.length, errors: plan.readiness.errors, warnings: plan.readiness.warnings, feasible: plan.readiness.feasible }) } });
    return { versionId: version.id, version: versionNo };
  }, { timeout: 120000, maxWait: 20000 });

  // notify departments with open questions (outside the transaction)
  const byDept = new Map<string, number>();
  plan.readiness.questions.forEach((q) => byDept.set(q.department, (byDept.get(q.department) ?? 0) + 1));
  for (const [dept, count] of byDept) {
    await notify({ departments: [dept] }, { companyId: ctx.companyId, projectId, type: "MISSING_INPUT", title: `${count} open question(s) on ${project.name}`, body: "The planning engine needs information from your department.", link: `/projects/${projectId}/inputs` });
  }
  await notify({ roles: ["PROJECT_MANAGER"] }, { companyId: ctx.companyId, projectId, type: "APPROVAL", title: `Plan v${result.version} ready for review — ${project.name}`, link: `/projects/${projectId}/planning` });
  return { ...result, plan };
}

/** Approve the integrated plan. Requires all participating departments' technical inputs to be approved. */
export async function approvePlan(ctx: Ctx, approvalId: string, note: string | null, acknowledgeIssues: boolean) {
  const a = await db.approval.findFirstOrThrow({ where: { id: approvalId, companyId: ctx.companyId, entityType: "PLAN", status: "PENDING" } });
  const version = await db.scheduleVersion.findFirstOrThrow({ where: { id: a.entityId, project: { companyId: ctx.companyId } } });
  const plan = version.snapshot as unknown as PlanResult;
  const pending = await db.departmentSubmission.findMany({ where: { projectId: version.projectId, status: { in: ["DRAFT", "NEEDS_INFORMATION", "SUBMITTED", "UNDER_REVIEW", "EXTRACTING"] } }, include: { department: true } });
  if (pending.length) throw new Error(`Department technical approvals outstanding: ${[...new Set(pending.map((p) => p.department.name))].join(", ")}`);
  if (plan.readiness.errors > 0 && !acknowledgeIssues) throw new Error(`The plan has ${plan.readiness.errors} open error(s). Tick "acknowledge open issues" to approve with documented exceptions.`);
  await db.$transaction([
    db.scheduleVersion.updateMany({ where: { projectId: version.projectId, status: "APPROVED" }, data: { status: "SUPERSEDED" } }),
    db.scheduleVersion.update({ where: { id: version.id }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() } }),
    db.approval.update({ where: { id: a.id }, data: { status: "APPROVED", approverId: ctx.userId, decidedAt: new Date(), decisionNote: [note, plan.readiness.errors ? `Approved with ${plan.readiness.errors} acknowledged open issue(s)` : null].filter(Boolean).join(" — ") || null } }),
    db.project.update({ where: { id: version.projectId }, data: { status: "APPROVED" } }),
    db.calculationRecord.updateMany({ where: { projectId: version.projectId, state: "CALCULATED" }, data: { state: "APPROVED", approvedById: ctx.userId } }),
    db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.userId, projectId: version.projectId, action: "PLAN_APPROVED", entityType: "ScheduleVersion", entityId: version.id, details: json({ version: version.version, acknowledgedErrors: plan.readiness.errors, note }) } }),
  ]);
  await notify({ roles: ["PROJECT_MANAGER", "ACCOUNT_MANAGER", "PRODUCTION_MANAGER", "AV_MANAGER", "LOGISTICS_MANAGER", "ACCOMMODATION_MANAGER", "CREATIVE_MANAGER", "PROCUREMENT_MANAGER", "FINANCE"] }, { companyId: ctx.companyId, projectId: version.projectId, type: "SCHEDULE", title: `Master plan v${version.version} approved`, link: `/projects/${version.projectId}` });
  return version;
}
