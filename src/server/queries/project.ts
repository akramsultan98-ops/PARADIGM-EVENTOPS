import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { projectScope } from "@/lib/scope";
import { getDict } from "@/i18n/server";
import { getPlan } from "./plans";

/** Everything a project tab needs, loaded once per request and always company/user scoped. */
export const projectContext = cache(async (id: string) => {
  const u = await requireUser();
  const { locale, t } = await getDict();
  const project = await db.project.findFirst({
    where: { ...projectScope(u), id },
    include: { venue: true, projectManager: true, accountManager: true, departments: { include: { department: true, lead: true }, orderBy: { department: { name: "asc" } } }, members: { include: { user: { include: { role: true } } } } },
  });
  if (!project) notFound();
  const plan = await getPlan(id);
  return { u, locale, t, project, plan };
});
