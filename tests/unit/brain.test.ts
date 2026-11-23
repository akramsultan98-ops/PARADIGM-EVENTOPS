import { describe, expect, it } from "vitest";
import { extractMemoryDrafts, evidenceIsQuoted, hasLearningIntent } from "@/brain/extract";
import { findConflicts, rankMemories, situationFrom } from "@/brain/recall";
import { draftQuotation } from "@/engines/quotation";
import type { MemoryLike } from "@/brain/types";

const mem = (over: Partial<MemoryLike> & Pick<MemoryLike, "id">): MemoryLike => ({
  version: 1, kind: "RULE", category: "OPERATIONAL_RULE", title: over.id, content: "", rule: null, scope: {}, keywords: [], evidence: "e",
  approval: "APPROVED", validity: "ACTIVE", expiresAt: null, ...over,
});

describe("brain — extraction (OBSERVE → EXTRACT)", () => {
  it("ignores ordinary conversation without learning intent", () => {
    expect(hasLearningIntent("The client sent the agenda for the UN Women event.")).toBe(false);
    expect(extractMemoryDrafts("The client sent the agenda. We need 3 LED screens.")).toEqual([]);
  });

  it("turns a commercial instruction into one structured, scoped rule per value, with verbatim evidence", () => {
    const text = "Remember this for future events: for UN agency events we apply a 15% management fee and quote in USD.";
    const d = extractMemoryDrafts(text);
    expect(d.map((x) => x.rule)).toEqual([{ type: "margin_percent", value: 15 }, { type: "quote_currency", value: "USD" }]);
    for (const x of d) {
      expect(x.scope).toEqual({ sector: "UN" });
      expect(x.kind).toBe("RULE");
      expect(x.category).toBe("OPERATIONAL_RULE");
      expect(evidenceIsQuoted(x, text)).toBe(true);
    }
  });

  it("scopes to a named client when one is mentioned, and keeps a default rule unscoped", () => {
    expect(extractMemoryDrafts("From now on, for UNICEF always use a 14% margin.")[0].scope).toEqual({ client: "unicef", sector: "UN" });
    expect(extractMemoryDrafts("Our standard margin is 12% on all events.")[0]).toMatchObject({ scope: {}, rule: { type: "margin_percent", value: 12 } });
  });

  it("labels uncertain statements as ASSUMPTION, never as a confirmed rule", () => {
    const d = extractMemoryDrafts("Remember: I think embassy clients probably accept a 20% margin.");
    expect(d[0].kind).toBe("ASSUMPTION");
    expect(d[0].confidence).toBeLessThan(0.7);
  });

  it("captures communication preferences and short-lived context with an expiry", () => {
    expect(extractMemoryDrafts("Remember that I prefer short follow-up emails without long greetings.")[0]).toMatchObject({ category: "COMMUNICATION_PREFERENCE", kind: "PREFERENCE", rule: null });
    expect(extractMemoryDrafts("Note that this week the warehouse is closed on Thursday.")[0]).toMatchObject({ category: "ACTIVE_CONTEXT", expiresInDays: 7 });
  });

  it("rejects evidence that is not quoted from the source", () => {
    expect(evidenceIsQuoted({ evidence: "apply 30% margin" }, "apply a 15% margin")).toBe(false);
  });
});

