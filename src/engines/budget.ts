/**
 * Cost & budget engine (spec §15). Totals are kept per currency; different currencies are
 * never silently combined. Conversion only happens with an explicit stored rate, and the
 * rate, source and date are returned as assumptions.
 */
import { round, trace, type CalcTrace, type Issue } from "./trace";

export type CostBasis = "ACTUAL" | "APPROVED_QUOTE" | "ESTIMATE" | "PENDING_QUOTE" | "BUDGET";

export interface CostLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  amount: number;
  currency: string;
  basis: CostBasis;
  source: string;
}

export interface BudgetResult {
  lines: CostLine[];
  byCurrency: { currency: string; total: number; byCategory: Record<string, number>; byBasis: Record<string, number> }[];
  budgetCurrency: string;
  budgetAmount: number | null;
  totalInBudgetCurrency: number | null;
  conversions: { from: string; to: string; rate: number; source: string; rateDate: string; amount: number; converted: number }[];
  unconvertible: string[];
  variance: number | null;
  utilizationPct: number | null;
  unpricedItems: string[];
  traces: CalcTrace[];
  issues: Issue[];
}

export function computeBudget(
  lines: CostLine[],
  opts: { budgetAmount: number | null; budgetCurrency: string; contingencyPct: number; unpriced: string[]; rates: { from: string; to: string; rate: number; source: string; rateDate: Date }[] },
): BudgetResult {
  const issues: Issue[] = [];
  const all = [...lines];
  // contingency per currency
  const currencies = [...new Set(lines.map((l) => l.currency))].sort();
  for (const c of currencies) {
    const sub = lines.filter((l) => l.currency === c).reduce((s, l) => s + l.amount, 0);
    if (opts.contingencyPct > 0 && sub > 0) all.push({ category: "CONTINGENCY", description: `Contingency ${opts.contingencyPct}% (${c})`, quantity: 1, unit: "lump sum", unitCost: round((sub * opts.contingencyPct) / 100, 2), amount: round((sub * opts.contingencyPct) / 100, 2), currency: c, basis: "ESTIMATE", source: "Company standard contingency" });
  }
  const byCurrency = currencies.map((currency) => {
    const ls = all.filter((l) => l.currency === currency);
    const byCategory: Record<string, number> = {};
    const byBasis: Record<string, number> = {};
    ls.forEach((l) => { byCategory[l.category] = round((byCategory[l.category] ?? 0) + l.amount, 2); byBasis[l.basis] = round((byBasis[l.basis] ?? 0) + l.amount, 2); });
    return { currency, total: round(ls.reduce((s, l) => s + l.amount, 0), 2), byCategory, byBasis };
  });
  const conversions: BudgetResult["conversions"] = [];
  const unconvertible: string[] = [];
  let total = 0;
  for (const c of byCurrency) {
    if (c.currency === opts.budgetCurrency) { total += c.total; continue; }
    const r = opts.rates.filter((x) => x.from === c.currency && x.to === opts.budgetCurrency).sort((a, b) => b.rateDate.getTime() - a.rateDate.getTime())[0];
    if (!r) { unconvertible.push(c.currency); continue; }
    const converted = round(c.total * r.rate, 2);
    conversions.push({ from: c.currency, to: opts.budgetCurrency, rate: r.rate, source: r.source, rateDate: r.rateDate.toISOString().slice(0, 10), amount: c.total, converted });
    total += converted;
  }
  if (unconvertible.length) issues.push({ severity: "warning", code: "FX_RATE_MISSING", department: "FINANCE", message: `No approved exchange rate for ${unconvertible.join(", ")} → ${opts.budgetCurrency}; those amounts are excluded from the budget comparison` });
  opts.unpriced.forEach((u) => issues.push({ severity: "warning", code: "COST_UNPRICED", department: "PROCUREMENT", message: `${u}: no price available — cost not included` }));
  const totalInBudget = unconvertible.length ? null : round(total, 2);
  const variance = opts.budgetAmount != null && totalInBudget != null ? round(opts.budgetAmount - totalInBudget, 2) : null;
  const utilizationPct = opts.budgetAmount && totalInBudget != null ? round((totalInBudget / opts.budgetAmount) * 100, 1) : null;
  if (variance != null && variance < 0) issues.push({ severity: "error", code: "BUDGET_EXCEEDED", department: "FINANCE", message: `Planned cost exceeds budget by ${Math.abs(variance).toLocaleString("en-US")} ${opts.budgetCurrency}` });
  const traces = [trace({
    engine: "budget.totals", title: "Project cost & budget",
    formula: "Σ line amounts per currency + contingency%; converted to budget currency only with stored rates",
    inputs: { lines: all.length, contingencyPct: opts.contingencyPct, budgetAmount: opts.budgetAmount, budgetCurrency: opts.budgetCurrency },
    outputs: { byCurrency: byCurrency.map((c) => `${c.currency} ${c.total}`), totalInBudgetCurrency: totalInBudget, variance },
    assumptions: [...conversions.map((c) => `1 ${c.from} = ${c.rate} ${c.to} (${c.source}, ${c.rateDate})`), "Catalogue/estimated prices are not quotations"],
    units: opts.budgetCurrency, state: opts.unpriced.length || unconvertible.length ? "ESTIMATED" : "CALCULATED",
  })];
  return { lines: all, byCurrency, budgetCurrency: opts.budgetCurrency, budgetAmount: opts.budgetAmount, totalInBudgetCurrency: totalInBudget, conversions, unconvertible, variance, utilizationPct, unpricedItems: opts.unpriced, traces, issues };
}
