import { detectClient, detectSector } from "./clients";
import type { Category, Currency, Kind, MemoryDraft, MemoryScope, RuleSpec } from "./types";

/**
 * OBSERVE → EXTRACT: turns an explicit instruction, a correction or an approved decision into memory
 * PROPOSALS. Deterministic (rule-based); an AI extractor may add drafts later, but every draft goes through
 * the same validation (evidence must be quoted from the source) and stays PROPOSED until a person approves it.
 */

const INTENT = /\b(remember|from now on|going forward|in future|for future|next time|always|never|make sure|as a rule|our (standard|rule|policy)|note that)\b|افتكر|خلي بالك|من دلوقتي|من الآن|دايما|دائما|ابدا|أبدا/i;
const ASSUMPTION = /\b(i think|i guess|probably|maybe|might|perhaps|not sure|i believe|likely)\b|غالبا|اعتقد|أعتقد|ممكن|يمكن/i;
const PREFERENCE = /\b(i prefer|i like|i want|i don't like|i do not like|i'd rather|please (always|never))\b|بفضل|أفضل|مش بحب|بحب/i;
const RULE_WORDS = /\b(always|never|must|should|rule|policy|standard)\b|دايما|دائما|لازم|ابدا|أبدا/i;

const STOP = new Set("the a an and or for of to in on at is are be with this that these those our we us you your it its as by from from now on future always never remember make sure please next time into than then also".split(" "));

const MARGIN = /(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:margin|management fee|mark-?up|agency fee|service fee|profit)|(?:margin|management fee|mark-?up|agency fee|service fee|profit)\s*(?:of|at|=|is|to|should be|must be)?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/i;
const CURRENCY = /\b(?:quote|quotes|quotation|quotations|price|prices|pricing|invoice|invoices)\b[^.\n]{0,40}?\bin\s+(USD|US dollars?|dollars?|EGP|Egyptian pounds?|EUR|euros?)\b/i;

function currencyOf(word: string): Currency {
  const w = word.toLowerCase();
  if (w.startsWith("usd") || w.includes("dollar")) return "USD";
  if (w.startsWith("eur")) return "EUR";
  return "EGP";
}

export function hasLearningIntent(text: string): boolean {
  return INTENT.test(text);
}

/** sentences with their exact text (the evidence must be a verbatim substring of the source) */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

export function keywordsOf(text: string, max = 12): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}%]+/u)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+%?$/.test(raw)) continue;
    if (!out.includes(raw)) out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}

export function parseRules(sentence: string): RuleSpec[] {
  const rules: RuleSpec[] = [];
  const m = MARGIN.exec(sentence);
  if (m) {
    const v = Number(m[1] ?? m[2]);
    if (v > 0 && v < 100) rules.push({ type: "margin_percent", value: v });
  }
  const c = CURRENCY.exec(sentence);
  if (c) rules.push({ type: "quote_currency", value: currencyOf(c[1]) });
  return rules;
}

export function scopeOf(sentence: string): MemoryScope {
  const c = detectClient(sentence);
  if (c) return { client: c.client, sector: c.sector };
  const s = detectSector(sentence);
  return s ? { sector: s } : {};
}

function kindOf(sentence: string, hasRule: boolean): Kind {
  if (ASSUMPTION.test(sentence)) return "ASSUMPTION";
  if (PREFERENCE.test(sentence)) return "PREFERENCE";
  if (hasRule || RULE_WORDS.test(sentence)) return "RULE";
  return "FACT";
}

function categoryOf(sentence: string, kind: Kind, scope: MemoryScope, hasRule: boolean): { category: Category; expiresInDays?: number } {
  const s = sentence.toLowerCase();
  if (/\b(today|this week|for now|temporarily|until (further notice|\w+day)|this month)\b|النهارده|الأسبوع ده/.test(s)) return { category: "ACTIVE_CONTEXT", expiresInDays: 7 };
  if (hasRule || /\b(margin|price|pricing|quote|quotation|fee|payment|invoice|discount|vat|tax)\b/.test(s)) return { category: "OPERATIONAL_RULE" };
  if (/\b(e-?mails?|repl(y|ies)|tone|wording|write|writing|signature|greetings?|follow-?ups?|messages?)\b/.test(s)) return { category: "COMMUNICATION_PREFERENCE" };
  if (/\b(vendor|supplier|production house|printer|av company)\b/.test(s)) return { category: "VENDOR_KNOWLEDGE" };
  if (/\b(lesson|learned|mistake|went wrong|next time)\b/.test(s)) return { category: "DECISION_LESSON" };
  if (/\b(step|steps|procedure|process|checklist|first\b.*\bthen)\b/.test(s)) return { category: "PROCEDURE" };
  if (scope.client) return { category: "CLIENT_KNOWLEDGE" };
  if (kind === "PREFERENCE") return { category: "WORKING_PREFERENCE" };
  return { category: "PROFESSIONAL_KNOWLEDGE" };
}

function ruleTitle(rule: RuleSpec, scope: MemoryScope): string {
  const where = scope.client ? `for ${scope.client}` : scope.sector ? `for ${scope.sector} clients` : "(default)";
  return rule.type === "margin_percent" ? `Margin ${rule.value}% ${where}` : `Quote in ${rule.value} ${where}`;
}

/**
 * Extracts memory proposals from a message. Only sentences in a message that shows learning intent
 * ("remember…", "from now on…", "always…") are considered, so ordinary conversation is not memorised.
 * One structured rule per memory, so each rule can be approved, corrected or revoked on its own.
 */
export function extractMemoryDrafts(text: string): MemoryDraft[] {
  if (!hasLearningIntent(text)) return [];
  const drafts: MemoryDraft[] = [];
  for (const sentence of sentences(text)) {
    const rules = parseRules(sentence);
    const intentHere = hasLearningIntent(sentence) || rules.length > 0;
    if (!intentHere) continue;
    const scope = scopeOf(sentence);
    const kind = kindOf(sentence, rules.length > 0);
    const { category, expiresInDays } = categoryOf(sentence, kind, scope, rules.length > 0);
    const keywords = keywordsOf(sentence);
    const base = { category, kind, content: sentence, scope, keywords, evidence: sentence, expiresInDays };
    if (rules.length) {
      for (const rule of rules) {
        drafts.push({ ...base, title: ruleTitle(rule, scope), rule, confidence: kind === "ASSUMPTION" ? 0.5 : 0.9 });
      }
    } else {
      drafts.push({ ...base, title: sentence.length > 80 ? `${sentence.slice(0, 77)}…` : sentence, rule: null, confidence: kind === "ASSUMPTION" ? 0.4 : 0.7 });
    }
  }
  return drafts;
}

/** Guard used before any draft (rule-based or AI) is stored: the evidence must be quoted verbatim from the source. */
export function evidenceIsQuoted(draft: Pick<MemoryDraft, "evidence">, source: string): boolean {
  return draft.evidence.trim().length > 0 && source.includes(draft.evidence.trim());
}