describe("brain — recall (CONNECT)", () => {
  const unMargin = mem({ id: "m-un", rule: { type: "margin_percent", value: 15 }, scope: { sector: "UN" } });
  const def = mem({ id: "m-def", rule: { type: "margin_percent", value: 12 }, scope: {} });
  const unicef = mem({ id: "m-unicef", rule: { type: "margin_percent", value: 14 }, scope: { client: "unicef", sector: "UN" } });

  it("recognises the client and sector of a new request", () => {
    expect(situationFrom("UN Women asks for a quotation for the Rabeha closing event")).toMatchObject({ client: "un-women", sector: "UN" });
    expect(situationFrom("Quotation for Standard Chartered Bank gala", { sector: "CORPORATE" })).toMatchObject({ client: null, sector: "CORPORATE" });
  });

  it("uses scope as a hard filter and ranks client > sector > default", () => {
    const r = rankMemories([def, unMargin, unicef], situationFrom("UNICEF event in Cairo"));
    expect(r.map((x) => x.memory.id)).toEqual(["m-unicef", "m-un", "m-def"]);
    expect(rankMemories([unMargin, unicef], situationFrom("Corporate gala", { sector: "CORPORATE" }))).toEqual([]);
  });

  it("never uses proposed, rejected, revoked, superseded or expired memories", () => {
    const now = new Date("2026-11-24T10:00:00Z");
    const bad = [
      mem({ id: "p", approval: "PROPOSED", rule: { type: "margin_percent", value: 1 } }),
      mem({ id: "r", approval: "REVOKED", rule: { type: "margin_percent", value: 2 } }),
      mem({ id: "s", validity: "SUPERSEDED", rule: { type: "margin_percent", value: 3 } }),
      mem({ id: "x", expiresAt: new Date("2026-11-20T00:00:00Z"), rule: { type: "margin_percent", value: 4 } }),
    ];
    expect(rankMemories(bad, situationFrom("any event"), now)).toEqual([]);
  });

  it("detects a conflicting rule for the same scope instead of silently choosing one", () => {
    expect(findConflicts({ rule: { type: "margin_percent", value: 18 }, scope: { sector: "UN" } }, [unMargin, def]).map((m) => m.id)).toEqual(["m-un"]);
    expect(findConflicts({ rule: { type: "margin_percent", value: 15 }, scope: { sector: "UN" } }, [unMargin])).toEqual([]);
  });
});

describe("quotation engine (APPLY)", () => {
  const lines = [
    { description: "LED screen 4x3 m", qty: 2, unitCost: 1250.5, currency: "USD" as const },
    { description: "Simultaneous interpretation booth", qty: 1, unitCost: 800, currency: "USD" as const },
  ];
  const ranked = (ms: MemoryLike[], text: string) => rankMemories(ms, situationFrom(text));

  it("applies the most specific approved margin in integer minor units and reports which memory influenced it", () => {
    const d = draftQuotation({ lines, memories: ranked([mem({ id: "def", rule: { type: "margin_percent", value: 12 } }), mem({ id: "un", rule: { type: "margin_percent", value: 15 }, scope: { sector: "UN" }, evidence: "for UN agency events we apply a 15% management fee" })], "UNDP workshop") });
    expect(d.status).toBe("DRAFT");
    expect(d.marginPercent).toBe(15);
    expect(d.totals).toEqual({ costMinor: 330100, priceMinor: 379615, marginMinor: 49515 });
    expect(d.influences).toEqual([expect.objectContaining({ memoryId: "un", version: 1, evidence: "for UN agency events we apply a 15% management fee" })]);
    expect(d.trace.inputHash).toHaveLength(16);
  });

  it("asks instead of inventing: no approved margin, missing FX, mixed currencies", () => {
    expect(draftQuotation({ lines, memories: [] }).issues.map((i) => i.code)).toContain("NO_APPROVED_MARGIN");
    const egp = [{ description: "Hall rental", qty: 1, unitCost: 50000, currency: "EGP" as const }];
    const usdRule = ranked([mem({ id: "m", rule: { type: "margin_percent", value: 15 } }), mem({ id: "c", rule: { type: "quote_currency", value: "USD" } })], "event");
    const noFx = draftQuotation({ lines: egp, memories: usdRule });
    expect(noFx.status).toBe("NEEDS_INFORMATION");
    expect(noFx.totals).toBeNull();
    expect(noFx.issues.map((i) => i.code)).toContain("FX_REQUIRED");
    const withFx = draftQuotation({ lines: egp, memories: usdRule, fx: { from: "EGP", to: "USD", rate: 0.02, source: "test rate" } });
    expect(withFx.totals).toEqual({ costMinor: 100000, priceMinor: 115000, marginMinor: 15000 });
    expect(draftQuotation({ lines: [...lines, ...egp], memories: usdRule }).issues.map((i) => i.code)).toContain("MIXED_CURRENCIES");
  });

  it("refuses to choose between two approved rules of equal specificity (needs validation)", () => {
    const d = draftQuotation({ lines, memories: ranked([mem({ id: "a", rule: { type: "margin_percent", value: 15 }, scope: { sector: "UN" } }), mem({ id: "b", rule: { type: "margin_percent", value: 18 }, scope: { sector: "UN" } })], "WFP event") });
    expect(d.status).toBe("NEEDS_VALIDATION");
    expect(d.totals).toBeNull();
  });
});
