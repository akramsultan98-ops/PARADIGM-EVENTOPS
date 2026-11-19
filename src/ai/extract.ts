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
  const missing = [...extraction.production.flatMap((d, i) => missingProduction(d, i)), ...extraction.av.flatMap((l, i) => missingAv(l, i))];
  const engineNote = extraction.engine === "AI" ? `Extracted by ${extraction.model ?? provider?.model} (AI) and validated by deterministic rules` : provider ? "AI unavailable — deterministic rule-based extraction used" : "Deterministic rule-based extraction (no AI provider configured)";
  return { extraction, missing, engineNote, aiError };
}
