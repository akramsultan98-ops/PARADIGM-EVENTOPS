import { requireUser } from "@/lib/auth/session";
import { DepartmentWorkspace } from "@/components/departments/department-dashboard";

export const metadata = { title: "AV & Technical" };

export default async function Page({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser();
  const { project } = await searchParams;
  return <DepartmentWorkspace user={user} dept="AV" projectId={project} />;
}
