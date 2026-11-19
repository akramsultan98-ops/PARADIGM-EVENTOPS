import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractionSchema, type Extraction } from "./types";

/**
 * AI provider abstraction. Claude (Anthropic) is the initial provider; it is used only when
 * ANTHROPIC_API_KEY is configured. Everything else in the platform works without it.
 */
export interface AiProvider {
  name: string;
  model: string;
  extract(input: { text: string; department?: string; projectContext: string }): Promise<Extraction>;
  client(): Anthropic;
}

export const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

let cached: Anthropic | null = null;
export function aiEnabled() { return process.env.AI_PROVIDER !== "none" && !!process.env.ANTHROPIC_API_KEY; }

export function getProvider(): AiProvider | null {
  if (!aiEnabled()) return null;
  const client = () => (cached ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 }));
  return {
    name: "anthropic",
    model: MODEL(),
    client,
    async extract({ text, department, projectContext }) {
      const res = await client().beta.messages.parse({
        model: MODEL(),
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
        system: [
          "You extract structured event-production requirements for PARADIGM EVENTOPS.",
          "Extract ONLY values explicitly stated in the employee's text. Use null for anything not stated — never guess dimensions, quantities, materials, thicknesses, coats or dates.",
          "Convert lengths to metres. Record the exact source phrase for each extracted value in `evidence`.",
          "List in `assumptionsMade` any interpretation you had to make (e.g. reading 'first setup day' as installationDay=1). The output is a DRAFT for human review, not an approved specification.",
        ].join("\n"),
        messages: [{ role: "user", content: `Project context:\n${projectContext}\n\nDepartment (if known): ${department ?? "unknown"}\n\nEmployee input:\n"""${text.slice(0, 20000)}"""` }],
      });
      if (res.stop_reason === "refusal") throw new Error("The AI provider declined this request; the rule-based extraction is shown instead.");
      const parsed = res.parsed_output;
      if (!parsed) throw new Error("AI extraction returned no structured output");
      return { ...parsed, engine: "AI", model: res.model };
    },
  };
}
