"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { fromLocalInput } from "@/lib/format";
import { generatePlan } from "@/server/services/planning";
import { run } from "./_util";
import { optNonNegative } from "@/lib/validation";

const dateStr = z.string().min(10);
const projectSchema = z.object({
  name: z.string().trim().min(3).max(160),
  client: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  participants: z.coerce.number().int().min(1).max(100000),
  description: z.string().max(4000).optional(),
  location: z.string().trim().min(2).max(120),
  venueId: z.string().optional(),
  newVenueName: z.string().max(160).optional(),
  newVenueCity: z.string().max(80).optional(),
  accessOpens: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  accessCloses: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  powerCapacityKw: optNonNegative(100000, "Power capacity (kW)"),
  eventStart: dateStr, eventEnd: dateStr, setupStart: dateStr, setupEnd: dateStr,
  dismantleStart: z.string().optional(), dismantleEnd: z.string().optional(),
  budgetAmount: optNonNegative(1e12, "Budget"),
  currency: z.string().length(3).default("EGP"),
  projectManagerId: z.string().optional(),
  accountManagerId: z.string().optional(),
  departments: z.array(z.object({ key: z.string(), leadId: z.string().optional(), dueDate: z.string().optional() })).default([]),
  requirements: z.array(z.object({ category: z.string().max(40), title: z.string().min(2).max(300), quantity: optNonNegative(1e7, "Quantity"), unit: z.string().optional() })).default([]),
});

export type ProjectInput = z.input<typeof projectSchema>;

export async function createProjectAction(input: ProjectInput) {
  const res = await run(async () => {
    const u = await requireUser();
    assertCan(u, "project.create");
    const d = projectSchema.parse(input);
    const es = fromLocalInput(d.eventStart), ee = fromLocalInput(d.eventEnd), ss = fromLocalInput(d.setupStart), se = fromLocalInput(d.setupEnd);
    if (ee <= es) throw new Error("Event end must be after event start");
    if (ss >= es) throw new Error("Setup must start before the event");
    if (se > es) throw new Error("Setup must end before the event starts");
    if (se <= ss) throw new Error("Setup end must be after setup start");
    let venueId = d.venueId || null;
    if (venueId) await db.eventVenue.findFirstOrThrow({ where: { id: venueId, companyId: u.companyId } });
    if (!venueId && d.newVenueName) {
      venueId = (await db.eventVenue.create({ data: { companyId: u.companyId, name: d.newVenueName, city: d.newVenueCity || d.location, accessOpens: d.accessOpens || null, accessCloses: d.accessCloses || null, powerCapacityKw: d.powerCapacityKw } })).id;
    }
    const year = String(es.getUTCFullYear()).slice(2), mon = String(es.getUTCMonth() + 1).padStart(2, "0");
    const prefix = d.location.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
    const base = `${prefix}-${year}${mon}`;
    let code = base;
    for (let i = 2; await db.project.findFirst({ where: { companyId: u.companyId, code } }); i++) code = `${base}-${i}`;
    const users = await db.user.findMany({ where: { companyId: u.companyId, id: { in: [d.projectManagerId, d.accountManagerId, ...d.departments.map((x) => x.leadId)].filter(Boolean) as string[] } }, select: { id: true } });
    const valid = new Set(users.map((x) => x.id));
    const depts = await db.department.findMany({ where: { companyId: u.companyId, key: { in: d.departments.map((x) => x.key) } } });
    // P3: two creations racing for the same code — the unique (companyId, code) index decides; retry with the next suffix
    const create = (c: string) => db.project.create({ data: {
      companyId: u.companyId, code: c, name: d.name, client: d.client, category: d.category, participants: d.participants, description: d.description, location: d.location, venueId,
      eventStart: es, eventEnd: ee, setupStart: ss, setupEnd: se, dismantleStart: d.dismantleStart ? fromLocalInput(d.dismantleStart) : null, dismantleEnd: d.dismantleEnd ? fromLocalInput(d.dismantleEnd) : null,
      budgetAmount: d.budgetAmount, currency: d.currency.toUpperCase(),
      ownerId: u.id, projectManagerId: d.projectManagerId && valid.has(d.projectManagerId) ? d.projectManagerId : null, accountManagerId: d.accountManagerId && valid.has(d.accountManagerId) ? d.accountManagerId : u.role === "ACCOUNT_MANAGER" ? u.id : null,
      status: d.departments.length ? "AWAITING_INPUTS" : "PLANNING",
      departments: { create: depts.map((dep) => { const x = d.departments.find((y) => y.key === dep.key)!; return { departmentId: dep.id, leadId: x.leadId && valid.has(x.leadId) ? x.leadId : null, dueDate: x.dueDate ? new Date(`${x.dueDate}T12:00:00Z`) : null }; }) },
      requirements: { create: d.requirements.map((r) => ({ category: r.category, title: r.title, quantity: r.quantity, unit: r.unit || null })) },
      members: { create: [{ userId: u.id, role: "Creator" }] },
    } });
    let p: Awaited<ReturnType<typeof create>> | null = null;
    for (let attempt = 0; !p; attempt++) {
      try { p = await create(code); }
      catch (e) {
        const dup = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002";
        if (!dup || attempt >= 5) throw e;
        code = `${base}-${Math.floor(Math.random() * 900) + 100}`;
      }
    }
    if (d.budgetAmount) await db.projectBudget.create({ data: { projectId: p.id, currency: p.currency, totalBudget: d.budgetAmount } });
    await audit({ companyId: u.companyId, userId: u.id, projectId: p.id, action: "PROJECT_CREATED", entityType: "Project", entityId: p.id, details: { code } });
    if (depts.length) await notify({ departments: depts.map((x) => x.key) }, { companyId: u.companyId, projectId: p.id, type: "MISSING_INPUT", title: `New project ${d.name}: your department's requirements are needed`, link: `/projects/${p.id}/inputs` });
    return { id: p.id };
  });
  if (res.ok && res.data) redirect(`/projects/${(res.data as { id: string }).id}`);
  return res;
}

