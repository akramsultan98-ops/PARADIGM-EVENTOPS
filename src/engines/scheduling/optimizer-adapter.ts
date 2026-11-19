/**
 * Adapter to the optional OR-Tools CP-SAT service (services/optimizer).
 * The built-in calendar-aware CPM + SGS scheduler remains the system of record; this adapter
 * provides an optimisation cross-check on the same task network expressed in working minutes.
 * Calendar gaps are not modelled by the service — results are compared, never auto-applied.
 */
import type { PlanResult } from "../pipeline";

export interface OptimizerResponse { status: string; starts: Record<string, number>; finishes: Record<string, number>; lateness: Record<string, number>; makespan: number | null }

export function toOptimizerRequest(plan: PlanResult, capacities: Record<string, number>) {
  const anchor = Math.min(...plan.tasks.map((t) => t.start ?? Infinity).filter(Number.isFinite));
  const min = (ms: number | null) => (ms == null ? 0 : Math.max(0, Math.round((ms - anchor) / 60000)));
  return {
    anchor,
    body: {
      tasks: plan.tasks.map((t) => ({ id: t.key, duration: Math.round(t.durationHours * 60), release: t.isMilestone && t.start != null ? min(t.start) : 0, deadline: t.deadline != null ? min(t.deadline) : null, resource: t.laborKey, units: t.crewSize ?? 0, fixedStart: t.key.startsWith("EVENT:") && t.start != null ? min(t.start) : null })),
      dependencies: plan.dependencies.map((d) => ({ from: d.from, to: d.to, type: d.type, lag: Math.round(d.lagHours * 60) })),
      capacities,
      timeLimitSeconds: 10,
    },
  };
}

export async function callOptimizer(url: string, body: unknown, timeoutMs = 20000): Promise<OptimizerResponse> {
  const res = await fetch(`${url.replace(/\/$/, "")}/schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Optimizer returned ${res.status}`);
  return res.json() as Promise<OptimizerResponse>;
}
