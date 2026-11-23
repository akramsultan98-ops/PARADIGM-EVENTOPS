import { clientKey, detectClient, detectSector, sectorOfClient } from "./clients";
import { keywordsOf } from "./extract";
import type { MemoryDraft, MemoryLike, MemoryScope, RankedMemory, Sector, Situation } from "./types";

/**
 * CONNECT → APPLY: decides which APPROVED memories bear on a situation.
 * Scope is a hard filter (a UN rule never fires for a corporate client); keywords only rank.
 */

export function situationFrom(text: string, given: { client?: string | null; sector?: Sector | null } = {}): Situation {
  const client = given.client ? clientKey(given.client) : detectClient(text)?.client ?? null;
  const sector = given.sector ?? (client ? sectorOfClient(client) : null) ?? detectSector(text);
  return { text, client, sector, keywords: keywordsOf(text, 30) };
}

export function scopeMatches(scope: MemoryScope, s: Situation): boolean {
  if (scope.client && scope.client !== s.client) return false;
  if (scope.sector && scope.sector !== s.sector) return false;
  return true;
}

/** client-specific beats sector-wide beats default */
export function specificity(scope: MemoryScope): number {
  return scope.client ? 2 : scope.sector ? 1 : 0;
}

export function isUsable(m: MemoryLike, now: Date): boolean {
  return m.approval === "APPROVED" && m.validity === "ACTIVE" && !(m.expiresAt && m.expiresAt.getTime() <= now.getTime());
}

export function rankMemories(memories: MemoryLike[], s: Situation, now = new Date()): RankedMemory[] {
  const out: RankedMemory[] = [];
  for (const m of memories) {
    if (!isUsable(m, now) || !scopeMatches(m.scope, s)) continue;
    const overlap = m.keywords.filter((k) => s.keywords.includes(k));
    const spec = specificity(m.scope);
    const reasons: string[] = [];
    if (m.scope.client) reasons.push(`client = ${m.scope.client}`);
    else if (m.scope.sector) reasons.push(`sector = ${m.scope.sector}`);
    if (overlap.length) reasons.push(`shared terms: ${overlap.slice(0, 5).join(", ")}`);
    // structured rules apply whenever their scope matches; narrative memories must also be about the same thing
    const relevant = m.rule ? true : spec > 0 ? overlap.length >= 1 : overlap.length >= 2;
    if (!relevant) continue;
    if (m.rule && !reasons.length) reasons.push("default rule (no scope)");
    out.push({ memory: m, specificity: spec, score: spec * 10 + overlap.length, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.memory.id.localeCompare(b.memory.id));
}

function sameScope(a: MemoryScope, b: MemoryScope): boolean {
  return (a.client ?? null) === (b.client ?? null) && (a.sector ?? null) === (b.sector ?? null);
}

/**
 * VALIDATE: a new rule that gives a different value for the same rule type and the same scope as an approved
 * rule is a conflict. The Brain does not pick a winner — a person must decide which one is valid.
 */
export function findConflicts(draft: Pick<MemoryDraft, "rule" | "scope">, existing: MemoryLike[]): MemoryLike[] {
  if (!draft.rule) return [];
  return existing.filter(
    (m) => m.approval === "APPROVED" && m.validity === "ACTIVE" && m.rule && m.rule.type === draft.rule!.type && sameScope(m.scope, draft.scope) && m.rule.value !== draft.rule!.value,
  );
}
