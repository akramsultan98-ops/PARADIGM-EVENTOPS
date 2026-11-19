"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { fromLocalInput } from "@/lib/format";
import { run } from "./_util";

const H = 3600000;

/**
 * Manually move a task. Successors are pushed forward (never pulled earlier) to keep every
 * dependency satisfied, durations are preserved, and all affected tasks are reported.
 */
export async function rescheduleTaskAction(taskId: string, newStartLocal: string, reason: string) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "schedule.edit");
    const task = await db.task.findFirstOrThrow({ where: { id: taskId, project: projectScope(u) }, include: { project: true } });
    if (!task.plannedStart || !task.plannedEnd) throw new Error("Task has no planned dates");
    if (reason.trim().length < 3) throw new Error("Please give a reason for the schedule change");
    const newStart = fromLocalInput(newStartLocal);
    const tasks = await db.task.findMany({ where: { projectId: task.projectId }, include: { successors: true } });
    const byId = new Map(tasks.map((t) => [t.id, { ...t, s: t.plannedStart?.getTime() ?? null, e: t.plannedEnd?.getTime() ?? null }]));
    const me = byId.get(taskId)!;
    const dur = me.e! - me.s!;
    const changed = new Map<string, { s: number; e: number; before: number }>();
    me.s = newStart.getTime(); me.e = me.s + dur;
    changed.set(taskId, { s: me.s, e: me.e, before: task.plannedStart.getTime() });
    const queue = [taskId];
    while (queue.length) {
      const id = queue.shift()!;
      const p = byId.get(id)!;
      for (const dep of p.successors) {
        const s = byId.get(dep.successorId);
        if (!s || s.s == null || s.e == null) continue;
        const lag = dep.lagHours * H, d = s.e - s.s;
        let required = s.s;
        if (dep.type === "FS") required = Math.max(required, p.e! + lag);
        if (dep.type === "SS") required = Math.max(required, p.s! + lag);
        if (dep.type === "FF") required = Math.max(required, p.e! + lag - d);
        if (dep.type === "SF") required = Math.max(required, p.s! + lag - d);
        if (required > s.s + 1000) {
          if (s.isMilestone && s.planKey?.startsWith("EVENT")) continue; // fixed event dates never move
          const before = changed.get(s.id)?.before ?? s.s;
          s.s = required; s.e = required + d;
          changed.set(s.id, { s: s.s, e: s.e, before });
          queue.push(s.id);
        }
      }
    }
    const warnings: string[] = [];
    for (const [id, c] of changed) {
      const t = byId.get(id)!;
      if (t.deadline && c.e > t.deadline.getTime()) warnings.push(`"${t.name}" now finishes ${((c.e - t.deadline.getTime()) / H).toFixed(1)} h after its deadline`);
      const ev = tasks.find((x) => x.planKey === "EVENT:START");
      if (ev?.plannedStart && t.phase === "SETUP" && c.e > ev.plannedStart.getTime()) warnings.push(`"${t.name}" now ends after the event start`);
    }
    await db.$transaction([...changed].map(([id, c]) => db.task.update({ where: { id }, data: { plannedStart: new Date(c.s), plannedEnd: new Date(c.e) } })));
    await db.projectChange.create({ data: { projectId: task.projectId, title: `Schedule change: ${task.name}`, entityType: "Task", entityId: task.id, changes: [{ field: "plannedStart", from: task.plannedStart.toISOString(), to: newStart.toISOString() }], impact: { affectedTasks: [...changed.keys()].map((k) => byId.get(k)!.name), warnings, reason }, status: "APPLIED", requestedById: u.id, approvedById: u.id, decidedAt: new Date() } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: task.projectId, action: "TASK_RESCHEDULED", entityType: "Task", entityId: task.id, details: { to: newStart.toISOString(), affected: changed.size, warnings, reason } });
    await notify({ roles: ["PROJECT_MANAGER"] }, { companyId: u.companyId, projectId: task.projectId, type: "SCHEDULE", title: `Schedule changed: ${task.name} (${changed.size - 1} dependent task(s) moved)`, body: warnings.join("; ") || undefined, link: `/projects/${task.projectId}/timeline` });
    revalidatePath(`/projects/${task.projectId}`, "layout");
    return { affected: [...changed.keys()], warnings };
  });
}
