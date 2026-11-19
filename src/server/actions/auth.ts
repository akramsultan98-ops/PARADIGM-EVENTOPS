"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/token";
import { getCurrentUser } from "@/lib/auth/session";
import { LOCALE_COOKIE } from "@/i18n/server";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), next: z.string().optional() });

export async function loginAction(_: unknown, form: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse({ email: String(form.get("email") ?? "").trim().toLowerCase(), password: form.get("password"), next: form.get("next") ?? undefined });
  if (!parsed.success) return { error: "invalid" };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`login:${ip}:${parsed.data.email}`, 8, 10 * 60_000)) return { error: "Too many attempts — try again in a few minutes" };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = user && user.active && !user.deletedAt && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!ok || !user) {
    if (user) await db.auditLog.create({ data: { companyId: user.companyId, userId: user.id, action: "LOGIN_FAILED", entityType: "User", entityId: user.id, ip } });
    return { error: "invalid" };
  }
  if (user.isDemo && process.env.ENABLE_DEMO_LOGIN !== "true") return { error: "Demo accounts are disabled in this environment" };
  const token = await signSession({ uid: user.id, cid: user.companyId, sv: user.sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"), path: "/", maxAge: SESSION_TTL_SECONDS });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({ data: { companyId: user.companyId, userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id, ip } });
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/dashboard";
  redirect(next);
}

export async function logoutAction() {
  const u = await getCurrentUser();
  if (u) await db.auditLog.create({ data: { companyId: u.companyId, userId: u.id, action: "LOGOUT", entityType: "User", entityId: u.id } });
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function setLocaleAction(locale: "en" | "ar") {
  (await cookies()).set(LOCALE_COOKIE, locale === "ar" ? "ar" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const u = await getCurrentUser();
  if (u) await db.user.update({ where: { id: u.id }, data: { locale } });
}
