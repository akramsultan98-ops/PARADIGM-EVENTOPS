"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { run } from "./_util";

async function scopedTask(taskId: string) {
  const u = await requireUser();
  assertCan(u, "execution.update");
  const t = await db.task.findFirstOrThrow({ where: { id: taskId, project: projectScope(u) }, include: { project: true, laborCategory: true } });
  if (!["APPROVED", "IN_PREPARATION", "IN_EXECUTION"].includes(t.project.status)) throw new Error("Execution updates are available once the master plan is approved");
  return { u, t };
}

export async function updateTaskProgressAction(taskId: string, status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "NOT_STARTED", percent?: number) {
  return run(async () => {
    ({ status, percent } = z.object({ status: z.enum(["IN_PROGRESS", "COMPLETED", "BLOCKED", "NOT_STARTED"]), percent: z.number().finite().min(0).max(100).optional() }).parse({ status, percent }));
    const { u, t } = await scopedTask(taskId);
    const now = new Date();
    const pct = status === "COMPLETED" ? 100 : Math.max(0, Math.min(99, percent ?? t.percentComplete));
    await db.task.update({ where: { id: t.id }, data: { status, percentComplete: pct, actualStart: t.actualStart ?? (status !== "NOT_STARTED" ? now : null), actualEnd: status === "COMPLETED" ? now : null } });
    await db.executionUpdate.create({ data: { projectId: t.projectId, taskId: t.id, userId: u.id, type: "STATUS", status, percentComplete: pct, message: `${t.name}: ${status.toLowerCase().replace("_", " ")} (${pct}%)` } });
    if (t.project.status === "APPROVED" || t.project.status === "IN_PREPARATION") await db.project.update({ where: { id: t.projectId }, data: { status: "IN_EXECUTION" } });
    if (status === "BLOCKED") await notify({ roles: ["PROJECT_MANAGER"] }, { companyId: u.companyId, projectId: t.projectId, type: "DELAY", title: `Task blocked: ${t.name}`, link: `/execution?project=${t.projectId}` });
    await audit({ companyId: u.companyId, userId: u.id, projectId: t.projectId, action: `TASK_${status}`, entityType: "Task", entityId: t.id, details: { percent: pct } });
    revalidatePath("/execution");
    revalidatePath(`/projects/${t.projectId}`, "layout");
  }, "Task updated");
}

/** Delay reporting with deterministic recovery suggestions (float, crew capacity, overtime). */
export async function reportDelayAction(taskId: string, minutes: number, reason: string) {
  return run(async () => {
    const { u, t } = await scopedTask(taskId);
    const d = z.object({ minutes: z.number().int().min(5).max(7 * 24 * 60), reason: z.string().min(3).max(500) }).parse({ minutes, reason });
    const delayH = d.minutes / 60;
    const recovery: string[] = [];
    const float = t.totalFloatH ?? 0;
    if (!t.isCritical && float >= delayH) recovery.push(`Absorbed by float (${float.toFixed(1)} h available) — no impact on event readiness expected`);
    else {
      if (t.laborCategory && t.crewSize && t.laborHours) {
        const cap = t.laborCategory.headcountAvailable;
        const remainingH = t.laborHours * (1 - t.percentComplete / 100);
        const neededCrew = Math.ceil(remainingH / Math.max(0.5, (t.durationHours * (1 - t.percentComplete / 100)) - delayH));
        if (neededCrew <= cap) recovery.push(`Increase ${t.laborCategory.name.toLowerCase()} crew from ${t.crewSize} to ${neededCrew} to recover ${delayH.toFixed(1)} h (headcount available: ${cap})`);
        else recovery.push(`Crew increase alone cannot recover the delay (needs ${neededCrew}, ${cap} available) — approve overtime up to ${t.laborCategory.maxOvertimeHours} h/day`);
      }
      recovery.push("Re-sequence non-dependent tasks in parallel; review critical successors in the Gantt");
      if (t.isCritical) recovery.push("Critical-path task: Project Manager approval required for any scope or schedule change");
    }
    await db.task.update({ where: { id: t.id }, data: { status: "DELAYED" } });
    await db.executionUpdate.create({ data: { projectId: t.projectId, taskId: t.id, userId: u.id, type: "DELAY", status: "DELAYED", delayMinutes: d.minutes, delayReason: d.reason, message: `${t.name} delayed ${d.minutes} min — ${d.reason}. Recovery: ${recovery.join(" | ")}` } });
    await notify({ roles: ["PROJECT_MANAGER"] }, { companyId: u.companyId, projectId: t.projectId, type: "DELAY", title: `${t.isCritical ? "CRITICAL " : ""}delay: ${t.name} (+${d.minutes} min)`, body: recovery.join(" · "), link: `/execution?project=${t.projectId}` });
    await audit({ companyId: u.companyId, userId: u.id, projectId: t.projectId, action: "DELAY_REPORTED", entityType: "Task", entityId: t.id, details: { ...d, recovery } });
    revalidatePath("/execution");
    return { recovery };
  });
}

