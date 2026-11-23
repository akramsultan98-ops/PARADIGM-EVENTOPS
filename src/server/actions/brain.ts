"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { correctMemory, decideMemory, proposeMemories, revokeMemory, shareMemory } from "@/server/services/brain";
import { run } from "./_util";

const WS = z.enum(["PARADIGM", "PERSONAL", "DEVELOPMENT"]);
const KIND = z.enum(["FACT", "RULE", "PREFERENCE"]);

export async function teachAction(input: unknown) {
  return run(async () => {
    const u = await requireUser();
    const d = z.object({ workspace: WS, text: z.string().min(1).max(4000) }).parse(input);
    const created = await proposeMemories(u, { workspace: d.workspace, text: d.text, sourceType: "INSTRUCTION" });
    revalidatePath("/brain");
    if (!created.length) return { ok: false as const, error: "Nothing to remember was found — start with “Remember…”, “From now on…” or “Always…”" };
    return { ok: true as const, data: created.map((c) => c.id), message: `${created.length} memory proposal(s) waiting for your approval` };
  });
}

export async function decideMemoryAction(input: unknown) {
  return run(async () => {
    const u = await requireUser();
    const d = z.object({ id: z.string().min(1), decision: z.enum(["APPROVE", "REJECT"]), confirmKind: KIND.optional(), supersedeConflicting: z.boolean().optional(), note: z.string().max(500).optional() }).parse(input);
    await decideMemory(u, d.id, d);
    revalidatePath("/brain");
  }, "Saved");
}

export async function correctMemoryAction(input: unknown) {
  return run(async () => {
    const u = await requireUser();
    const d = z.object({ id: z.string().min(1), content: z.string().min(1).max(4000), reason: z.string().min(3).max(500) }).parse(input);
    await correctMemory(u, d.id, { content: d.content, reason: d.reason });
    revalidatePath("/brain");
  }, "Corrected — the previous version is kept in history");
}

export async function revokeMemoryAction(input: unknown) {
  return run(async () => {
    const u = await requireUser();
    const d = z.object({ id: z.string().min(1), reason: z.string().min(3).max(500) }).parse(input);
    await revokeMemory(u, d.id, d.reason);
    revalidatePath("/brain");
  }, "Revoked — it will no longer be applied");
}

export async function shareMemoryAction(input: unknown) {
  return run(async () => {
    const u = await requireUser();
    const d = z.object({ id: z.string().min(1) }).parse(input);
    await shareMemory(u, d.id);
    revalidatePath("/brain");
  }, "Shared with the company");
}
