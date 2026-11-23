import "server-only";
import type { BrainMemory, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, AuthorizationError, can, type AuthUser } from "@/lib/auth/session";
import { evidenceIsQuoted, extractMemoryDrafts } from "@/brain/extract";
import { findConflicts, rankMemories } from "@/brain/recall";
import type { Kind, MemoryLike, MemoryScope, RankedMemory, RuleSpec, Situation, Workspace } from "@/brain/types";
import type { Influence } from "@/engines/quotation";

/**
 * Akram Brain — persistent memory service (VALIDATE → REMEMBER → APPLY → EVALUATE).
 *
 * Invariants (each has a regression test in tests/integration/brain-learning.test.ts):
 *  - nothing is used until a person APPROVES it; proposals are inert
 *  - an ASSUMPTION / SUGGESTION is never silently promoted: approving one requires an explicit confirmed kind
 *  - a rule that contradicts an approved rule for the same scope is stored as CONFLICTED and cannot be approved
 *    until the person decides which one is valid (the other is then SUPERSEDED, never deleted)
 *  - every content change creates a new version row; every use records memory id + version + session
 *  - PERSONAL / DEVELOPMENT memories are visible only to their owner; PARADIGM memories are visible to their
 *    owner and — only when shared — to the same company. Company scoping is always applied.
 */

export class MemoryNotFound extends Error {}

const CONFIRMABLE: Kind[] = ["FACT", "RULE", "PREFERENCE"];

export function visibleWhere(u: AuthUser, workspace: Workspace): Prisma.BrainMemoryWhereInput {
  const base = { companyId: u.companyId, workspace };
  return workspace === "PARADIGM" ? { ...base, OR: [{ ownerUserId: u.id }, { shared: true }] } : { ...base, ownerUserId: u.id };
}

export function toLike(r: BrainMemory): MemoryLike {
  return {
    id: r.id, version: r.version, kind: r.kind, category: r.category, title: r.title, content: r.content,
    rule: (r.rule as RuleSpec | null) ?? null, scope: ((r.scope as MemoryScope | null) ?? {}) as MemoryScope, keywords: r.keywords,
    evidence: r.evidence, approval: r.approval, validity: r.validity, expiresAt: r.expiresAt,
  };
}

async function loadOwn(u: AuthUser, id: string, tx: Prisma.TransactionClient = db) {
  // only the owner decides on, corrects or revokes a memory (shared memories are read-only for others)
  const m = await tx.brainMemory.findFirst({ where: { id, companyId: u.companyId, ownerUserId: u.id } });
  if (!m) throw new MemoryNotFound("Memory not found");
  return m;
}

/** OBSERVE → EXTRACT → VALIDATE: store proposals from an explicit instruction (or correction / decision). */
export async function proposeMemories(u: AuthUser, input: { workspace: Workspace; text: string; sourceType?: "INSTRUCTION" | "CORRECTION" | "DECISION" | "DOCUMENT"; sourceRef?: string | null }) {
  assertCan(u, "brain.use");
  const text = input.text.trim();
  if (!text || text.length > 4000) throw new Error("Teach one instruction at a time (1–4000 characters)");
  const drafts = extractMemoryDrafts(text).filter((d) => evidenceIsQuoted(d, text));
  if (!drafts.length) return [];
  const existing = (await db.brainMemory.findMany({ where: { ...visibleWhere(u, input.workspace), approval: "APPROVED", validity: "ACTIVE" } })).map(toLike);
  const created: BrainMemory[] = [];
  for (const d of drafts) {
    const conflict = findConflicts(d, existing)[0] ?? null;
    const m = await db.brainMemory.create({
      data: {
        companyId: u.companyId, workspace: input.workspace, ownerUserId: u.id, category: d.category, kind: d.kind, title: d.title, content: d.content,
        rule: (d.rule ?? undefined) as Prisma.InputJsonValue | undefined, scope: d.scope as Prisma.InputJsonValue, keywords: d.keywords,
        sourceType: input.sourceType ?? "INSTRUCTION", sourceRef: input.sourceRef ?? null, evidence: d.evidence, confidence: d.confidence,
        validity: conflict ? "CONFLICTED" : "ACTIVE", conflictWithId: conflict?.id ?? null,
        expiresAt: d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 86400000) : null,
        versions: { create: { version: 1, kind: d.kind, title: d.title, content: d.content, rule: (d.rule ?? undefined) as Prisma.InputJsonValue | undefined, scope: d.scope as Prisma.InputJsonValue, changedById: u.id, reason: "Proposed by the Brain from the user's own words" } },
      },
    });
    created.push(m);
  }
  await audit({ companyId: u.companyId, userId: u.id, action: "BRAIN_MEMORY_PROPOSED", entityType: "BrainMemory", details: { workspace: input.workspace, ids: created.map((c) => c.id), conflicts: created.filter((c) => c.conflictWithId).map((c) => c.id) } });
  return created;
}

