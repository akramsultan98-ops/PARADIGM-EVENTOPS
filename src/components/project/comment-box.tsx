"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { addCommentAction } from "@/server/actions/projects";

export function CommentBox({ projectId }: { projectId: string }) {
  const [v, setV] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <div className="flex gap-2"><Textarea value={v} onChange={(e) => setV(e.target.value)} rows={2} placeholder="Add a comment for the project team…" /><Button size="icon" disabled={pending || !v.trim()} onClick={() => start(async () => { const r = await addCommentAction(projectId, v); if (r.ok) { setV(""); router.refresh(); } else toast(r.error, { tone: "error" }); })} aria-label="Post"><Send className="rtl:-scale-x-100" /></Button></div>;
}
