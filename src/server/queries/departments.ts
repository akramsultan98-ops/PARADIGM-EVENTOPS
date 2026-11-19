import "server-only";
import { db } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { getLatestPlans } from "./plans";

/** Projects a department participates in (company/user scoped) with their latest plans. */
export async function departmentProjects(u: AuthUser, deptKey: string, projectId?: string) {
  const projects = await db.project.findMany({
    where: { ...projectScope(u), status: { notIn: ["CANCELLED", "COMPLETED"] }, ...(deptKey === "ACCOUNT" || deptKey === "PMO" ? {} : { departments: { some: { department: { key: deptKey } } } }), ...(projectId ? { id: projectId } : {}) },
    include: { departments: { include: { department: true, lead: { select: { name: true } } } }, venue: true },
    orderBy: { eventStart: "asc" },
  });
  const plans = await getLatestPlans(projects.map((p) => p.id));
  const focus = projects.find((p) => plans.has(p.id) && p.status !== "IN_EXECUTION") ?? projects.find((p) => plans.has(p.id)) ?? projects[0] ?? null;
  return { projects, plans, focus, focusPlan: focus ? plans.get(focus.id) ?? null : null };
}

export async function myWork(u: AuthUser) {
  const scope = projectScope(u);
  const now = new Date();
  const [assigned, tasks, drafts, notes] = await Promise.all([
    db.project.findMany({ where: { ...scope, status: { notIn: ["CANCELLED", "COMPLETED"] }, OR: [{ members: { some: { userId: u.id } } }, { departments: { some: { departmentId: { in: u.departments.map((d) => d.id) } } } }] }, select: { id: true, name: true, code: true, eventStart: true, status: true }, orderBy: { eventStart: "asc" } }),
    db.task.findMany({ where: { project: scope, status: { not: "COMPLETED" }, OR: [{ assignees: { some: { userId: u.id } } }, { departmentId: { in: u.departments.map((d) => d.id) } }], plannedStart: { lte: new Date(now.getTime() + 21 * 86400000) } }, include: { project: { select: { name: true, id: true } } }, orderBy: { plannedStart: "asc" }, take: 8 }),
    db.departmentSubmission.findMany({ where: { project: scope, OR: [{ submittedById: u.id }, { departmentId: { in: u.departments.map((d) => d.id) } }], status: { in: ["DRAFT", "NEEDS_INFORMATION", "REJECTED"] } }, include: { project: { select: { name: true, id: true } }, department: true }, orderBy: { updatedAt: "desc" }, take: 6 }),
    db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return { assigned, tasks, drafts, notes };
}