async function scopedProject(projectId: string) {
  const u = await requireUser();
  const p = await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: projectId } });
  return { u, p };
}

export async function assignDepartmentsAction(projectId: string, departments: { key: string; leadId?: string; dueDate?: string }[]) {
  return run(async () => {
    const { u, p } = await scopedProject(projectId);
    assertCan(u, "project.assign");
    departments = z.array(z.object({ key: z.string().max(40), leadId: z.string().max(40).optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")) })).max(20).parse(departments);
    // leads must be users of THIS company (no cross-tenant references)
    const leadIds = departments.map((d) => d.leadId).filter(Boolean) as string[];
    if (leadIds.length && (await db.user.count({ where: { id: { in: leadIds }, companyId: u.companyId, active: true } })) !== new Set(leadIds).size) throw new Error("Unknown department lead");
    const depts = await db.department.findMany({ where: { companyId: u.companyId, key: { in: departments.map((d) => d.key) } } });
    for (const dep of depts) {
      const x = departments.find((d) => d.key === dep.key)!;
      await db.projectDepartment.upsert({ where: { projectId_departmentId: { projectId, departmentId: dep.id } }, create: { projectId, departmentId: dep.id, leadId: x.leadId || null, dueDate: x.dueDate ? new Date(`${x.dueDate}T12:00:00Z`) : null }, update: { leadId: x.leadId || null, dueDate: x.dueDate ? new Date(`${x.dueDate}T12:00:00Z`) : null } });
    }
    await db.projectDepartment.deleteMany({ where: { projectId, department: { key: { notIn: departments.map((d) => d.key) } }, status: "DRAFT" } });
    if (["LEAD", "PLANNING"].includes(p.status) && depts.length) await db.project.update({ where: { id: projectId }, data: { status: "AWAITING_INPUTS" } });
    await audit({ companyId: u.companyId, userId: u.id, projectId, action: "DEPARTMENTS_ASSIGNED", entityType: "Project", entityId: projectId, details: { departments: departments.map((d) => d.key) } });
    await notify({ departments: depts.map((d) => d.key) }, { companyId: u.companyId, projectId, type: "TASK", title: `You have been assigned to ${p.name}`, link: `/projects/${projectId}/inputs` });
    revalidatePath(`/projects/${projectId}`);
  }, "Departments updated");
}

export async function updateProjectStatusAction(projectId: string, status: string) {
  return run(async () => {
    const { u, p } = await scopedProject(projectId);
    assertCan(u, "project.edit");
    const allowed: Record<string, string[]> = { LEAD: ["PLANNING", "CANCELLED"], PLANNING: ["AWAITING_INPUTS", "CANCELLED"], AWAITING_INPUTS: ["PLANNING", "CANCELLED"], UNDER_REVIEW: ["PLANNING", "CANCELLED"], APPROVED: ["IN_PREPARATION", "CANCELLED"], IN_PREPARATION: ["IN_EXECUTION"], IN_EXECUTION: ["COMPLETED"] };
    if (!allowed[p.status]?.includes(status)) throw new Error(`Status cannot change from ${p.status} to ${status}${status === "APPROVED" ? " — approve the master plan in the Approval Center" : ""}`);
    await db.project.update({ where: { id: projectId }, data: { status: status as never } });
    await audit({ companyId: u.companyId, userId: u.id, projectId, action: "STATUS_CHANGED", entityType: "Project", entityId: projectId, details: { from: p.status, to: status } });
    revalidatePath(`/projects/${projectId}`);
  }, "Project status updated");
}

export async function generatePlanAction(projectId: string) {
  return run(async () => {
    const { u } = await scopedProject(projectId);
    assertCan(u, "plan.generate");
    const r = await generatePlan({ companyId: u.companyId, userId: u.id }, projectId);
    revalidatePath(`/projects/${projectId}`, "layout");
    return { version: r.version, errors: r.plan.readiness.errors, warnings: r.plan.readiness.warnings, feasible: r.plan.readiness.feasible };
  }, "Plan generated");
}

/** Read-only roles (Viewer) cannot write; any contributing permission can comment. */
const COMMENT_PERMISSIONS = ["project.edit", "submission.create", "plan.review", "budget.approve", "procurement.manage", "execution.update"] as const;

export async function addCommentAction(projectId: string, body: string) {
  return run(async () => {
    const { u } = await scopedProject(projectId);
    if (!COMMENT_PERMISSIONS.some((p) => u.permissions.has(p))) throw new Error("Your role is read-only — you cannot comment");
    const text = z.string().trim().min(1).max(2000).parse(body);
    await db.comment.create({ data: { projectId, userId: u.id, body: text } });
    revalidatePath(`/projects/${projectId}/activity`);
  }, "Comment added");
}
