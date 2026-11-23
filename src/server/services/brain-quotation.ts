import "server-only";
import { assertCan, type AuthUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { situationFrom } from "@/brain/recall";
import type { Sector } from "@/brain/types";
import { draftQuotation, type CostLine, type FxRate } from "@/engines/quotation";
import { recallMemories, recordApplications } from "./brain";

/**
 * APPLY: "Prepare a quotation for this request using what I taught you."
 * Recognise the client/sector → recall approved memories → deterministic engine → record which memories
 * (and versions) influenced the draft in this session. Financial output requires budget.read.
 */
export async function draftQuotationWithMemory(u: AuthUser, input: { sessionId: string; requestText: string; client?: string | null; sector?: Sector | null; lines: CostLine[]; fx?: FxRate | null; contextRef?: string | null }) {
  assertCan(u, "brain.use");
  assertCan(u, "budget.read");
  const situation = situationFrom(input.requestText, { client: input.client, sector: input.sector });
  const recalled = await recallMemories(u, "PARADIGM", situation);
  const draft = draftQuotation({ lines: input.lines, memories: recalled, fx: input.fx ?? null });
  await recordApplications(u, { sessionId: input.sessionId, contextType: "QUOTATION_DRAFT", contextRef: input.contextRef ?? null, influences: draft.influences });
  await audit({ companyId: u.companyId, userId: u.id, action: "BRAIN_QUOTATION_DRAFTED", entityType: "Quotation", details: { sessionId: input.sessionId, status: draft.status, client: situation.client, sector: situation.sector, memories: draft.influences.map((i) => `${i.memoryId}@v${i.version}`) } });
  return { situation, draft, consulted: recalled.map((r) => ({ id: r.memory.id, version: r.memory.version, title: r.memory.title, reasons: r.reasons })) };
}
