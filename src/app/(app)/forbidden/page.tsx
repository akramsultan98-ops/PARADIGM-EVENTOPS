import Link from "next/link";
import { ShieldX } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Access denied" };

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const u = await requireUser();
  const { need } = await searchParams;
  const label = need && need in PERMISSIONS ? PERMISSIONS[need as keyof typeof PERMISSIONS] : null;
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-danger"><ShieldX /></div>
      <h1 className="page-title mt-4">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your role ({u.roleName}) does not include {label ? <b>“{label}”</b> : "this permission"}. Ask a Super Admin if you need access.</p>
      <Button className="mt-6" asChild><Link href="/dashboard">Back to dashboard</Link></Button>
    </div>
  );
}
