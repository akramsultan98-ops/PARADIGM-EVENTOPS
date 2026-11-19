import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { PlanResult } from "@/engines/pipeline";

/** Latest non-superseded plan per project (cached per request). */
export const getLatestPlans = cache(async (projectIds: string[]) => {
  if (!projectIds.length) return new Map<string, { versionId: string; version: number; status: string; createdAt: Date; plan: PlanResult }>();
  const versions = await db.scheduleVersion.findMany({ where: { projectId: { in: projectIds }, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } });
  const out = new Map<string, { versionId: string; version: number; status: string; createdAt: Date; plan: PlanResult }>();
  for (const v of versions) if (!out.has(v.projectId)) out.set(v.projectId, { versionId: v.id, version: v.version, status: v.status, createdAt: v.createdAt, plan: v.snapshot as unknown as PlanResult });
  return out;
});

export const getPlan = cache(async (projectId: string) => (await getLatestPlans([projectId])).get(projectId) ?? null);

export const getApprovedPlan = cache(async (projectId: string) => {
  const v = await db.scheduleVersion.findFirst({ where: { projectId, status: "APPROVED" }, orderBy: { version: "desc" } });
  return v ? { versionId: v.id, version: v.version, approvedAt: v.approvedAt, plan: v.snapshot as unknown as PlanResult } : null;
});
