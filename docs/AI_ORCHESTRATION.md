# AI orchestration

## Principles
- The AI **understands, organises, asks and coordinates**; deterministic engines **calculate**.
- No value becomes an approved specification without a person: extracted data is a draft (`UNDER_REVIEW`), confirmed by the employee, then technically approved by the department manager.
- The assistant may only state numbers returned by tools.

## Provider abstraction (`src/ai/provider.ts`)
- `getProvider()` returns the Anthropic provider when `ANTHROPIC_API_KEY` is set (and `AI_PROVIDER` ≠ `none`); otherwise `null` and the platform runs in rule-based mode.
- Model: `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `output_config.effort: "medium"`, server-side fallbacks (`server-side-fallback-2026-07-01`, `fallbacks: "default"`), refusal stop reason handled.
- Extraction uses `client.beta.messages.parse` with a Zod schema (`ExtractionSchema`) → typed draft with `evidence` (source phrases) and `assumptionsMade`.

## Extraction pipeline (`src/ai/extract.ts`)
1. Rule-based extraction always runs (`rules.ts`): dimensions (units → metres, "W × H × D"), category, material, thickness, finishing/colour, coats, installation day, quantities; AV quantities and backups. Evidence recorded for each value.
2. If AI is configured, the AI draft replaces the rule draft (on failure the rule draft is used and the error shown).
3. **The same deterministic validator** (`validate.ts`) computes missing fields and follow-up questions for either engine.
4. UI (`ExtractionReview`) shows engine, evidence, questions and editable fields; drawings can be attached; "Confirm & submit" creates DRAFT/SUBMITTED items — never APPROVED.

Documents: PDF (per page via `unpdf`), DOCX (`mammoth`), CSV/XLSX are converted to text; rule extraction creates `ExtractedDocumentData` rows (page, field, value, snippet, method) for human accept/reject in the Document Center. Images need a vision-capable provider (not implemented in rule mode).

## Orchestrator assistant (`src/ai/assistant.ts`)
Central loop with **typed tools** over services (manual tool loop, max 6 iterations, strict JSON schemas):

| Tool | Returns |
|---|---|
| `list_projects` | projects visible to the user |
| `get_project_overview` | status, dates, departments, plan readiness |
| `list_open_issues` | validation errors/warnings & questions (optional department filter) |
| `get_plan_section` | boq · manpower · av · transport · accommodation · budget · schedule · risks (from the persisted plan) |
| `run_what_if` | scenario impact on a plan copy (never changes the approved plan) |

Context: current user, role, department, project. System prompt forbids estimating numbers and requires distinguishing CALCULATED / ESTIMATED / NEEDS_INFORMATION. Every query is audited (`AI_ASSISTANT_QUERY`) and rate-limited.

Without an API key a deterministic intent router answers from the same tools (labelled "Rule-based assistant").

## Planning coordination
"Generate plan" is the orchestrated workflow: snapshot → engines → validation → WBS → schedule → risks → master plan → approval request → notifications/clarification requests per department → stored decisions and traces.