/** VALIDATE: approve or reject a proposal. Single-winner (conditional claim) like every other approval. */
export async function decideMemory(u: AuthUser, id: string, d: { decision: "APPROVE" | "REJECT"; confirmKind?: Kind; supersedeConflicting?: boolean; note?: string }) {
  assertCan(u, "brain.use");
  return db.$transaction(async (tx) => {
    const m = await loadOwn(u, id, tx);
    if (m.approval !== "PROPOSED") throw new Error(`This memory was already ${m.approval.toLowerCase()}`);
    const now = new Date();
    if (d.decision === "REJECT") {
      const claimed = await tx.brainMemory.updateMany({ where: { id, approval: "PROPOSED" }, data: { approval: "REJECTED" } });
      if (claimed.count !== 1) throw new Error("This memory was already decided");
      await audit({ companyId: u.companyId, userId: u.id, action: "BRAIN_MEMORY_REJECTED", entityType: "BrainMemory", entityId: id, details: { note: d.note ?? null } });
      return tx.brainMemory.findUniqueOrThrow({ where: { id } });
    }

    let kind = m.kind;
    if (m.kind === "ASSUMPTION" || m.kind === "SUGGESTION") {
      if (!d.confirmKind || !CONFIRMABLE.includes(d.confirmKind)) {
        throw new Error(`This is ${m.kind === "ASSUMPTION" ? "an assumption" : "a suggestion"}, not a confirmed rule — confirm explicitly what it is (fact, rule or preference) to approve it`);
      }
      kind = d.confirmKind;
    }
    let supersededId: string | null = null;
    if (m.validity === "CONFLICTED") {
      const other = m.conflictWithId ? await tx.brainMemory.findFirst({ where: { id: m.conflictWithId, companyId: u.companyId } }) : null;
      if (other && other.approval === "APPROVED" && other.validity === "ACTIVE") {
        if (!d.supersedeConflicting) throw new Error(`This contradicts the approved memory "${other.title}" — decide which one is valid (approve this one and supersede the other, or reject this one)`);
        if (other.ownerUserId !== u.id) throw new AuthorizationError("The conflicting memory belongs to someone else — ask its owner");
        await tx.brainMemory.update({ where: { id: other.id }, data: { validity: "SUPERSEDED" } });
        supersededId = other.id;
      }
    }
    const claimed = await tx.brainMemory.updateMany({
      where: { id, approval: "PROPOSED" },
      data: { approval: "APPROVED", validity: "ACTIVE", kind, approvedById: u.id, approvedAt: now, lastValidatedAt: now, supersedesId: supersededId, version: kind !== m.kind ? m.version + 1 : m.version },
    });
    if (claimed.count !== 1) throw new Error("This memory was already decided");
    if (kind !== m.kind) {
      await tx.brainMemoryVersion.create({ data: { memoryId: id, version: m.version + 1, kind, title: m.title, content: m.content, rule: (m.rule ?? undefined) as Prisma.InputJsonValue | undefined, scope: (m.scope ?? undefined) as Prisma.InputJsonValue | undefined, changedById: u.id, reason: `Confirmed by the user: ${m.kind} → ${kind}${d.note ? ` (${d.note})` : ""}` } });
    }
    await audit({ companyId: u.companyId, userId: u.id, action: "BRAIN_MEMORY_APPROVED", entityType: "BrainMemory", entityId: id, details: { kind, promotedFrom: kind !== m.kind ? m.kind : null, superseded: supersededId } });
    return tx.brainMemory.findUniqueOrThrow({ where: { id } });
  });
}

