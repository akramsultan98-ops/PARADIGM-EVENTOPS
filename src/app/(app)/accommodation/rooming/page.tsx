import { requireUser } from "@/lib/auth/session";
import { getDict } from "@/i18n/server";
import { departmentProjects } from "@/server/queries/departments";
import { PageHeader } from "@/components/ui/kit";
import { Button } from "@/components/ui/button";
import { IssuesPanel, NoPlan, RoomingPanel } from "@/components/planning/panels";
import { ProjectPicker } from "../../_project-picker";
import Link from "next/link";

export const metadata = { title: "Rooming list" };

export default async function RoomingPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requireUser();
  const { locale } = await getDict();
  const { project } = await searchParams;
  const { projects, plans, focus } = await departmentProjects(u, "ACCOMMODATION");
  const current = project ? projects.find((p) => p.id === project) ?? focus : focus;
  const pl = current ? plans.get(current.id) : null;
  return (
    <>
      <PageHeader eyebrow="Accommodation" title="Rooming list" description="Rooms, sharing, room nights and costs as calculated from the staff list. Edit guests in the project's accommodation tab."
        actions={current && <><Button variant="outline" asChild><Link href={`/projects/${current.id}/accommodation`}>Edit guests</Link></Button>{pl && <Button asChild><a href={`/api/projects/${current.id}/workbook?sheets=accommodation`}>Export rooming list</a></Button>}</>} />
      <ProjectPicker base="/accommodation/rooming" projects={projects} current={current?.id} />
      {pl ? <div className="space-y-5"><RoomingPanel plan={pl.plan} locale={locale} /><IssuesPanel issues={pl.plan.issues.filter((i) => i.department === "ACCOMMODATION")} title="Missing names, overlaps, capacity and confirmations" /></div> : <NoPlan projectId={current?.id} canGenerate />}
    </>
  );
}
