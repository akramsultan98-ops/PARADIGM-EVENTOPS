import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { db, num } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { canReadFinancials, planForUser, redactImpact } from "@/lib/financial";
import type { PlanResult } from "@/engines/pipeline";
import { applyScenario, parseWhatIf } from "@/engines/whatif";
import { compareImpact } from "@/engines/impact";
import { runPlanningPipeline } from "@/engines/pipeline";
import { buildSnapshot } from "@/server/services/snapshot";
import { getProvider, FALLBACK_BETA, MODEL } from "./provider";

/**
 * AI Project Orchestrator (spec §16).
 * A central assistant with TYPED TOOLS over deterministic services. The model never computes
 * quantities itself — every number it reports comes from a tool result (calculation engines /
 * database). Without an API key, a deterministic intent router answers from the same tools.
 */

export interface AssistantTurn { role: "user" | "assistant"; content: string }
export interface AssistantReply { text: string; engine: "AI" | "RULE_BASED"; toolsUsed: string[]; sources: string[] }

type ToolResult = Record<string, unknown> | string;

async function loadPlan(projectId: string): Promise<{ plan: PlanResult; version: number; status: string } | null> {
  const v = await db.scheduleVersion.findFirst({ where: { projectId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" } });
  return v ? { plan: v.snapshot as unknown as PlanResult, version: v.version, status: v.status } : null;
}

function toolsFor(u: AuthUser) {
  const scope = projectScope(u);
  const fin = canReadFinancials(u);
  // every plan the assistant can see is redacted for users without budget.read (P1-2)
  const loadPlanFor = async (projectId: string) => { const r = await loadPlan(projectId); return r ? { ...r, plan: planForUser(u, r.plan) } : null; };
  const project = (id: string) => db.project.findFirst({ where: { ...scope, id }, include: { departments: { include: { department: true } }, venue: true } });
  const impl: Record<string, (a: Record<string, unknown>) => Promise<ToolResult>> = {
    list_projects: async () => {
      const ps = await db.project.findMany({ where: { ...scope, status: { notIn: ["CANCELLED"] } }, select: { id: true, code: true, name: true, status: true, eventStart: true, location: true }, orderBy: { eventStart: "asc" } });
      return { projects: ps.map((p) => ({ ...p, eventStart: p.eventStart.toISOString() })) };
    },
    get_project_overview: async (a) => {
      const p = await project(String(a.projectId));
      if (!p) return "Project not found or not accessible";
      const pl = await loadPlanFor(p.id);
      return {
        name: p.name, code: p.code, client: p.client, status: p.status, participants: p.participants, location: p.location, venue: p.venue?.name ?? null,
        setupStart: p.setupStart.toISOString(), eventStart: p.eventStart.toISOString(), eventEnd: p.eventEnd.toISOString(), ...(fin ? { budget: num(p.budgetAmount), currency: p.currency } : {}),
        departments: p.departments.map((d) => ({ department: d.department.name, status: d.status, due: d.dueDate?.toISOString().slice(0, 10) ?? null })),
        plan: pl ? { version: pl.version, status: pl.status, errors: pl.plan.readiness.errors, warnings: pl.plan.readiness.warnings, feasible: pl.plan.readiness.feasible, tasks: pl.plan.tasks.length } : "No plan generated yet",
      };
    },
    list_open_issues: async (a) => {
      const pl = await loadPlanFor(String(a.projectId));
      if (!pl || !(await project(String(a.projectId)))) return "No plan generated yet for this project";
      const dept = a.department ? String(a.department).toUpperCase() : null;
      return { issues: pl.plan.issues.filter((i) => i.severity !== "info" && (!dept || i.department === dept)).slice(0, 40).map((i) => ({ severity: i.severity, department: i.department, message: i.message, question: i.question ?? null })) };
    },
    get_plan_section: async (a) => {
      if (!(await project(String(a.projectId)))) return "Project not found";
      const pl = await loadPlanFor(String(a.projectId));
      if (!pl) return "No plan generated yet";
      const P = pl.plan;
      switch (String(a.section)) {
        case "boq": return { boq: P.production.boq.map((b) => ({ code: b.code, name: b.name, purchase: b.purchaseQuantity, unit: b.unit, state: b.state, method: b.method })) };
        case "manpower": return { trades: P.trades.map((t) => ({ trade: t.name, phase: t.phase, hours: t.totalHours, crew: t.requiredCrew, available: t.available, shortfall: t.shortfall })), missingRates: P.laborDemands.filter((d) => d.hours == null).map((d) => d.key) };
        case "av": return { lines: P.av.lines.map((l) => ({ description: l.description, required: l.required, backup: l.backup, allocated: l.allocated, rental: l.rental })), powerKw: P.av.totalPowerKw, techHours: P.av.techHours };
        case "transport": return { trips: P.logistics.trips.map((t) => ({ vehicle: t.vehicleCode, kg: t.weightKg, m3: t.volumeM3 })), backup: P.logistics.backupVehicle?.code ?? null, route: P.logistics.route, unassigned: P.logistics.unassigned };
        case "accommodation": return { rooms: P.accommodation.roomCount, roomNights: P.accommodation.roomNights, unconfirmed: P.accommodation.unconfirmed, costByCurrency: P.accommodation.costByCurrency };
        case "budget": if (!fin) return "Budget and cost information requires the budget.read permission."; return { byCurrency: P.budget.byCurrency.map((c) => ({ currency: c.currency, total: c.total })), budget: P.budget.budgetAmount, totalInBudgetCurrency: P.budget.totalInBudgetCurrency, variance: P.budget.variance, conversions: P.budget.conversions };
        case "schedule": return { makespanHours: P.schedule.makespanHours, feasible: P.schedule.feasible, critical: P.tasks.filter((t) => t.critical).map((t) => ({ task: t.name, start: t.start ? new Date(t.start).toISOString() : null })), conflicts: P.schedule.conflicts.filter((c) => c.severity === "error").map((c) => c.message) };
        case "risks": return { risks: P.risks.map((r) => ({ code: r.code, title: r.title, level: r.level, severity: r.severity, contingency: r.contingency })) };
        default: return "Unknown section";
      }
    },
    run_what_if: async (a) => {
      if (!u.permissions.has("plan.review")) return "Running scenarios requires the plan.review permission.";
      const p = await project(String(a.projectId));
      if (!p) return "Project not found";
      const snap = await buildSnapshot(u.companyId, p.id, new Date());
      const base = runPlanningPipeline(snap);
      const assumptions = parseWhatIf(String(a.question));
      if (assumptions.vehiclesUnavailable?.includes("__MAIN__")) assumptions.vehiclesUnavailable = [...base.logistics.trips].sort((x, y) => y.weightKg - x.weightKg).slice(0, 1).map((t) => t.vehicleCode);
      if (!Object.keys(assumptions).length) return "The scenario could not be parsed into supported assumptions (setup days, vehicle breakdown, delivery/travel delay, participants, budget %, price %, event date shift).";
      const { snapshot, notes } = applyScenario(snap, assumptions);
      const impact = fin ? compareImpact(base, runPlanningPipeline(snapshot)) : redactImpact(compareImpact(base, runPlanningPipeline(snapshot)));
      return { assumptions, notes, summary: impact.summary, domains: impact.domains.filter((d) => d.changed).map((d) => ({ domain: d.domain, deltas: d.deltas, notes: d.notes })), newIssues: impact.newIssues.slice(0, 10), approvalsRequired: impact.approvalsRequired, note: "Simulation only — the approved plan was not changed." };
    },
  };
  const defs: Anthropic.Beta.BetaTool[] = [
    { name: "list_projects", description: "List projects the current user can access (id, code, name, status, event date).", input_schema: { type: "object", properties: {}, additionalProperties: false }, strict: true },
    { name: "get_project_overview", description: "Project details, department submission status and latest plan readiness.", input_schema: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"], additionalProperties: false }, strict: true },
    { name: "list_open_issues", description: "Open validation errors, warnings and missing-information questions from the latest calculated plan, optionally filtered by department key (PRODUCTION, AV, LOGISTICS, ACCOMMODATION, CREATIVE, PROCUREMENT, FINANCE, PMO).", input_schema: { type: "object", properties: { projectId: { type: "string" }, department: { type: "string" } }, required: ["projectId"], additionalProperties: false } },
    { name: "get_plan_section", description: "Calculated plan data from the deterministic engines. section ∈ boq | manpower | av | transport | accommodation | budget | schedule | risks.", input_schema: { type: "object", properties: { projectId: { type: "string" }, section: { type: "string", enum: ["boq", "manpower", "av", "transport", "accommodation", "budget", "schedule", "risks"] } }, required: ["projectId", "section"], additionalProperties: false }, strict: true },
    { name: "run_what_if", description: "Run a what-if simulation on a copy of the plan (never changes the approved plan). Pass the user's scenario question in plain language.", input_schema: { type: "object", properties: { projectId: { type: "string" }, question: { type: "string" } }, required: ["projectId", "question"], additionalProperties: false }, strict: true },
  ];
  return { impl, defs };
}

const SYSTEM = (u: AuthUser, projectId: string | null) => `You are the PARADIGM EVENTOPS project orchestrator for Paradigm LTD (event operations, Egypt, currency EGP, timezone Africa/Cairo).
Current user: ${u.name}, role ${u.roleName}${u.departments[0] ? `, department ${u.departments[0].name}` : ""}.${projectId ? `\nCurrent project id: ${projectId}` : ""}
Rules:
- Every number you state must come from a tool result. Never estimate, compute new quantities or invent missing data; if information is missing, say so and name the department that must provide it.
- Quantities come from deterministic engines; you explain and coordinate, you do not replace them.
- Distinguish CALCULATED, ESTIMATED and NEEDS_INFORMATION values. A calculation is not an engineering approval.
- What-if results are simulations; never claim the approved plan changed.
- Be concise and operational: bullets, owners, next actions. Answer in the user's language (English or Arabic).`;

export async function assistantRespond(u: AuthUser, projectId: string | null, history: AssistantTurn[], message: string): Promise<AssistantReply> {
  const provider = getProvider();
  const { impl, defs } = toolsFor(u);
  if (!provider) return ruleBased(u, projectId, message, impl);
  const toolsUsed: string[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history.slice(-10).map((h) => ({ role: h.role, content: h.content }) as Anthropic.Beta.BetaMessageParam), { role: "user", content: message }];
  try {
    for (let i = 0; i < 6; i++) {
      const res = await provider.client().beta.messages.create({ model: MODEL(), max_tokens: 16000, betas: [FALLBACK_BETA], fallbacks: "default", output_config: { effort: "medium" }, system: SYSTEM(u, projectId), tools: defs, messages });
      if (res.stop_reason === "refusal") return { text: "The AI provider declined this request. Please rephrase, or use the planning pages directly.", engine: "AI", toolsUsed, sources: [] };
      messages.push({ role: "assistant", content: res.content });
      const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !calls.length) {
        const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
        return { text: text || "(no answer)", engine: "AI", toolsUsed, sources: toolsUsed.map((t) => `tool:${t}`) };
      }
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const c of calls) {
        toolsUsed.push(c.name);
        const fn = impl[c.name];
        try {
          const out = fn ? await fn((c.input ?? {}) as Record<string, unknown>) : `Unknown tool ${c.name}`;
          results.push({ type: "tool_result", tool_use_id: c.id, content: typeof out === "string" ? out : JSON.stringify(out).slice(0, 60000) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: c.id, content: e instanceof Error ? e.message : "Tool failed", is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return { text: "I could not complete this request within the tool-call limit. Please narrow the question.", engine: "AI", toolsUsed, sources: [] };
  } catch (e) {
    const fallback = await ruleBased(u, projectId, message, impl);
    return { ...fallback, text: `⚠ AI provider unavailable (${e instanceof Error ? e.message.slice(0, 120) : "error"}). Rule-based answer:\n\n${fallback.text}` };
  }
}

/** Deterministic intent router — answers strictly from the same tools. */
async function ruleBased(u: AuthUser, projectId: string | null, message: string, impl: Record<string, (a: Record<string, unknown>) => Promise<ToolResult>>): Promise<AssistantReply> {
  const m = message.toLowerCase();
  const used: string[] = [];
  const call = async (name: string, a: Record<string, unknown>) => { used.push(name); return impl[name](a); };
  const header = "_Rule-based assistant (no AI provider configured). Answers come directly from the calculation engines._\n\n";
  if (!projectId) {
    const r = (await call("list_projects", {})) as { projects: { name: string; code: string; status: string; eventStart: string }[] };
    return { text: `${header}Select a project to ask about it. Your projects:\n${r.projects.map((p) => `- **${p.name}** (${p.code}) — ${p.status.toLowerCase().replace(/_/g, " ")}, event ${p.eventStart.slice(0, 10)}`).join("\n")}`, engine: "RULE_BASED", toolsUsed: used, sources: ["projects"] };
  }
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
  if (/what if|what happens if|simulate|ماذا لو/.test(m)) {
    const r = await call("run_what_if", { projectId, question: message });
    if (typeof r === "string") return { text: header + r, engine: "RULE_BASED", toolsUsed: used, sources: [] };
    const x = r as { notes: string[]; summary: string; domains: { domain: string; deltas: { label: string; before: unknown; after: unknown; unit?: string }[]; notes: string[] }[]; newIssues: string[]; approvalsRequired: string[] };
    return { text: `${header}**Scenario:** ${x.notes.join("; ")}\n\n**Impact:** ${x.summary}\n\n${x.domains.map((d) => `**${d.domain}**\n${d.deltas.map((dl) => `- ${dl.label}: ${dl.before ?? "—"} → ${dl.after ?? "—"} ${dl.unit ?? ""}`).join("\n")}${d.notes.length ? `\n- ${d.notes.join("\n- ")}` : ""}`).join("\n\n")}\n\n${x.newIssues.length ? `**New issues:**\n- ${x.newIssues.slice(0, 8).join("\n- ")}\n\n` : ""}Approvals required: ${x.approvalsRequired.join(", ")}.\n\n_Simulation only — the approved plan was not changed._`, engine: "RULE_BASED", toolsUsed: used, sources: ["planning engines (scenario)"] };
  }
  const section = /boq|material|board|mdf|plywood|timber|paint|مواد/.test(m) ? "boq" : /crew|manpower|labou?r|carpenter|technician|عمال/.test(m) ? "manpower" : /led|av\b|sound|light|microphone|power|equipment/.test(m) ? "av" : /truck|vehicle|transport|logistic|cargo|نقل/.test(m) ? "transport" : /hotel|room|accommodation|إقامة/.test(m) ? "accommodation" : /budget|cost|price|money|ميزانية|تكلفة/.test(m) ? "budget" : /schedule|critical|timeline|gantt|deadline|جدول/.test(m) ? "schedule" : /risk|contingency|plan b|مخاطر/.test(m) ? "risks" : null;
  if (/missing|need|question|block|issue|ناقص/.test(m) && !section) {
    const r = await call("list_open_issues", { projectId });
    if (typeof r === "string") return { text: header + r, engine: "RULE_BASED", toolsUsed: used, sources: [] };
    const issues = (r as { issues: { severity: string; department: string; message: string; question: string | null }[] }).issues;
    return { text: `${header}**${issues.length} open item(s)** in the latest plan:\n${issues.slice(0, 15).map((i) => `- ${i.severity === "error" ? "🔴" : "🟠"} **${i.department}** — ${i.message}${i.question ? `\n  ↳ _${i.question}_` : ""}`).join("\n")}`, engine: "RULE_BASED", toolsUsed: used, sources: ["plan.issues"] };
  }
  if (section) {
    const r = await call("get_plan_section", { projectId, section });
    if (typeof r === "string") return { text: header + r, engine: "RULE_BASED", toolsUsed: used, sources: [] };
    const d = r as Record<string, unknown>;
    let text = "";
    if (section === "boq") text = `**Material BOQ (from cutting optimisation & engines):**\n${(d.boq as { code: string; name: string; purchase: number; unit: string; state: string }[]).map((b) => `- ${b.name}: **${fmt(b.purchase)} ${b.unit}** _(${b.state.toLowerCase()})_`).join("\n")}`;
    if (section === "manpower") text = `**Crew requirement:**\n${(d.trades as { trade: string; phase: string; hours: number; crew: number; available: number; shortfall: number }[]).map((t) => `- ${t.trade} (${t.phase.toLowerCase()}): ${fmt(t.hours)} h → **${t.crew} crew** (available ${t.available}${t.shortfall ? `, ⚠ short ${t.shortfall}` : ""})`).join("\n")}${(d.missingRates as string[]).length ? `\n\n⚠ Missing productivity rates: ${(d.missingRates as string[]).join(", ")}` : ""}`;
    if (section === "av") text = `**AV:** total load **${d.powerKw} kW**, ${d.techHours} technician-hours.\n${(d.lines as { description: string; required: number; backup: number; allocated: number; rental: number }[]).map((l) => `- ${l.description}: ${l.required}+${l.backup} backup → ${l.allocated} from stock${l.rental ? `, **${l.rental} rental**` : ""}`).join("\n")}`;
    if (section === "transport") text = `**Fleet:** ${(d.trips as { vehicle: string; kg: number; m3: number }[]).map((t) => `${t.vehicle} (${fmt(t.kg)} kg, ${t.m3} m³)`).join(", ") || "none"}. Backup: ${d.backup ?? "none"}.${(d.unassigned as unknown[]).length ? `\n⚠ ${(d.unassigned as { name: string; reason: string }[]).map((x) => `${x.name}: ${x.reason}`).join("; ")}` : ""}`;
    if (section === "accommodation") text = `**Accommodation:** ${d.rooms} rooms, ${d.roomNights} room nights, ${d.unconfirmed} unconfirmed booking(s). Cost: ${Object.entries(d.costByCurrency as Record<string, number>).map(([c, v]) => `${fmt(v)} ${c}`).join(", ")}.`;
    if (section === "budget") text = `**Planned cost:** ${(d.byCurrency as { currency: string; total: number }[]).map((c) => `${fmt(c.total)} ${c.currency}`).join(" + ")} (currencies kept separate).\nBudget ${d.budget != null ? fmt(d.budget as number) : "—"}; in budget currency ${d.totalInBudgetCurrency != null ? fmt(d.totalInBudgetCurrency as number) : "not computable"}; variance ${d.variance != null ? fmt(d.variance as number) : "—"}.`;
    if (section === "schedule") text = `**Schedule:** ${d.feasible ? "feasible" : "⚠ conflicts"} · makespan ${d.makespanHours} h.\nCritical path:\n${(d.critical as { task: string; start: string | null }[]).map((c) => `- ${c.task} (${c.start?.slice(0, 16).replace("T", " ") ?? "—"} UTC)`).join("\n")}${(d.conflicts as string[]).length ? `\n\nConflicts:\n- ${(d.conflicts as string[]).join("\n- ")}` : ""}`;
    if (section === "risks") text = `**Risks:**\n${(d.risks as { code: string; title: string; level: string; contingency: string }[]).map((r) => `- ${r.code} **${r.level}** ${r.title} — Plan B: ${r.contingency}`).join("\n")}`;
    return { text: header + text, engine: "RULE_BASED", toolsUsed: used, sources: [`plan.${section}`] };
  }
  const o = await call("get_project_overview", { projectId });
  if (typeof o === "string") return { text: header + o, engine: "RULE_BASED", toolsUsed: used, sources: [] };
  const ov = o as { name: string; status: string; departments: { department: string; status: string; due: string | null }[]; plan: { version: number; status: string; errors: number; warnings: number; feasible: boolean } | string };
  return { text: `${header}**${ov.name}** — ${ov.status.toLowerCase().replace(/_/g, " ")}\n\nDepartments:\n${ov.departments.map((d) => `- ${d.department}: ${d.status.toLowerCase().replace(/_/g, " ")}${d.due ? ` (due ${d.due})` : ""}`).join("\n")}\n\nPlan: ${typeof ov.plan === "string" ? ov.plan : `v${ov.plan.version} (${ov.plan.status.toLowerCase()}), ${ov.plan.errors} errors, ${ov.plan.warnings} warnings, ${ov.plan.feasible ? "feasible" : "not yet feasible"}`}.\n\nTry: “what is missing?”, “show the BOQ”, “crew requirement”, “what if the main truck breaks down?”`, engine: "RULE_BASED", toolsUsed: used, sources: ["project", "plan"] };
}
