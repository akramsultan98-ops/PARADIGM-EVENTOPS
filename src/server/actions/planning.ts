"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { fromLocalInput } from "@/lib/format";
import { buildSnapshot } from "@/server/services/snapshot";
import { loadChangeTarget } from "@/server/services/changes";
import { runPlanningPipeline, type PlanResult } from "@/engines/pipeline";
import { applyScenario, parseWhatIf, type ScenarioAssumptions } from "@/engines/whatif";
import { compareImpact } from "@/engines/impact";
import type { ProjectSnapshot } from "@/engines/snapshot";
import { run } from "./_util";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

function summarize(plan: PlanResult) {
  const insp = plan.tasks.find((t) => t.key === "INSPECT");
  const ev = plan.tasks.find((t) => t.key === "EVENT:START");
  return {
    errors: plan.readiness.errors, warnings: plan.readiness.warnings, feasible: plan.schedule.feasible,
    vehicles: plan.logistics.trips.map((t) => t.vehicleCode), crew: plan.trades.map((t) => ({ trade: t.name, phase: t.phase, crew: t.requiredCrew, shortfall: t.shortfall })),
    setupSlackHours: insp?.finish && ev?.start ? Math.round(((ev.start - insp.finish) / 3600000) * 10) / 10 : null,
    cost: plan.budget.byCurrency.map((c) => ({ currency: c.currency, total: c.total })), budgetVariance: plan.budget.variance,
    conflicts: plan.schedule.conflicts.filter((c) => c.severity === "error").map((c) => c.message).slice(0, 10),
    risks: plan.risks.map((r) => `${r.level}: ${r.title}`),
  };
}

export async function runWhatIfAction(projectId: string, question: string, overrides: ScenarioAssumptions = {}) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "plan.review");
    const p = await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: projectId } });
    const snap = await buildSnapshot(u.companyId, p.id, new Date());
    const base = runPlanningPipeline(snap);
    const assumptions: ScenarioAssumptions = { ...parseWhatIf(question), ...overrides };
    if (assumptions.vehiclesUnavailable?.includes("__MAIN__")) {
      const main = [...base.logistics.trips].sort((a, b) => b.weightKg - a.weightKg)[0];
      assumptions.vehiclesUnavailable = main ? [main.vehicleCode] : [];
    }
    if (!Object.keys(assumptions).length) throw new Error("The question could not be translated into a scenario. Try e.g. “What if we only get one setup day?”, “What if the main truck breaks down?”, “What if delivery is delayed 6 hours?”, “What if participants increase by 50?”, “What if the budget decreases by 15%?”");
    const { snapshot, notes } = applyScenario(snap, assumptions);
    const scen = runPlanningPipeline(snapshot);
    const impact = compareImpact(base, scen);
    const recommendations = recommend(base, scen, assumptions);
    const sim = await db.scenarioSimulation.create({ data: { projectId, name: question.slice(0, 120) || "Scenario", question, assumptions: json(assumptions), createdById: u.id, result: json({ notes, impact, baseline: summarize(base), scenario: summarize(scen), recommendations }) } });
    await audit({ companyId: u.companyId, userId: u.id, projectId, action: "WHATIF_RUN", entityType: "ScenarioSimulation", entityId: sim.id, details: json(assumptions) });
    revalidatePath(`/projects/${projectId}/planning`);
    return { id: sim.id };
  }, "Scenario simulated — the approved plan was not changed");
}

function recommend(base: PlanResult, scen: PlanResult, a: ScenarioAssumptions): string[] {
  const out: string[] = [];
  for (const t of scen.trades.filter((x) => x.shortfall > 0)) out.push(t.crewWithOvertime != null && t.crewWithOvertime <= t.available ? `${t.name} (${t.phase.toLowerCase()}): approve up to overtime — ${t.crewWithOvertime} crew covers the work` : `${t.name} (${t.phase.toLowerCase()}): add ${t.shortfall} freelance/temporary crew`);
  if (scen.logistics.unassigned.length) out.push(`Rent an additional vehicle: ${scen.logistics.unassigned.length} package(s) cannot be loaded`);
  if (a.vehiclesUnavailable?.length && scen.logistics.trips.length) out.push(`Reassign cargo to ${scen.logistics.trips.map((t) => t.vehicleCode).join(", ")}${scen.logistics.backupVehicle ? `; keep ${scen.logistics.backupVehicle.code} on standby` : ""}`);
  const dl = scen.schedule.conflicts.filter((c) => c.type === "DEADLINE");
  if (dl.length) out.push(`${dl.length} task(s) miss the setup deadline — pre-assemble in the workshop, extend site hours or descope with client approval`);
  if ((scen.budget.variance ?? 0) < 0) out.push(`Plan exceeds the budget by ${Math.abs(scen.budget.variance ?? 0).toLocaleString()} — review rentals and contingency`);
  if (a.participantsDelta) out.push("Ask AV, Creative and Account Management to confirm participant-driven quantities (microphones, headsets, badges, seating)");
  if (!out.length && compareImpact(base, scen).domains.every((d) => !d.changed)) out.push("No calculated impact — the current plan absorbs this scenario");
  return out;
}

