/**
 * Akram Brain — pure types for the persistent memory & learning engine.
 * No database, no I/O: everything in src/brain/** is deterministic and unit-tested.
 */

export type Sector = "UN" | "GOVERNMENT" | "EMBASSY" | "NGO" | "CORPORATE";
export const SECTORS: Sector[] = ["UN", "GOVERNMENT", "EMBASSY", "NGO", "CORPORATE"];

export type Workspace = "PARADIGM" | "PERSONAL" | "DEVELOPMENT";

export type Category =
  | "WORKING_PREFERENCE"
  | "PROFESSIONAL_KNOWLEDGE"
  | "OPERATIONAL_RULE"
  | "CLIENT_KNOWLEDGE"
  | "VENDOR_KNOWLEDGE"
  | "EVENT_HISTORY"
  | "COMMUNICATION_PREFERENCE"
  | "DECISION_LESSON"
  | "PROCEDURE"
  | "ACTIVE_CONTEXT";

export type Kind = "FACT" | "RULE" | "PREFERENCE" | "ASSUMPTION" | "SUGGESTION";
export type Approval = "PROPOSED" | "APPROVED" | "REJECTED" | "REVOKED";
export type Validity = "ACTIVE" | "CONFLICTED" | "SUPERSEDED" | "EXPIRED";

export type Currency = "USD" | "EGP" | "EUR";

/** Structured rules the system can apply deterministically. Anything else stays a narrative memory. */
export type RuleSpec =
  | { type: "margin_percent"; value: number }
  | { type: "quote_currency"; value: Currency };

/** Where a memory applies. Empty = everywhere in its workspace. `client` is a normalised key (see clients.ts). */
export interface MemoryScope {
  sector?: Sector;
  client?: string;
}

/** A memory proposed by the extractor — never used until a person approves it. */
export interface MemoryDraft {
  category: Category;
  kind: Kind;
  title: string;
  content: string;
  rule: RuleSpec | null;
  scope: MemoryScope;
  keywords: string[];
  /** exact words from the source text that justify this memory */
  evidence: string;
  confidence: number;
  expiresInDays?: number;
}

/** The shape the matcher and pricing engine need from a stored memory. */
export interface MemoryLike {
  id: string;
  version: number;
  kind: Kind;
  category: Category;
  title: string;
  content: string;
  rule: RuleSpec | null;
  scope: MemoryScope;
  keywords: string[];
  evidence: string;
  approval: Approval;
  validity: Validity;
  expiresAt?: Date | null;
}

/** What the Brain knows about the situation it is asked to act on. */
export interface Situation {
  text: string;
  sector: Sector | null;
  client: string | null;
  keywords: string[];
}

export interface RankedMemory {
  memory: MemoryLike;
  score: number;
  specificity: number;
  reasons: string[];
}
