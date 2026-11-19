import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { PageHeader } from "@/components/ui/kit";
import { AvForm } from "./form";

export const metadata = { title: "AV requirements" };

export default async function NewAvPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requirePermission("submission.create");
  const { project } = await searchParams;
  const [projects, equipment] = await Promise.all([
    db.project.findMany({ where: { ...projectScope(u), status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, name: true }, orderBy: { eventStart: "asc" } }),
    db.equipment.findMany({ where: { companyId: u.companyId }, include: { inventory: true }, orderBy: [{ category: "asc" }, { code: "asc" }] }),
  ]);
  return (
    <>
      <PageHeader eyebrow="AV & Technical" title="AV requirements form" description="Select inventory models so the system can check availability, rentals, power, weight and technician time." />
      <AvForm projects={projects} defaultProject={project} equipment={equipment.map((e) => ({ id: e.id, code: e.code, model: e.model, category: e.category, owned: e.inventory.reduce((s, i) => s + i.quantity - i.outOfService, 0), powerW: e.powerW }))} />
    </>
  );
}
