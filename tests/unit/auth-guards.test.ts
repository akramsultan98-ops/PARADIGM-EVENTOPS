import { afterEach, describe, expect, it, vi } from "vitest";
import { safeNext } from "@/lib/auth/redirect";
import { demoLoginEnabled, demoPassword } from "@/lib/auth/demo";

describe("safeNext (open-redirect guard)", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNext("/projects/abc?tab=plan")).toBe("/projects/abc?tab=plan");
  });
  it.each([undefined, null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/\nx", "/\u0000x", "javascript:alert(1)"])("rejects %j", (v) => {
    expect(safeNext(v as string | undefined)).toBe("/dashboard");
  });
});

describe("demo login gating", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is off unless ENABLE_DEMO_LOGIN=true", () => {
    vi.stubEnv("ENABLE_DEMO_LOGIN", "false");
    expect(demoLoginEnabled()).toBe(false);
  });
  it("is on in development when enabled", () => {
    vi.stubEnv("ENABLE_DEMO_LOGIN", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(demoLoginEnabled()).toBe(true);
  });
  it("is ignored in production without the explicit second opt-in", () => {
    vi.stubEnv("ENABLE_DEMO_LOGIN", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(demoLoginEnabled()).toBe(false);
    vi.stubEnv("ALLOW_DEMO_LOGIN_IN_PRODUCTION", "true");
    expect(demoLoginEnabled()).toBe(true);
  });
  it("uses DEMO_PASSWORD when provided", () => {
    vi.stubEnv("DEMO_PASSWORD", "custom-dev-pass");
    expect(demoPassword()).toBe("custom-dev-pass");
  });
});
