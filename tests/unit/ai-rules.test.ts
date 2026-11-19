import { describe, expect, it } from "vitest";
import { extractRuleBased } from "@/ai/rules";
import { missingProduction } from "@/ai/validate";

describe("rule-based conversational extraction", () => {
  it("extracts the spec example without inventing values", () => {
    const r = extractRuleBased("We need an 8-meter wide, 3-meter high wooden backdrop, MDF finishing, painted black, installation during the first setup day.");
    const d = r.production[0];
    expect(r.department).toBe("PRODUCTION");
    expect(d.category).toBe("BACKDROP");
    expect(d.widthM).toBe(8);
    expect(d.heightM).toBe(3);
    expect(d.material).toBe("MDF");
    expect(d.color).toBe("black");
    expect(d.installationDay).toBe(1);
    expect(d.depthM).toBeNull();
    expect(d.paintCoats).toBeNull();
    expect(d.thicknessMm).toBeNull();
    expect(r.evidence.some((e) => e.field === "widthM" && e.snippet.includes("8-meter wide"))).toBe(true);
  });

  it("asks follow-up questions for everything that was not stated", () => {
    const d = extractRuleBased("We need an 8-meter wide, 3-meter high wooden backdrop, MDF finishing, painted black, installation during the first setup day.").production[0];
    const fields = missingProduction(d).map((m) => m.field);
    expect(fields).toEqual(expect.arrayContaining(["depthM", "thicknessMm", "paintCoats", "drawing"]));
    expect(fields).not.toContain("widthM");
  });

  it("converts units and parses W × H × D notation", () => {
    const d = extractRuleBased("Registration counter 240 cm x 100 cm x 60 cm in MDF 18mm board with vinyl wrap").production[0];
    expect([d.widthM, d.heightM, d.depthM]).toEqual([2.4, 1, 0.6]);
    expect(d.thicknessMm).toBe(18);
    expect(d.category).toBe("COUNTER");
  });

  it("extracts AV quantities and backups", () => {
    const r = extractRuleBased("We need 84 LED panels plus 6 spare and 8 wireless microphones");
    expect(r.department).toBe("AV");
    const led = r.av.find((a) => a.category === "LED_SCREEN")!;
    expect(led.quantity).toBe(84);
    expect(led.backupQuantity).toBe(6);
    expect(r.av.find((a) => a.category === "MICROPHONE")!.quantity).toBe(8);
  });
});
