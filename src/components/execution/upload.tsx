"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { reviewExtractedAction, uploadDocumentAction } from "@/server/actions/documents";

export function UploadForm({ projects, defaultProject }: { projects: { id: string; name: string }[]; defaultProject?: string }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form ref={ref} className="flex flex-col gap-2 sm:flex-row sm:items-center" action={(fd) => start(async () => { const r = await uploadDocumentAction(fd); if (r.ok) { const d = r.data as { extracted: number }; toast("Uploaded", { description: d.extracted ? `${d.extracted} value(s) extracted for review` : "No measurable values detected (images need the AI provider)" }); ref.current?.reset(); setName(""); router.refresh(); } else toast(r.error, { tone: "error" }); })}>
      <NativeSelect name="projectId" defaultValue={defaultProject ?? ""} className="sm:w-56"><option value="">No project (company)</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
      <NativeSelect name="category" className="sm:w-36">{["DRAWING", "SPEC", "QUOTE", "BOQ", "ARTWORK", "PHOTO", "CONTRACT", "GENERAL"].map((c) => <option key={c}>{c}</option>)}</NativeSelect>
      <label className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed bg-card px-3 text-sm text-muted-foreground hover:bg-muted"><Upload className="size-4 shrink-0" /><span className="truncate">{name || "Choose PDF, XLSX, CSV, DOCX or image (max 20 MB)"}</span><input name="file" type="file" required className="hidden" accept=".pdf,.xlsx,.csv,.docx,.png,.jpg,.jpeg,.webp,.txt" onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} /></label>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Upload />}Upload</Button>
    </form>
  );
}

export function ExtractedReviewButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (d: "APPROVED" | "REJECTED") => start(async () => { const r = await reviewExtractedAction(id, d); if (r.ok) router.refresh(); else toast(r.error, { tone: "error" }); });
  return <div className="flex gap-1"><Button size="sm" variant="outline" disabled={pending} onClick={() => go("APPROVED")}>Accept</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => go("REJECTED")}>Reject</Button></div>;
}
