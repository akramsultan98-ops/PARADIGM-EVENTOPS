import "server-only";
import { extractRuleBased } from "./rules";
import { getProvider } from "./provider";
import { missingAv, missingProduction } from "./validate";
import type { Extraction, MissingField } from "./types";

export interface ExtractionOutcome { extraction: Extraction; missing: MissingField[]; engineNote: string; aiError?: string }

/** Extract a structured draft. AI when configured, otherwise deterministic rules; both validated identically. */
export async function extractInput(text: string, opts: { department?: string; projectContext: string }): Promise<ExtractionOutcome> {
  const rules = extractRuleBased(text);
  let extraction: Extraction = rules;
  let aiError: string | undefined;
  const provider = getProvider();
  if (provider) {
    try {
      extraction = await provider.extract({ text, department: opts.department, projectContext: opts.projectContext });
    } catch (e) {
      aiError = e instanceof Error ? e.message : "AI provider error";
      extraction = rules;
    }
  }
  if (extraction.engine === "AI") extraction = verifyEvidence(text, extraction);
  const missing = [...extraction.production.flatMap((d, i) => missingProduction(d, i)), ...extraction.av.flatMap((l, i) => missingAv(l, i))];
  const engineNote = extraction.engine === "AI" ? `Extracted by ${extraction.model ?? provider?.model} (AI) and validated by deterministic rules` : provider ? "AI unavailable — deterministic rule-based extraction used" : "Deterministic rule-based extraction (no AI provider configured)";
  return { extraction, missing, engineNote, aiError };
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\u00a0]+/g, " ").replace(/[“”"']/g, "").trim();

/**
 * P3: AI evidence must be a real quote from the source text. Snippets that do not occur in the input are removed
 * and recorded, so a reviewer never sees an invented "source" next to a drafted value.
 */
export function verifyEvidence(text: string, extraction: Extraction): Extraction {
  const source = norm(text);
  const verified = extraction.evidence.filter((e) => e.snippet && norm(e.snippet).length > 0 && source.includes(norm(e.snippet)));
  const dropped = extraction.evidence.filter((e) => !verified.includes(e));
  if (!dropped.length) return extraction;
  return {
    ...extraction,
    evidence: verified,
    assumptionsMade: [...extraction.assumptionsMade, ...dropped.map((e) => `Unverified evidence removed for "${e.field}" — the quoted text does not appear in the input; confirm this value manually`)],
  };
}