// ───────────── change requests with impact analysis ─────────────
const changeSchema = z.object({
  projectId: z.string(),
  title: z.string().min(3).max(200),
  entityType: z.enum(["ProductionItem", "Project", "Vehicle", "EquipmentRequirement"]),
  entityId: z.string(),
  changes: z.array(z.object({ field: z.string(), to: z.union([z.string(), z.number(), z.boolean()]) })).min(1),
});
const ALLOWED: Record<string, string[]> = { ProductionItem: ["widthM", "heightM", "depthM", "quantity"], Project: ["eventStart", "eventEnd", "setupStart", "participants", "budgetAmount"], Vehicle: ["available"], EquipmentRequirement: ["quantity", "backupQuantity"] };

function applyToSnapshot(s: ProjectSnapshot, c: z.infer<typeof changeSchema>): ProjectSnapshot {
  const snap = structuredClone(s);
  for (const ch of c.changes) {
    if (c.entityType === "ProductionItem") {
      const it = snap.productionItems.find((x) => x.id === c.entityId);
      if (!it) continue;
      if (ch.field === "widthM" || ch.field === "heightM") {
        const r = applyScenario(snap, { itemResize: [{ itemCode: it.code, [ch.field]: Number(ch.to) }] });
        Object.assign(snap, r.snapshot);
      } else (it as unknown as Record<string, unknown>)[ch.field] = Number(ch.to);
    } else if (c.entityType === "Project") {
      const p = snap.project as unknown as Record<string, unknown>;
      p[ch.field] = ["eventStart", "eventEnd", "setupStart"].includes(ch.field) ? fromLocalInput(String(ch.to)) : Number(ch.to);
    } else if (c.entityType === "Vehicle") {
      const v = snap.vehicles.find((x) => x.id === c.entityId);
      if (v) v.available = ch.to === true || ch.to === "true";
    } else if (c.entityType === "EquipmentRequirement") {
      const r = snap.equipmentRequirements.find((x) => x.id === c.entityId);
      if (r) (r as unknown as Record<string, unknown>)[ch.field] = Number(ch.to);
    }
  }
  return snap;
}

export async function proposeChangeAction(input: z.input<typeof changeSchema>) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "submission.create");
    const c = changeSchema.parse(input);
    for (const ch of c.changes) if (!ALLOWED[c.entityType].includes(ch.field)) throw new Error(`Field ${ch.field} cannot be changed through a change request`);
    const p = await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: c.projectId } });
    const snap = await buildSnapshot(u.companyId, p.id, new Date());
    const current = await loadChangeTarget(c.entityType, c.entityId, p.id, u.companyId); // target must belong to this project / company
    const base = runPlanningPipeline(snap);
    const next = runPlanningPipeline(applyToSnapshot(snap, c));
    const impact = compareImpact(base, next);
    const change = await db.projectChange.create({ data: { projectId: p.id, title: c.title, entityType: c.entityType, entityId: c.entityId, changes: json(c.changes.map((ch) => ({ field: ch.field, from: current[ch.field] ?? null, to: ch.to }))), impact: json({ ...impact, after: summarize(next), before: summarize(base) }), requestedById: u.id } });
    await db.approval.create({ data: { companyId: u.companyId, projectId: p.id, entityType: "CHANGE", entityId: change.id, title: `Change request: ${c.title}`, description: impact.summary, requiredRole: "PROJECT_MANAGER", requestedById: u.id } });
    await notify({ roles: ["PROJECT_MANAGER"], departments: impact.approvalsRequired }, { companyId: u.companyId, projectId: p.id, type: "APPROVAL", title: `Change request on ${p.name}: ${c.title}`, body: impact.summary, link: `/projects/${p.id}/planning` });
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: "CHANGE_PROPOSED", entityType: "ProjectChange", entityId: change.id, details: json(c.changes) });
    revalidatePath(`/projects/${p.id}/planning`);
    return { id: change.id, summary: impact.summary };
  }, "Change request created with impact analysis — awaiting approval");
}


