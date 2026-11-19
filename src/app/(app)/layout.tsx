import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { buildNav } from "@/config/nav";
import { projectScope } from "@/lib/scope";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { pendingApprovalsWhere } from "@/server/services/approvals";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const [projects, notifications, unread, approvals, myTasks] = await Promise.all([
    db.project.findMany({ where: projectScope(u), select: { id: true, code: true, name: true, status: true }, orderBy: { eventStart: "asc" } }),
    db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.notification.count({ where: { userId: u.id, readAt: null } }),
    db.approval.count({ where: pendingApprovalsWhere(u) }),
    db.task.count({ where: { project: projectScope(u), status: { in: ["NOT_STARTED", "IN_PROGRESS", "DELAYED", "BLOCKED"] }, OR: [{ assignees: { some: { userId: u.id } } }, { departmentId: { in: u.departments.map((d) => d.id) } }] } }),
  ]);
  const sections = buildNav(u, t, { approvals, notifications: unread, tasks: myTasks });
  const dept = u.departments[0];
  return (
    <div className="min-h-dvh">
      <Sidebar sections={sections} company={u.companyName} />
      <div className="lg:ps-64">
        <Suspense fallback={<div className="h-16 border-b bg-card" />}>
          <Header
            user={{ name: u.name, roleName: u.roleName, department: dept ? (locale === "ar" ? dept.name : dept.name) : null, email: u.email, jobTitle: u.jobTitle }}
            projects={projects}
            notifications={notifications.map((n) => ({ id: n.id, title: n.title, link: n.link, createdAt: n.createdAt.toISOString(), read: !!n.readAt, type: n.type }))}
            unread={unread}
            sections={sections}
            can={{ createProject: u.permissions.has("project.create"), addProduction: u.permissions.has("submission.create") && (u.role === "SUPER_ADMIN" || u.role === "PROJECT_MANAGER" || u.departments.some((d) => d.key === "PRODUCTION")), ai: u.permissions.has("ai.use") }}
          />
        </Suspense>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
