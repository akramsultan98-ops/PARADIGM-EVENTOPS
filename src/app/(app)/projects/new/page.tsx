import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/kit";
import { DEPARTMENTS } from "@/lib/permissions";
import { ProjectWizard } from "./wizard";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  const u = await requirePermission("project.create");
  const [venues, users] = await Promise.all([
    db.eventVenue.findMany({ where: { companyId: u.companyId }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { companyId: u.companyId, active: true, deletedAt: null }, include: { role: true, memberships: { include: { department: true } } }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Project creation wizard" title="Create an event project" description="Capture the brief, dates and venue, assign participating departments and their deadlines. Departments are notified to submit their requirements." />
      <ProjectWizard
        venues={venues.map((v) => ({ id: v.id, name: v.name, city: v.city, accessOpens: v.accessOpens, accessCloses: v.accessCloses }))}
        users={users.map((x) => ({ id: x.id, name: x.name, role: x.role.key, departments: x.memberships.map((m) => m.department.key) }))}
        departments={DEPARTMENTS.filter((d) => !["FINANCE", "MANAGEMENT", "PMO"].includes(d.key)).map((d) => ({ key: d.key, name: d.name }))}
        currentUserId={u.id}
      />
    </>
  );
}
