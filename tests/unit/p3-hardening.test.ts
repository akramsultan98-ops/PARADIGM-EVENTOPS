import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";
import { verifyEvidence } from "@/ai/extract";
import type { Extraction } from "@/ai/types";

const H = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("P3 rate-limit client IP behind proxies", () => {
  it("ignores a client-supplied X-Forwarded-For when no trusted proxy is configured", () => {
    expect(clientIp(H("6.6.6.6"), 0)).toBe("untrusted-proxy");
    expect(clientIp(H("1.1.1.1, 2.2.2.2"), 0)).toBe(clientIp(H("9.9.9.9"), 0)); // rotating the header gains nothing
  });
  it("uses the entry appended by the trusted proxy (rightmost N), not the spoofable left side", () => {
    expect(clientIp(H("6.6.6.6, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIp(H("6.6.6.6, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
    expect(clientIp(H(""), 1)).toBe("unknown");
    expect(clientIp(H("<script>"), 1)).toBe("unknown");
  });
});

describe("P3 AI evidence must be quoted from the input", () => {
  const ex = (evidence: { field: string; snippet: string }[]): Extraction => ({ department: "PRODUCTION", production: [], av: [], evidence, assumptionsMade: [], engine: "AI" });
  const text = "We need a 4 meter wide,\n2.4 meter high partition wall for the VIP lounge, MDF painted white.";
  it("keeps real quotes (case/whitespace-insensitive) and removes invented ones", () => {
    const r = verifyEvidence(text, ex([{ field: "widthM", snippet: "4 meter wide, 2.4 meter high" }, { field: "material", snippet: "mdf PAINTED white" }, { field: "thicknessMm", snippet: "18 mm MDF" }, { field: "x", snippet: "" }]));
    expect(r.evidence.map((e) => e.field)).toEqual(["widthM", "material"]);
    expect(r.assumptionsMade.join(" ")).toMatch(/Unverified evidence removed for "thicknessMm"/);
  });
  it("leaves fully verified extractions untouched", () => {
    const e = ex([{ field: "widthM", snippet: "4 meter wide" }]);
    expect(verifyEvidence(text, e)).toBe(e);
  });
});

describe("Codex P2: rate-limit memory is bounded", () => {
  it("sweeps expired buckets and never grows past its cap", async () => {
    const { rateLimit, rateLimitStats, __resetRateLimits } = await import("@/lib/rate-limit");
    __resetRateLimits();
    const real = Date.now;
    let now = real();
    Date.now = () => now;
    try {
      for (let i = 0; i < 2000; i++) rateLimit(`k${i}`, 1, 1000);
      expect(rateLimitStats().keys).toBe(2000);
      now += 61_000; // all windows expired and the sweep interval passed
      rateLimit("fresh", 1, 1000);
      expect(rateLimitStats().keys).toBe(1);
      const cap = rateLimitStats().maxKeys;
      for (let i = 0; i < cap + 500; i++) rateLimit(`live${i}`, 1, 3_600_000);
      expect(rateLimitStats().keys).toBeLessThanOrEqual(cap);
    } finally { Date.now = real; __resetRateLimits(); }
  });
});
