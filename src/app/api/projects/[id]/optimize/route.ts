import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getPlan } from "@/server/queries/plans";
import { callOptimizer, toOptimizerRequest } from "@/engines/scheduling/optimizer-adapter";

/** Optional OR-Tools cross-check of the latest plan. Returns 501 when the service is not configured. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!u.permissions.has("plan.review")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = process.env.OPTIMIZER_URL;
  if (!url) return NextResponse.json({ error: "OPTIMIZER_URL is not configured — the built-in CPM/SGS scheduler is in use" }, { status: 501 });
  const { id } = await params;
  if (!(await db.project.findFirst({ where: { ...projectScope(u), id } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: "No plan" }, { status: 409 });
  const caps = Object.fromEntries((await db.laborCategory.findMany({ where: { companyId: u.companyId } })).map((c) => [c.key, c.headcountAvailable]));
  const { body } = toOptimizerRequest(plan.plan, caps);
  try {
    const r = await callOptimizer(url, body);
    return NextResponse.json({ builtIn: { makespanHours: plan.plan.schedule.makespanHours, conflicts: plan.plan.schedule.conflicts.length }, optimizer: { status: r.status, makespanHours: r.makespan != null ? r.makespan / 60 : null, latenessMinutes: r.lateness }, note: "Optimizer works in continuous working minutes (no calendar gaps); results are advisory and never applied automatically." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Optimizer unavailable" }, { status: 502 });
  }
}
