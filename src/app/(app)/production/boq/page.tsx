import { requireUser } from "@/lib/auth/session";
import { getDict } from "@/i18n/server";
import { departmentProjects } from "@/server/queries/departments";
import { PageHeader } from "@/components/ui/kit";
import { BoqTable, CuttingPlans, IssuesPanel, NoPlan, ProductionItemsMetrics } from "@/components/planning/panels";
import { ProjectPicker } from "../../_project-picker";
import { Button } from "@/components/ui/button";

export const metadata = { title: "BOQ review" };

export default async function BoqReviewPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requireUser();
  const { locale } = await getDict();
  const { project } = await searchParams;
  const { projects, plans, focus } = await departmentProjects(u, "PRODUCTION");
  const current = project ? projects.find((p) => p.id === project) ?? focus : focus;
  const pl = current ? plans.get(current.id) : null;
  return (
    <>
      <PageHeader eyebrow="Production" title="BOQ review" description="Material quantities, cutting plans and assumptions before technical approval. Calculation traces show formula, inputs and units for every figure."
        actions={current && pl && <Button variant="outline" asChild><a href={`/api/projects/${current.id}/workbook?sheets=production`}>Export production sheets</a></Button>} />
      <ProjectPicker base="/production/boq" projects={projects} current={current?.id} />
      {current && pl ? (
        <div className="space-y-5">
          <BoqTable plan={pl.plan} locale={locale} />
          <ProductionItemsMetrics plan={pl.plan} locale={locale} />
          <CuttingPlans plan={pl.plan} />
          <IssuesPanel issues={pl.plan.issues.filter((i) => i.department === "PRODUCTION")} title="Assumptions & missing specifications" />
        </div>
      ) : <NoPlan projectId={current?.id} canGenerate />}
    </>
  );
}
