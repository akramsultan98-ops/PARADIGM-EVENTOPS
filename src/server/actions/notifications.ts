"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export async function markAllReadAction() {
  const u = await requireUser();
  await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
export async function markReadAction(id: string) {
  const u = await requireUser();
  await db.notification.updateMany({ where: { id, userId: u.id }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}
