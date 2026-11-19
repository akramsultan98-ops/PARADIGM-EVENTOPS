"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { conversationalExtractAction } from "@/server/actions/inputs";

const EXAMPLES: Record<string, string> = {
  PRODUCTION: "We need an 8-meter wide, 3-meter high wooden backdrop, MDF finishing, painted black, installation during the first setup day.",
  AV: "We need 84 LED panels for a 6 x 3.5 m wall plus 6 spare, 8 wireless microphones plus 2 backup and 12 moving heads on a front truss.",
  ACCOMMODATION: "Four carpenters and two AV technicians arrive on 12 December and check out on 17 December, twin rooms.",
  LOGISTICS: "Two crates of tools, 1.2 x 0.8 x 0.8 m each, about 120 kg, must arrive with the first truck.",
  CREATIVE: "Six roll-up banners 0.85 x 2 m and a 12 x 0.6 m stage fascia print in vinyl.",
};

export function ConversationalInput({ projectId, departments }: { projectId: string; departments: string[] }) {
  const [dept, setDept] = useState(departments[0]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><NativeSelect value={dept} onChange={(e) => setDept(e.target.value)} className="w-48" aria-label="Department">{departments.map((d) => <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>)}</NativeSelect><button type="button" className="text-xs text-primary hover:underline" onClick={() => setText(EXAMPLES[dept] ?? "")}>Insert example</button></div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={EXAMPLES[dept]} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-muted-foreground">Extracted values stay drafts until you confirm them. Nothing is assumed silently.</p>
        <Button disabled={pending || text.trim().length < 10} onClick={() => start(async () => {
          const r = await conversationalExtractAction(projectId, dept, text);
          if (r.ok) { const d = r.data as { submissionId: string; missing: unknown[]; engineNote: string }; toast(`Draft extracted — ${d.missing.length} item(s) need information`, { description: d.engineNote }); setText(""); router.push(`/projects/${projectId}/inputs?submission=${d.submissionId}`); router.refresh(); }
          else toast(r.error, { tone: "error" });
        })}>{pending ? <Loader2 className="animate-spin" /> : <Sparkles />}Extract draft</Button>
      </div>
    </div>
  );
}
