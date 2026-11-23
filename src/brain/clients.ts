import type { Sector } from "./types";

/**
 * Organisation recognition used for memory scope and situation matching.
 * Deliberately small and explicit: an unknown organisation is NOT guessed into a sector —
 * it simply has no sector, so sector-scoped rules do not fire for it.
 * Extend this list through code review (later: from the Event Ledger's organisation table).
 */
interface Known { key: string; sector: Sector; pattern: RegExp }

const KNOWN: Known[] = [
  { key: "un-women", sector: "UN", pattern: /\b(UN[\s-]?Women|UNW)\b/i },
  { key: "unicef", sector: "UN", pattern: /\bUNICEF\b/i },
  { key: "undp", sector: "UN", pattern: /\bUNDP\b/i },
  { key: "unfpa", sector: "UN", pattern: /\bUNFPA\b/i },
  { key: "unhcr", sector: "UN", pattern: /\bUNHCR\b/i },
  { key: "unido", sector: "UN", pattern: /\bUNIDO\b/i },
  { key: "unesco", sector: "UN", pattern: /\bUNESCO\b/i },
  { key: "wfp", sector: "UN", pattern: /\b(WFP|World Food Programme)\b/i },
  { key: "ilo", sector: "UN", pattern: /\b(ILO|International Labour Organi[sz]ation)\b/i },
  { key: "who", sector: "UN", pattern: /\bWHO\b/ },
  { key: "iom", sector: "UN", pattern: /\bIOM\b/ },
  { key: "fao", sector: "UN", pattern: /\bFAO\b/ },
  { key: "giz", sector: "GOVERNMENT", pattern: /\bGIZ\b/i },
  { key: "central-bank-of-egypt", sector: "GOVERNMENT", pattern: /\b(Central Bank of Egypt|CBE)\b/i },
  { key: "itida", sector: "GOVERNMENT", pattern: /\bITIDA\b/i },
];

/** generic words that name a sector without naming a client */
const SECTOR_WORDS: { sector: Sector; pattern: RegExp }[] = [
  // "UN" is matched case-sensitively so the English word "un-" / "un" never triggers it
  { sector: "UN", pattern: /\b(UN|U\.N\.)\b|\bUnited Nations\b|الأمم المتحدة/ },
  { sector: "GOVERNMENT", pattern: /\b(ministry|ministries|governorate|government|governmental|public authority)\b|وزارة|محافظة|حكوم/i },
  { sector: "EMBASSY", pattern: /\bembass(y|ies)\b|سفارة/i },
  { sector: "NGO", pattern: /\b(NGO|NGOs|non-?profit|foundation)\b/i },
  { sector: "CORPORATE", pattern: /\b(corporate|private[- ]sector|private compan(y|ies))\b|شركات/i },
];

export function detectClient(text: string): { client: string; sector: Sector } | null {
  for (const k of KNOWN) if (k.pattern.test(text)) return { client: k.key, sector: k.sector };
  return null;
}

export function detectSector(text: string): Sector | null {
  const c = detectClient(text);
  if (c) return c.sector;
  for (const s of SECTOR_WORDS) if (s.pattern.test(text)) return s.sector;
  return null;
}

/** "UN Women" → "un-women"; unknown names are normalised, not mapped to a sector */
export function clientKey(name: string): string {
  const k = detectClient(name);
  if (k) return k.client;
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

export function sectorOfClient(key: string): Sector | null {
  return KNOWN.find((k) => k.key === key)?.sector ?? null;
}
