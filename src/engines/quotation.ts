/**
 * Quotation draft engine (Akram Brain — APPLY step for commercial rules).
 * Pure and deterministic: the margin and quote currency come ONLY from approved memories passed in;
 * nothing is assumed. Money is computed in integer minor units (cents / piastres) to avoid float drift.
 * The output is always a DRAFT — issuing a final quotation is a separate, approved human action.
 */
import type { RankedMemory, Currency } from "@/brain/types";
import { ENGINE_VERSION, hashInputs, type CalcTrace, type Issue } from "./trace";

export interface CostLine { description: string; qty: number; unitCost: number; currency: Currency }
export interface FxRate { from: Currency; to: Currency; rate: number; source: string }

export interface Influence { memoryId: string; version: number; title: string; evidence: string; effect: string }

export interface QuotationDraft {
  status: "DRAFT" | "NEEDS_INFORMATION" | "NEEDS_VALIDATION";
  currency: Currency | null;
  marginPercent: number | null;
  lines: { description: string; qty: number; unitCost: number; costMinor: number; priceMinor: number }[];
  totals: { costMinor: number; priceMinor: number; marginMinor: number } | null;
  issues: Issue[];
  influences: Influence[];
  trace: CalcTrace;
}

type RuleType = "margin_percent" | "quote_currency";

/** the most specific applicable rule of a type; equal specificity with different values = needs a person */
function pick(ranked: RankedMemory[], type: RuleType): { chosen: RankedMemory | null; tie: RankedMemory[] } {
  const cands = ranked.filter((r) => r.memory.rule?.type === type);
  if (!cands.length) return { chosen: null, tie: [] };
  const best = Math.max(...cands.map((c) => c.specificity));
  const top = cands.filter((c) => c.specificity === best);
  const values = new Set(top.map((c) => String(c.memory.rule!.value)));
  return values.size > 1 ? { chosen: null, tie: top } : { chosen: top[0], tie: [] };
}

const minor = (v: number) => Math.round(v * 100);

export function draftQuotation(input: { lines: CostLine[]; memories: RankedMemory[]; fx?: FxRate | null }): QuotationDraft {
  const issues: Issue[] = [];
  const influences: Influence[] = [];
  const assumptions: string[] = [];

  const margin = pick(input.memories, "margin_percent");
  const curr = pick(input.memories, "quote_currency");
  for (const [type, p] of [["margin", margin], ["currency", curr]] as const) {
    if (p.tie.length) issues.push({ severity: "error", code: "CONFLICTING_MEMORIES", message: `Approved ${type} rules disagree: ${p.tie.map((t) => `"${t.memory.title}" (${t.memory.id} v${t.memory.version})`).join(" vs ")}`, question: `Which ${type} rule is valid for this client? Revoke or correct the other one.` });
  }
  if (!margin.chosen && !margin.tie.length) issues.push({ severity: "error", code: "NO_APPROVED_MARGIN", message: "No approved margin rule applies to this client", question: "What margin should be applied? Teach it as a rule and approve it." });

  const lineCurrencies = [...new Set(input.lines.map((l) => l.currency))];
  if (lineCurrencies.length > 1) issues.push({ severity: "error", code: "MIXED_CURRENCIES", message: `Cost lines use several currencies (${lineCurrencies.join(", ")}) — they are never summed`, question: "Provide all costs in one currency or an approved exchange rate per pair." });
  for (const l of input.lines) if (!(l.qty > 0) || !(l.unitCost >= 0)) issues.push({ severity: "error", code: "INVALID_LINE", message: `Invalid quantity or unit cost on "${l.description}"` });

  const costCurrency = lineCurrencies[0] ?? null;
  let target: Currency | null = (curr.chosen?.memory.rule?.value as Currency | undefined) ?? costCurrency;
  if (!curr.chosen) assumptions.push(`No approved currency rule applies — quoted in the cost currency (${costCurrency ?? "n/a"})`);
  let fxRate = 1;
  if (costCurrency && target && target !== costCurrency) {
    if (input.fx && input.fx.from === costCurrency && input.fx.to === target && input.fx.rate > 0) {
      fxRate = input.fx.rate;
      assumptions.push(`FX ${costCurrency}→${target} ${input.fx.rate} (${input.fx.source})`);
    } else {
      issues.push({ severity: "error", code: "FX_REQUIRED", message: `Costs are in ${costCurrency} but the approved rule quotes in ${target}`, question: `Provide an approved ${costCurrency}→${target} exchange rate and its source.` });
      target = null;
    }
  }

  const blocking = issues.some((i) => i.severity === "error");
  const m = margin.chosen?.memory.rule?.value as number | undefined;
  let lines: QuotationDraft["lines"] = [];
  let totals: QuotationDraft["totals"] = null;
  if (!blocking && m !== undefined && target) {
    const bp = Math.round(m * 100); // basis points
    lines = input.lines.map((l) => {
      const costMinor = minor(l.qty * l.unitCost * fxRate);
      return { description: l.description, qty: l.qty, unitCost: l.unitCost, costMinor, priceMinor: Math.round((costMinor * (10000 + bp)) / 10000) };
    });
    const costMinor = lines.reduce((s, l) => s + l.costMinor, 0);
    const priceMinor = lines.reduce((s, l) => s + l.priceMinor, 0);
    totals = { costMinor, priceMinor, marginMinor: priceMinor - costMinor };
  }
  if (margin.chosen) influences.push({ memoryId: margin.chosen.memory.id, version: margin.chosen.memory.version, title: margin.chosen.memory.title, evidence: margin.chosen.memory.evidence, effect: `margin ${m}% (${margin.chosen.reasons.join("; ")})` });
  if (curr.chosen) influences.push({ memoryId: curr.chosen.memory.id, version: curr.chosen.memory.version, title: curr.chosen.memory.title, evidence: curr.chosen.memory.evidence, effect: `quoted in ${curr.chosen.memory.rule!.value} (${curr.chosen.reasons.join("; ")})` });

  const status: QuotationDraft["status"] = issues.some((i) => i.code === "CONFLICTING_MEMORIES") ? "NEEDS_VALIDATION" : blocking ? "NEEDS_INFORMATION" : "DRAFT";
  const inputs = { lines: input.lines, fx: input.fx ?? null, rules: influences.map((i) => `${i.memoryId}@v${i.version}`) };
  return {
    status, currency: target, marginPercent: m ?? null, lines, totals, issues, influences,
    trace: {
      engine: "quotation", title: "Quotation draft from approved memories",
      formula: "line cost = qty × unit cost × fx (minor units); line price = round(cost × (1 + margin%)); totals = Σ lines",
      inputs, outputs: totals ?? {}, assumptions, units: target ?? undefined,
      state: status === "DRAFT" ? "CALCULATED" : "NEEDS_INFORMATION", engineVersion: ENGINE_VERSION, inputHash: hashInputs(inputs),
    },
  };
}