export async function reportIssueAction(projectId: string, input: { taskId?: string; type: "ISSUE" | "INSPECTION" | "REQUIREMENT"; message: string }) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "execution.update");
    const p = await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: projectId } });
    const d = z.object({ taskId: z.string().optional(), type: z.enum(["ISSUE", "INSPECTION", "REQUIREMENT"]), message: z.string().min(3).max(2000) }).parse(input);
    if (d.taskId) await db.task.findFirstOrThrow({ where: { id: d.taskId, projectId } });
    await db.executionUpdate.create({ data: { projectId, taskId: d.taskId || null, userId: u.id, type: d.type, message: d.message } });
    if (d.type !== "INSPECTION") await notify({ roles: ["PROJECT_MANAGER"] }, { companyId: u.companyId, projectId, type: "RISK", title: `${d.type === "ISSUE" ? "Site issue" : "Additional requirement"} on ${p.name}`, body: d.message, link: `/execution?project=${projectId}` });
    await audit({ companyId: u.companyId, userId: u.id, projectId, action: `EXECUTION_${d.type}`, entityType: "ExecutionUpdate", details: { message: d.message } });
    revalidatePath("/execution");
  }, "Update recorded");
}

const actualSchema = z.object({ projectId: z.string(), resourceType: z.enum(["MATERIAL", "LABOR", "EQUIPMENT", "VEHICLE", "COST"]), category: z.string().min(2).max(80), description: z.string().min(2).max(200), plannedQuantity: z.union([z.number(), z.null()]).optional(), actualQuantity: z.number().min(0), unit: z.string().min(1).max(20), materialId: z.string().optional().nullable(), taskId: z.string().optional().nullable(), note: z.string().max(500).optional() });
export async function recordActualAction(input: z.input<typeof actualSchema>) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "execution.update");
    const d = actualSchema.parse(input);
    await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: d.projectId } });
    if (d.taskId) await db.task.findFirstOrThrow({ where: { id: d.taskId, projectId: d.projectId } }).catch(() => { throw new Error("Task does not belong to this project"); });
    if (d.materialId) await db.material.findFirstOrThrow({ where: { id: d.materialId, companyId: u.companyId } });
    await db.actualConsumption.create({ data: { projectId: d.projectId, resourceType: d.resourceType, category: d.category, description: d.description, plannedQuantity: d.plannedQuantity ?? null, actualQuantity: d.actualQuantity, unit: d.unit, materialId: d.materialId || null, taskId: d.taskId || null, note: d.note, recordedById: u.id } });
    if (d.plannedQuantity && d.actualQuantity > d.plannedQuantity * 1.1) await notify({ roles: ["PROJECT_MANAGER"] }, { companyId: u.companyId, projectId: d.projectId, type: "RISK", title: `Unexpected consumption: ${d.description} ${d.actualQuantity}/${d.plannedQuantity} ${d.unit}`, link: "/execution/actual-vs-planned" });
    await audit({ companyId: u.companyId, userId: u.id, projectId: d.projectId, action: "ACTUAL_RECORDED", entityType: "ActualConsumption", details: d });
    revalidatePath("/execution");
    revalidatePath("/execution/actual-vs-planned");
  }, "Actual recorded");
}
