import "server-only";
import { AuthorizationError } from "@/lib/auth/session";
import { ZodError } from "zod";

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Uniform, safe error handling for server actions (no stack traces or internals leak to clients). */
export async function run<T>(fn: () => Promise<T | ActionResult<T>>, okMessage?: string): Promise<ActionResult<T>> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "ok" in (r as object)) return r as ActionResult<T>;
    return { ok: true, data: r as T, message: okMessage };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") return { ok: false, error: "This was already done by someone else (duplicate) — reload and check" };
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[action]", e);
    // Prisma internals are not exposed verbatim
    return { ok: false, error: /prisma|invocation/i.test(msg) ? "The operation could not be completed (database constraint). Please check the data and try again." : msg };
  }
}
