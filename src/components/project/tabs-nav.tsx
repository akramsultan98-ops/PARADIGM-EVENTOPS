"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const PROJECT_TABS = [
  ["overview", "Overview"], ["brief", "Project Brief"], ["inputs", "Department Inputs"], ["planning", "Master Planning"], ["production", "Production"], ["av", "AV & Technical"],
  ["logistics", "Logistics"], ["accommodation", "Accommodation"], ["creative", "Creative & Branding"], ["timeline", "Timeline"], ["gantt", "Gantt"], ["boq", "BOQ"],
  ["manpower", "Manpower"], ["procurement", "Procurement"], ["risks", "Risk Register"], ["budget", "Budget"], ["execution", "Site Execution"], ["documents", "Documents"],
  ["approvals", "Approvals"], ["activity", "Activity History"],
] as const;

/** `hidden` is cosmetic only — every tab is authorised again on the server. */
export function ProjectTabs({ projectId, hidden = [] }: { projectId: string; hidden?: string[] }) {
  const path = usePathname();
  const current = path.split("/")[3] ?? "overview";
  return (
    <nav className="scrollbar-thin -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" aria-label="Project sections">
      <ul className="flex min-w-max gap-0.5">
        {PROJECT_TABS.filter(([key]) => !hidden.includes(key)).map(([key, label]) => (
          <li key={key}>
            <Link href={key === "overview" ? `/projects/${projectId}` : `/projects/${projectId}/${key}`} aria-current={current === key ? "page" : undefined}
              className={cn("-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors", current === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
