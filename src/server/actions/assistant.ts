"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { rateLimit } from "@/lib/rate-limit";
import { assistantRespond } from "@/ai/assistant";
import { run } from "./_util";

export async function askAssistantAction(projectId: string | null, history: { role: "user" | "assistant"; content: string }[], message: string) {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "ai.use");
    if (!rateLimit(`ai:${u.id}`, 40, 10 * 60_000)) throw new Error("Assistant rate limit reached — please wait a few minutes");
    const msg = z.string().trim().min(1).max(4000).parse(message);
    if (projectId) await db.project.findFirstOrThrow({ where: { ...projectScope(u), id: projectId } });
    const h = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20000) })).max(30).parse(history);
    const r = await assistantRespond(u, projectId, h, msg);
    await db.auditLog.create({ data: { companyId: u.companyId, userId: u.id, projectId, action: "AI_ASSISTANT_QUERY", entityType: "Assistant", details: { engine: r.engine, tools: r.toolsUsed, chars: msg.length } } });
    return r;
  });
}
