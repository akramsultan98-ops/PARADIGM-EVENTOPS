"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Cpu, FileSpreadsheet, FileText, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { toast } from "@/components/ui/toast";
import { generatePlanAction, updateProjectStatusAction } from "@/server/actions/projects";

const NEXT: Record<string, string[]> = { LEAD: ["PLANNING", "CANCELLED"], PLANNING: ["AWAITING_INPUTS", "CANCELLED"], AWAITING_INPUTS: ["PLANNING", "CANCELLED"], UNDER_REVIEW: ["PLANNING", "CANCELLED"], APPROVED: ["IN_PREPARATION", "CANCELLED"], IN_PREPARATION: ["IN_EXECUTION"], IN_EXECUTION: ["COMPLETED"] };

export function ProjectActions({ projectId, status, can }: { projectId: string; status: string; can: { generate: boolean; export: boolean; edit: boolean } }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const generate = () => start(async () => {
    const r = await generatePlanAction(projectId);
    if (r.ok) { const d = r.data as { version: number; errors: number; warnings: number; feasible: boolean }; toast(`Plan v${d.version} generated`, { description: `${d.errors} errors · ${d.warnings} warnings · ${d.feasible ? "feasible" : "conflicts detected"} — submitted for review` }); router.push(`/projects/${projectId}/planning`); router.refresh(); }
    else toast(r.error, { tone: "error" });
  });
  return (
    <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
      {can.generate && <Button onClick={generate} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Cpu />}Generate plan</Button>}
      {can.export && <Button variant="outline" asChild><a href={`/api/projects/${projectId}/workbook`}><FileSpreadsheet />Master workbook</a></Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          {can.export && <DropdownMenuItem asChild><a href={`/api/projects/${projectId}/report`}><FileText />PDF plan report</a></DropdownMenuItem>}
          {can.edit && (NEXT[status]?.length ?? 0) > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel>Change status</DropdownMenuLabel>
            {NEXT[status].map((s) => <DropdownMenuItem key={s} onSelect={() => start(async () => { const r = await updateProjectStatusAction(projectId, s); if (r.ok) { toast("Status updated"); router.refresh(); } else toast(r.error, { tone: "error" }); })}>{s.replace(/_/g, " ").toLowerCase()}</DropdownMenuItem>)}</>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