/** Correction: a new version; history is kept. A correction of an approved memory is itself a validation. */
export async function correctMemory(u: AuthUser, id: string, c: { content?: string; title?: string; rule?: RuleSpec | null; scope?: MemoryScope; reason: string }) {
  assertCan(u, "brain.use");
  if (!c.reason?.trim()) throw new Error("Say why the memory changes");
  return db.$transaction(async (tx) => {
    const m = await loadOwn(u, id, tx);
    if (m.approval === "REJECTED" || m.approval === "REVOKED") throw new Error("Rejected or revoked memories cannot be corrected — teach it again");
    const next = {
      title: c.title ?? m.title, content: c.content ?? m.content,
      rule: (c.rule === undefined ? m.rule : c.rule) as Prisma.InputJsonValue | undefined, scope: (c.scope ?? m.scope ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    const version = m.version + 1;
    await tx.brainMemoryVersion.create({ data: { memoryId: id, version, kind: m.kind, ...next, rule: next.rule ?? undefined, changedById: u.id, reason: c.reason.trim() } });
    const updated = await tx.brainMemory.update({ where: { id }, data: { ...next, rule: next.rule ?? undefined, version, lastValidatedAt: m.approval === "APPROVED" ? new Date() : m.lastValidatedAt } });
    await audit({ companyId: u.companyId, userId: u.id, action: "BRAIN_MEMORY_CORRECTED", entityType: "BrainMemory", entityId: id, details: { version, reason: c.reason.trim() } });
    return updated;
  });
}

export async function revokeMemory(u: AuthUser, id: string, reason: string) {
  assertCan(u, "brain.use");
  const m = await loadOwn(u, id);
  if (m.approval !== "APPROVED") throw new Error("Only approved memories can be revoked");
  const r = await db.brainMemory.update({ where: { id }, data: { approval: "REVOKED" } });
  await audit({ companyId: u.companyId, userId: u.id, action: "BRAIN_MEMORY_REVOKED", entityType: "BrainMemory", entityId: id, details: { reason } });
  return r;
}

/** Share a PARADIGM memory with the company (it becomes company knowledge) — needs standards approval rights. */
export async function shareMemory(u: AuthUser, id: string) {
  assertCan(u, "brain.use");
  if (!can(u, "standards.approve")) throw new AuthorizationError("Only users who approve company standards can share a memory company-wide");
  const m = await loadOwn(u, id);
  if (m.workspace !== "PARADIGM") throw new Error("Personal and development memories are never shared");
  if (m.approval !== "APPROVED") throw new Error("Approve the memory before sharing it");
  const r = await db.brainMemory.update({ where: { id }, data: { shared: true } });
  await audit({ companyId: u.companyId, userId: u.id, action: "BRAIN_MEMORY_SHARED", entityType: "BrainMemory", entityId: id });
  return r;
}

/** CONNECT: approved, active, in-scope memories for a situation — strictly inside the user's workspace view. */
export async function recallMemories(u: AuthUser, workspace: Workspace, situation: Situation): Promise<RankedMemory[]> {
  assertCan(u, "brain.use");
  const rows = await db.brainMemory.findMany({ where: { ...visibleWhere(u, workspace), approval: "APPROVED", validity: "ACTIVE" } });
  return rankMemories(rows.map(toLike), situation);
}

/** EVALUATE: record exactly which memory (and version) influenced which output in which session. */
export async function recordApplications(u: AuthUser, a: { sessionId: string; contextType: string; contextRef?: string | null; influences: Influence[] }) {
  if (!a.influences.length) return [];
  return db.$transaction(
    a.influences.map((i) => db.brainMemoryApplication.create({ data: { memoryId: i.memoryId, memoryVersion: i.version, companyId: u.companyId, userId: u.id, sessionId: a.sessionId, contextType: a.contextType, contextRef: a.contextRef ?? null, effect: { effect: i.effect } } })),
  );
}

/** Memory & Learning Center read model */
export async function listMemories(u: AuthUser, workspace: Workspace) {
  assertCan(u, "brain.use");
  const rows = await db.brainMemory.findMany({ where: visibleWhere(u, workspace), orderBy: [{ updatedAt: "desc" }], take: 300, include: { _count: { select: { applications: true } } } });
  return rows.map((r) => ({ ...toLike(r), category: r.category, shared: r.shared, mine: r.ownerUserId === u.id, confidence: r.confidence, sourceType: r.sourceType, conflictWithId: r.conflictWithId, createdAt: r.createdAt, lastValidatedAt: r.lastValidatedAt, uses: r._count.applications }));
}
