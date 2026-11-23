import { beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";
import { demo, loadUser } from "../support/session";

/**
 * AKRAM BRAIN — continuous-learning acceptance test (master brief §3A "critical acceptance requirement").
 *
 *   1. learn a new business rule        → proposeMemories + decideMemory (real services, real PostgreSQL)
 *   2. save it persistently             → rows in BrainMemory / BrainMemoryVersion
 *   3. start a completely new session   → every module re-imported, the Prisma connection dropped and reopened,
 *                                          a new session id — nothing survives in process memory
 *   4. recognise a similar situation    → a differently worded request from a different UN client
 *   5. apply the approved rule          → deterministic quotation engine uses 15% + USD
 *   6. show which memory and evidence   → influences (id, version, quoted evidence) + BrainMemoryApplication rows
 *
 * Plus the guard rails: proposals are inert, assumptions are never silently promoted, contradictions need a
 * decision, revoked memories stop applying, corrections keep history, workspaces stay isolated.
 */

const verify = new PrismaClient(); // independent connection used only to inspect what is stored
const usdLines = [
  { description: "LED screen 4x3 m (P3.9) incl. operator", qty: 1, unitCost: 2400, currency: "USD" as const },
  { description: "Simultaneous interpretation — 2 booths, 4 interpreters", qty: 1, unitCost: 3100, currency: "USD" as const },
];
const TEACH = "Remember this for future events: for UN agency events we apply a 15% management fee and quote in USD. Our standard margin is 12% on all events.";
const ids = { un15: "", usd: "", def12: "" };
let am: AuthUser;

/** End the current "session": drop the DB connection and the whole module graph. */
async function endSession() {
  const g = globalThis as unknown as { prisma?: PrismaClient };
  await g.prisma?.$disconnect();
  delete g.prisma;
  vi.resetModules();
}

beforeAll(async () => {
  am = await loadUser(demo.account);
});

describe("Scenario D — the Brain learns a rule and applies it in a new session", () => {
  it("1–2. learns from the user's own words and stores proposals that are inert until approved", async () => {
    const brain = await import("@/server/services/brain");
    const quote = await import("@/server/services/brain-quotation");

    const proposed = await brain.proposeMemories(am, { workspace: "PARADIGM", text: TEACH });
    expect(proposed.map((p) => [p.rule, p.scope, p.approval, p.kind])).toEqual([
      [{ type: "margin_percent", value: 15 }, { sector: "UN" }, "PROPOSED", "RULE"],
      [{ type: "quote_currency", value: "USD" }, { sector: "UN" }, "PROPOSED", "RULE"],
      [{ type: "margin_percent", value: 12 }, {}, "PROPOSED", "RULE"],
    ]);
    for (const p of proposed) expect(TEACH).toContain(p.evidence); // evidence is the user's own words
    [ids.un15, ids.usd, ids.def12] = proposed.map((p) => p.id);

    // not yet approved → not applied
    const before = await quote.draftQuotationWithMemory(am, { sessionId: "S1-before-approval", requestText: "UNDP workshop quotation", lines: usdLines });
    expect(before.draft.status).toBe("NEEDS_INFORMATION");
    expect(before.draft.influences).toEqual([]);

    for (const id of Object.values(ids)) await brain.decideMemory(am, id, { decision: "APPROVE" });
    const stored = await verify.brainMemory.findMany({ where: { id: { in: Object.values(ids) } }, include: { versions: true } });
    expect(stored.every((m) => m.approval === "APPROVED" && m.validity === "ACTIVE" && m.approvedById === am.id && m.versions.length === 1)).toBe(true);
  });

  it("3–6. a completely new session recognises a similar request, applies the rule and shows its evidence", async () => {
    const firstGraph = await import("@/server/services/brain-quotation");
    await endSession();
    const quote = await import("@/server/services/brain-quotation");
    expect(quote).not.toBe(firstGraph); // genuinely new module instances and a new DB connection
    const amFresh = await loadUser(demo.account);

    const r = await quote.draftQuotationWithMemory(amFresh, {
      sessionId: "S2-new-session",
      requestText: "UN Women asks for a quotation for the Rabeha closing event, 120 pax, Cairo",
      lines: usdLines,
    });
    expect(r.situation).toMatchObject({ client: "un-women", sector: "UN" });
    expect(r.draft.status).toBe("DRAFT");
    expect(r.draft.marginPercent).toBe(15);
    expect(r.draft.currency).toBe("USD");
    expect(r.draft.totals).toEqual({ costMinor: 550000, priceMinor: 632500, marginMinor: 82500 });
    expect(r.draft.influences.map((i) => i.memoryId).sort()).toEqual([ids.un15, ids.usd].sort());
    for (const i of r.draft.influences) {
      expect(i.version).toBe(1);
      expect(TEACH).toContain(i.evidence);
      expect(i.effect).toMatch(/sector = UN/);
    }
    // the most specific rule wins; the default 12% was consulted but not applied
    expect(r.consulted.map((c) => c.id)).toContain(ids.def12);

    const uses = await verify.brainMemoryApplication.findMany({ where: { sessionId: "S2-new-session" }, orderBy: { memoryId: "asc" } });
    expect(uses.map((u) => [u.memoryId, u.memoryVersion, u.contextType]).sort()).toEqual([[ids.un15, 1, "QUOTATION_DRAFT"], [ids.usd, 1, "QUOTATION_DRAFT"]].sort());
  });

  it("does not apply the UN rule to a client outside its scope (corporate → default 12%, cost currency)", async () => {
    const quote = await import("@/server/services/brain-quotation");
    const r = await quote.draftQuotationWithMemory(am, { sessionId: "S2-corporate", requestText: "Standard Chartered Bank dinner, 120 pax", sector: "CORPORATE", lines: usdLines });
    expect(r.draft.marginPercent).toBe(12);
    expect(r.draft.influences.map((i) => i.memoryId)).toEqual([ids.def12]);
    expect(r.draft.trace.assumptions.join(" ")).toMatch(/No approved currency rule/);
  });
});

describe("Scenario G — contradictory information needs a decision", () => {
  it("stores a contradicting rule as CONFLICTED, refuses to apply or approve it silently, and keeps history when superseded", async () => {
    const brain = await import("@/server/services/brain");
    const quote = await import("@/server/services/brain-quotation");
    const [p] = await brain.proposeMemories(am, { workspace: "PARADIGM", text: "From now on, for UN agency events apply an 18% management fee." });
    expect(p).toMatchObject({ validity: "CONFLICTED", conflictWithId: ids.un15, approval: "PROPOSED" });

    await expect(brain.decideMemory(am, p.id, { decision: "APPROVE" })).rejects.toThrow(/contradicts the approved memory/);
    expect((await quote.draftQuotationWithMemory(am, { sessionId: "G-1", requestText: "WFP retreat", lines: usdLines })).draft.marginPercent).toBe(15);

    await brain.decideMemory(am, p.id, { decision: "APPROVE", supersedeConflicting: true, note: "Management confirmed the new UN fee" });
    const old = await verify.brainMemory.findUniqueOrThrow({ where: { id: ids.un15 }, include: { applications: true } });
    expect(old.validity).toBe("SUPERSEDED"); // kept, not deleted
    expect(old.applications.length).toBeGreaterThan(0); // its past influence is still on record
    const r = await quote.draftQuotationWithMemory(am, { sessionId: "G-2", requestText: "WFP retreat", lines: usdLines });
    expect(r.draft.marginPercent).toBe(18);
    expect(r.draft.influences.find((i) => i.effect.startsWith("margin"))?.memoryId).toBe(p.id);
  });
});

describe("guard rails", () => {
  it("never converts an assumption into a confirmed rule without an explicit confirmation", async () => {
    const brain = await import("@/server/services/brain");
    const quote = await import("@/server/services/brain-quotation");
    const [a] = await brain.proposeMemories(am, { workspace: "PARADIGM", text: "Remember: I think embassy clients probably accept a 20% margin." });
    expect(a.kind).toBe("ASSUMPTION");
    await expect(brain.decideMemory(am, a.id, { decision: "APPROVE" })).rejects.toThrow(/assumption, not a confirmed rule/);
    expect((await verify.brainMemory.findUniqueOrThrow({ where: { id: a.id } })).approval).toBe("PROPOSED");
    const r = await quote.draftQuotationWithMemory(am, { sessionId: "H-emb", requestText: "Embassy of Canada reception", lines: usdLines });
    expect(r.draft.marginPercent).toBe(12); // the assumption had no effect

    await brain.decideMemory(am, a.id, { decision: "APPROVE", confirmKind: "RULE", note: "Confirmed with finance" });
    const v = await verify.brainMemoryVersion.findMany({ where: { memoryId: a.id }, orderBy: { version: "asc" } });
    expect(v.map((x) => [x.version, x.kind])).toEqual([[1, "ASSUMPTION"], [2, "RULE"]]);
    expect(v[1].reason).toMatch(/ASSUMPTION → RULE/);
  });

  it("corrections create a new version and keep the old one; revoked memories stop applying", async () => {
    const brain = await import("@/server/services/brain");
    const quote = await import("@/server/services/brain-quotation");
    await brain.correctMemory(am, ids.def12, { content: "Our standard margin is 12% on all events (excluding VAT).", reason: "Clarified that VAT is separate" });
    const versions = await verify.brainMemoryVersion.findMany({ where: { memoryId: ids.def12 }, orderBy: { version: "asc" } });
    expect(versions.map((x) => x.version)).toEqual([1, 2]);
    expect(versions[0].content).toBe("Our standard margin is 12% on all events.");

    await brain.revokeMemory(am, ids.def12, "Margins are now set per client");
    const r = await quote.draftQuotationWithMemory(am, { sessionId: "rev", requestText: "Private sector product launch", sector: "CORPORATE", lines: usdLines });
    expect(r.draft.status).toBe("NEEDS_INFORMATION");
    expect(r.draft.issues.map((i) => i.code)).toContain("NO_APPROVED_MARGIN");
  });

  it("Scenario I — workspaces and users stay isolated", async () => {
    const brain = await import("@/server/services/brain");
    const { situationFrom } = await import("@/brain/recall");
    const [personal] = await brain.proposeMemories(am, { workspace: "PERSONAL", text: "Remember that I prefer to plan my week on Sunday evenings." });
    await brain.decideMemory(am, personal.id, { decision: "APPROVE" });

    const s = situationFrom("plan my week on Sunday evenings");
    expect((await brain.recallMemories(am, "PERSONAL", s)).map((r) => r.memory.id)).toEqual([personal.id]);
    expect((await brain.recallMemories(am, "PARADIGM", s)).map((r) => r.memory.id)).not.toContain(personal.id);

    const pm = await loadUser(demo.pm); // same company, different person
    expect(await brain.recallMemories(pm, "PERSONAL", s)).toEqual([]);
    expect((await brain.listMemories(pm, "PARADIGM")).length).toBe(0); // AM's memories are not shared
    await expect(brain.revokeMemory(pm, personal.id, "attempt")).rejects.toThrow(/not found/);
    await expect(brain.decideMemory(pm, ids.usd, { decision: "REJECT" })).rejects.toThrow(/not found/);

    const viewer = await loadUser(demo.viewer);
    await expect(brain.proposeMemories(viewer, { workspace: "PARADIGM", text: TEACH })).rejects.toThrow(/brain.use/);

    // sharing is a company decision: an account manager cannot publish a memory company-wide
    await expect(brain.shareMemory(am, ids.usd)).rejects.toThrow(/standards/);
  });
});
