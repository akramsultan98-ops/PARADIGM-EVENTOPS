import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { PageHeader } from "@/components/ui/kit";
import { ProductionWizard } from "./wizard";

export const metadata = { title: "Add production requirements" };

export default async function NewProductionPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requirePermission("submission.create");
  const { project } = await searchParams;
  const [projects, materials] = await Promise.all([
    db.project.findMany({ where: { ...projectScope(u), status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, name: true, code: true, setupStart: true }, orderBy: { eventStart: "asc" } }),
    db.material.findMany({ where: { companyId: u.companyId }, orderBy: [{ category: "asc" }, { code: "asc" }] }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Production · structured input" title="Add production requirements" description="Ten guided steps. Drafts are saved automatically on this device and can be saved to the project at any step. Specifications are validated before planning — nothing is approved automatically." />
      <ProductionWizard projects={projects.map((p) => ({ id: p.id, name: `${p.name} (${p.code})` }))} defaultProject={project} materials={materials.map((m) => ({ id: m.id, code: m.code, name: m.name, category: m.category, unit: m.unit, stockLengthM: m.stockLengthM, stockWidthM: m.stockWidthM, status: m.status }))} />
    </>
  );
}
