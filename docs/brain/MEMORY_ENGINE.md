# Akram Brain — persistent memory & learning engine

_Added 2026-11-24. The model never retrains; this is a database-backed memory with human approval._

## Loop
| Step | Where | What happens |
|---|---|---|
| OBSERVE | `assistantRespond` (any "Remember… / From now on… / Always…" message, not a question), `teachAction` on `/brain` | the user's own words enter the engine |
| EXTRACT | `src/brain/extract.ts` (pure, rule-based) | one draft per rule/sentence: category (10), kind (FACT/RULE/PREFERENCE/ASSUMPTION/SUGGESTION), structured rule (`margin_percent`, `quote_currency`), scope (client / sector), keywords, **verbatim evidence**, confidence |
| UNDERSTAND / CONNECT | `src/brain/clients.ts`, `src/brain/recall.ts` | recognises client + sector; scope is a hard filter; ranking client > sector > default, then shared terms |
| VALIDATE | `src/server/services/brain.ts` | proposals are inert; assumptions need explicit confirmation; contradicting rules are `CONFLICTED` until the person decides (the loser is `SUPERSEDED`, never deleted) |
| REMEMBER | `BrainMemory`, `BrainMemoryVersion` | id, category, content, source + evidence, confidence, scope, owner, workspace, timestamps, version history, approval, validity, expiry |
| APPLY | `src/engines/quotation.ts`, assistant tool `recall_memories` | deterministic quotation draft (integer minor units, CalcTrace); the assistant receives only approved memories and must cite ids |
| EVALUATE | `BrainMemoryApplication` | every use: memory id + version + session + context + effect |

## Rules that cannot be bypassed
- Nothing is used before approval (DB filter **and** `isUsable()` — both layers mutation-tested).
- No silent promotion: approving an ASSUMPTION/SUGGESTION requires `confirmKind`; the promotion is a new version with the reason.
- No silent winner: two approved rules of equal specificity with different values → `NEEDS_VALIDATION`, no numbers.
- Missing data is asked for, never invented: no approved margin → `NO_APPROVED_MARGIN`; cost currency ≠ quote currency without an approved FX → `FX_REQUIRED`; mixed currencies are never summed.
- Workspaces: PERSONAL / DEVELOPMENT visible only to the owner; PARADIGM visible to the owner, and company-wide only after `shareMemory` by a `standards.approve` holder. Always company-scoped.
- Only the owner can approve, correct, revoke or share a memory. Permission `brain.use` (Account Manager, Project Manager, Super Admin).

## Acceptance test
`tests/integration/brain-learning.test.ts` — learn → persist → **new session** (module graph reset, Prisma connection dropped, new session id) → recognise "UN Women … Rabeha closing event" as UN → apply 15 % + USD → influences cite memory id, version and the user's own sentence; application rows stored. Also: inert proposals, out-of-scope client, conflict + supersede with history, assumption confirmation, correction versions, revoke, workspace/user isolation, permission checks.

## Known limits (next)
- Extraction is rule-based English/basic Arabic; an AI extractor must pass the same evidence check.
- Structured rules: margin and quote currency only. Other knowledge is narrative and recalled by keywords (pgvector later, same Postgres).
- No learning from email corrections or completed workflows yet; no semantic conflict detection for narrative memories.
