"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "@/server/actions/notifications";
export function MarkAllRead() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button variant="outline" disabled={pending} onClick={() => start(async () => { await markAllReadAction(); router.refresh(); })}><CheckCheck />Mark all read</Button>;
}
