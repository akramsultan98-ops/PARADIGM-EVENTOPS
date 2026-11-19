import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { DemoBanner, StatusBadge } from "@/components/ui/kit";
import { ProjectTabs } from "@/components/project/tabs-nav";
import { ProjectActions } from "@/components/project/project-actions";
import { daysUntil, fmtDate } from "@/lib/format";
import { getPlan } from "@/server/queries/plans";
import { canReadFinancials } from "@/lib/financial";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const { locale } = await getDict();
  const p = await db.project.findFirst({ where: { ...projectScope(u), id }, include: { venue: true } });
  if (!p) notFound();
  const plan = await getPlan(p.id);
  const days = daysUntil(p.eventStart);
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-2xs font-semibold uppercase tracking-[0.14em] text-primary"><Link href="/projects" className="hover:underline">Projects</Link><span>/</span><span>{p.code}</span></div>
          <div className="mt-1 flex flex-wrap items-center gap-2"><h1 className="page-title">{p.name}</h1><StatusBadge status={p.status} locale={locale} />{plan && <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">plan v{plan.version} · {plan.status.replace("_", " ").toLowerCase()}</span>}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{p.client}</span>
            <span className="flex items-center gap-1"><MapPin className="size-3.5" />{p.venue?.name ?? p.location}</span>
            <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{fmtDate(p.eventStart, locale)} {days >= 0 ? `· in ${days} days` : ""}</span>
            <span className="flex items-center gap-1"><Users className="size-3.5" />{p.participants} participants</span>
          </div>
        </div>
        <ProjectActions projectId={p.id} status={p.status} can={{ generate: u.permissions.has("plan.generate") && !["COMPLETED", "CANCELLED"].includes(p.status), export: u.permissions.has("export.run") && !!plan, edit: u.permissions.has("project.edit") }} />
      </div>
      {p.isDemo && <div className="mb-3"><DemoBanner /></div>}
      <ProjectTabs projectId={p.id} hidden={canReadFinancials(u) ? [] : ["budget"]} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
