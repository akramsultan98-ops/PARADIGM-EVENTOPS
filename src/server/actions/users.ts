"use server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/token";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { run } from "./_util";

const userSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), roleKey: z.string(), departmentKey: z.string().optional(), jobTitle: z.string().max(120).optional() });

export async function createUserAction(input: z.input<typeof userSchema>) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "users.manage");
    const d = userSchema.parse(input);
    const role = await db.role.findFirstOrThrow({ where: { companyId: u.companyId, key: d.roleKey } });
    if (d.roleKey === "SUPER_ADMIN" && u.role !== "SUPER_ADMIN") throw new Error("Only a Super Admin can create Super Admins");
    if (await db.user.findUnique({ where: { email: d.email } })) throw new Error("A user with this email already exists");
    const dep = d.departmentKey ? await db.department.findFirst({ where: { companyId: u.companyId, key: d.departmentKey } }) : null;
    const temp = randomBytes(9).toString("base64url");
    const nu = await db.user.create({ data: { companyId: u.companyId, name: d.name, email: d.email, roleId: role.id, jobTitle: d.jobTitle, passwordHash: await hashPassword(temp), memberships: dep ? { create: { departmentId: dep.id, isManager: d.roleKey.endsWith("_MANAGER") } } : undefined } });
    await audit({ companyId: u.companyId, userId: u.id, action: "USER_CREATED", entityType: "User", entityId: nu.id, details: { email: d.email, role: d.roleKey } });
    revalidatePath("/users");
    return { temporaryPassword: temp };
  }, "User created — share the temporary password securely");
}

export async function updateUserRoleAction(userId: string, roleKey: string, active: boolean) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "users.manage");
    const target = await db.user.findFirstOrThrow({ where: { id: userId, companyId: u.companyId }, include: { role: true } });
    if (target.id === u.id && (!active || roleKey !== target.role.key)) throw new Error("You cannot change your own role or deactivate yourself");
    if ((roleKey === "SUPER_ADMIN" || target.role.key === "SUPER_ADMIN") && u.role !== "SUPER_ADMIN") throw new Error("Only a Super Admin can change Super Admin accounts");
    const role = await db.role.findFirstOrThrow({ where: { companyId: u.companyId, key: roleKey } });
    // bump sessionVersion so existing sessions are revoked immediately
    await db.user.update({ where: { id: userId }, data: { roleId: role.id, active, sessionVersion: { increment: 1 } } });
    await audit({ companyId: u.companyId, userId: u.id, action: "USER_UPDATED", entityType: "User", entityId: userId, details: { from: target.role.key, to: roleKey, active } });
    revalidatePath("/users");
  }, "User updated — existing sessions revoked");
}

export async function changePasswordAction(current: string, next: string) {
  return run(async () => {
    const u = await requireUser();
    const pw = z.string().min(10, "Use at least 10 characters").max(200).regex(/[A-Za-z]/).regex(/[0-9]/, "Include at least one number").parse(next);
    if (!rateLimit(`pwchange:${u.id}`, 5, 15 * 60_000)) throw new Error("Too many attempts — try again in a few minutes");
    const me = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await verifyPassword(current, me.passwordHash))) throw new Error("Current password is incorrect");
    // P3: a password change revokes every other session (session version bump); this session gets a fresh cookie
    const updated = await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(pw), sessionVersion: { increment: 1 } } });
    const token = await signSession({ uid: updated.id, cid: updated.companyId, sv: updated.sessionVersion });
    (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"), path: "/", maxAge: SESSION_TTL_SECONDS });
    await audit({ companyId: u.companyId, userId: u.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: u.id });
  }, "Password changed — all other sessions were signed out");
}
