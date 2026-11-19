"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
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
    const args = z.object({ taskId: z.string().min(1), newStartLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid date/time"), reason: z.string().trim().min(3, "Please give a reason for the schedule change").max(500) }).parse({ taskId, newStartLocal, reason });
    const task = await db.task.findFirstOrThrow({ where: { id: args.taskId, project: projectScope(u) }, include: { project: true, department: true } });
    if (!task.plannedStart || !task.plannedEnd) throw new Error("Task has no planned dates");
    if (["COMPLETED", "CANCELLED"].includes(task.project.status)) throw new Error(`Project is ${task.project.status.toLowerCase()}`);
    if (task.isMilestone && task.planKey?.startsWith("EVENT")) throw new Error("Event milestones are fixed by the project dates — change the event dates through a change request");
    // P2-D: an APPROVED schedule may only be changed by someone with plan-approval authority (recorded as the approver)
    const approvedSchedule = ["APPROVED", "IN_PREPARATION", "IN_EXECUTION"].includes(task.project.status);
    const canApprove = u.permissions.has("plan.approve");
    if (approvedSchedule && !canApprove) throw new Error("This schedule is approved — ask the Project Manager to approve the change (manual changes to an approved schedule need plan-approval authority)");
    // departments move only their own tasks
    if (!canApprove && task.department && !(u.approvalDepartment === task.department.key || u.departments.some((d) => d.key === task.department!.key))) throw new Error(`Only ${task.department.name} or the Project Manager can move this task`);
    const newStart = fromLocalInput(args.newStartLocal);
    if (Number.isNaN(newStart.getTime())) throw new Error("Invalid date/time");
    const tasks = await db.task.findMany({ where: { projectId: task.projectId }, include: { successors: true } });
    const byId = new Map(tasks.map((t) => [t.id, { ...t, s: t.plannedStart?.getTime() ?? null, e: t.plannedEnd?.getTime() ?? null }]));
    const me = byId.get(taskId)!;
    const dur = me.e! - me.s!;
    // P2-D: never move a task ahead of what its predecessors allow (incl. unfinished predecessors)
    const preds = await db.taskDependency.findMany({ where: { successorId: taskId }, include: { predecessor: true } });
    for (const dep of preds) {
      const pr = dep.predecessor;
      if (!pr.plannedStart || !pr.plannedEnd) continue;
      const ps = pr.plannedStart.getTime(), pe = (pr.status === "COMPLETED" && pr.actualEnd ? pr.actualEnd : pr.plannedEnd).getTime(), lag = dep.lagHours * H;
      const earliest = dep.type === "FS" ? pe + lag : dep.type === "SS" ? ps + lag : dep.type === "FF" ? pe + lag - dur : ps + lag - dur;
      if (newStart.getTime() < earliest - 1000) {
        throw new Error(`"${task.name}" cannot start before ${new Date(earliest).toISOString().slice(0, 16).replace("T", " ")} UTC — predecessor "${pr.name}" (${dep.type}${dep.lagHours ? ` +${dep.lagHours} h` : ""})${pr.status !== "COMPLETED" ? " is not finished" : ""}`);
      }
    }
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
    const fromStart = task.plannedStart.toISOString();
    await db.$transaction(async (tx) => {
      for (const [id, c] of changed) await tx.task.update({ where: { id }, data: { plannedStart: new Date(c.s), plannedEnd: new Date(c.e) } });
      await tx.projectChange.create({ data: { projectId: task.projectId, title: `Schedule change: ${task.name}`, entityType: "Task", entityId: task.id, changes: [{ field: "plannedStart", from: fromStart, to: newStart.toISOString() }], impact: { affectedTasks: [...changed.keys()].map((k) => byId.get(k)!.name), warnings, reason: args.reason }, status: "APPLIED", requestedById: u.id, approvedById: canApprove ? u.id : null, decidedAt: new Date() } });
      await tx.auditLog.create({ data: { companyId: u.companyId, userId: u.id, projectId: task.projectId, action: approvedSchedule ? "APPROVED_SCHEDULE_CHANGED" : "TASK_RESCHEDULED", entityType: "Task", entityId: task.id, details: { to: newStart.toISOString(), affected: changed.size, warnings, reason: args.reason } } });
    });
    await notify({ roles: ["PROJECT_MANAGER"] }, { companyId: u.companyId, projectId: task.projectId, type: "SCHEDULE", title: `Schedule changed: ${task.name} (${changed.size - 1} dependent task(s) moved)`, body: warnings.join("; ") || undefined, link: `/projects/${task.projectId}/timeline` });
    revalidatePath(`/projects/${task.projectId}`, "layout");
    return { affected: [...changed.keys()], warnings };
  });
}
