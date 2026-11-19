import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function audit(e: { companyId: string; userId?: string | null; projectId?: string | null; action: string; entityType: string; entityId?: string | null; details?: Prisma.InputJsonValue }) {
  let ip: string | null = null;
  try { ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null; } catch { /* outside request */ }
  await db.auditLog.create({ data: { companyId: e.companyId, userId: e.userId ?? null, projectId: e.projectId ?? null, action: e.action, entityType: e.entityType, entityId: e.entityId ?? null, details: e.details, ip } });
}
