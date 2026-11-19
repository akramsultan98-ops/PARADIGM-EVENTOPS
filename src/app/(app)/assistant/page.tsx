import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { aiEnabled, MODEL } from "@/ai/provider";
import { PageHeader } from "@/components/ui/kit";
import { Badge } from "@/components/ui/badge";
import { AssistantChat } from "./chat";

export const metadata = { title: "AI assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requirePermission("ai.use");
  const { project } = await searchParams;
  const projects = await db.project.findMany({ where: { ...projectScope(u), status: { notIn: ["CANCELLED"] } }, select: { id: true, name: true }, orderBy: { eventStart: "asc" } });
  const enabled = aiEnabled();
  return (
    <>
      <PageHeader eyebrow="AI project orchestrator" title="AI assistant" description="Ask about readiness, missing information, quantities, crew, transport, schedule, risks or run what-if scenarios. Answers come from the deterministic engines through typed tools — the assistant never invents numbers."
        actions={<Badge variant={enabled ? "violet" : "secondary"}>{enabled ? `Claude · ${MODEL()}` : "Rule-based mode (no API key configured)"}</Badge>} />
      <AssistantChat projects={projects} defaultProject={project ?? projects[0]?.id ?? null} userName={u.name} />
    </>
  );
}
