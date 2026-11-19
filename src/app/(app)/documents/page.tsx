import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/kit";
import { UploadForm } from "@/components/execution/upload";
import { DocumentList } from "@/components/project/tab-control";

export const metadata = { title: "Document center" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const u = await requireUser();
  const { t, locale } = await getDict();
  const { project } = await searchParams;
  const projects = await db.project.findMany({ where: projectScope(u), select: { id: true, name: true }, orderBy: { eventStart: "asc" } });
  const docs = await db.uploadedDocument.findMany({ where: { companyId: u.companyId, deletedAt: null, OR: [{ projectId: null }, { project: projectScope(u) }], ...(project ? { projectId: project } : {}) }, include: { uploadedBy: { select: { name: true } }, extracted: true, project: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title={t.nav.documents} description="Drawings, specifications, quotations, artwork and site photos. Files are validated (type, size, content signature), hashed and stored privately; extracted values wait for human review." />
      {u.permissions.has("documents.upload") && <Card className="mb-5"><CardContent><UploadForm projects={projects} defaultProject={project} /></CardContent></Card>}
      <DocumentList docs={docs} locale={locale} canReview={u.permissions.has("submission.review")} />
    </>
  );
}
