import Link from "next/link";
import { cn } from "@/lib/utils";
/** Shared project chip selector for top-level pages (server component). */
export function ProjectPicker({ base, projects, current }: { base: string; projects: { id: string; name: string }[]; current?: string }) {
  return (
    <div className="scrollbar-thin mb-4 flex gap-1.5 overflow-x-auto pb-1">
      {projects.map((p) => <Link key={p.id} href={`${base}?project=${p.id}`} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", current === p.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{p.name}</Link>)}
    </div>
  );
}
