"use client";
import { useRef, useState, useTransition } from "react";
import { Loader2, SendHorizontal, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/kit";
import { askAssistantAction } from "@/server/actions/assistant";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; engine?: string; tools?: string[] };
const SUGGEST = ["What is still missing before we can approve the plan?", "Show the material BOQ", "What crew do we need on site?", "Which vehicles are assigned and is there a backup?", "What if the main truck breaks down?", "What if we only get one setup day?", "What are the highest risks and Plan B?"];

/** Minimal, safe markdown: bold, italics, bullets, line breaks (no HTML injection). */
function Md({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[-•]\s+/.test(line);
        const indent = /^\s{2,}/.test(line);
        const parts = line.replace(/^\s*[-•]\s+/, "").split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((p, j) => p.startsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <em key={j} className="text-muted-foreground">{p.slice(1, -1)}</em> : <span key={j}>{p}</span>);
        if (!line.trim()) return <div key={i} className="h-1" />;
        return bullet ? <div key={i} className={cn("flex gap-2", indent && "ps-4")}><span className="text-primary">•</span><span>{parts}</span></div> : <div key={i} className={cn(indent && "ps-4")}>{parts}</div>;
      })}
    </div>
  );
}

export function AssistantChat({ projects, defaultProject, userName }: { projects: { id: string; name: string }[]; defaultProject: string | null; userName: string }) {
  const [projectId, setProjectId] = useState(defaultProject);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const send = (text: string) => {
    if (!text.trim()) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setInput("");
    start(async () => {
      const r = await askAssistantAction(projectId, history, text);
      setMsgs((m) => [...m, r.ok ? { role: "assistant", content: (r.data as { text: string }).text, engine: (r.data as { engine: string }).engine, tools: (r.data as { toolsUsed: string[] }).toolsUsed } : { role: "assistant", content: `⚠ ${r.error}` }]);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
  };
  return (
    <Card className="flex min-h-[70vh] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3"><span className="text-xs text-muted-foreground">Project context</span><NativeSelect value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value || null)} className="h-8 w-72 text-xs"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></div>
      <CardContent className="flex-1 space-y-4 overflow-y-auto">
        {msgs.length === 0 && (
          <div className="mx-auto max-w-2xl py-8 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-accent text-primary"><Sparkles /></div>
            <div className="font-display text-lg font-semibold">How can I help, {userName.replace(/^Demo\s+/, "")}?</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">{SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border bg-card px-3 py-1.5 text-xs hover:bg-muted">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            {m.role === "user" ? <Avatar name={userName} /> : <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-navy text-brand-cyan"><Sparkles className="size-4" /></span>}
            <div className={cn("max-w-[85%] rounded-lg px-4 py-3", m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card")}>
              {m.role === "user" ? <div className="text-sm">{m.content}</div> : <Md text={m.content} />}
              {m.tools && m.tools.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground"><Wrench className="size-3" />{[...new Set(m.tools)].join(" · ")}<span className="ms-1">({m.engine === "AI" ? "Claude" : "rule-based"})</span></div>}
            </div>
          </div>
        ))}
        {pending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Consulting the planning engines…</div>}
        <div ref={end} />
      </CardContent>
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} className="min-h-[40px] resize-none" placeholder="Ask about this project… (Arabic or English)" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <Button type="submit" disabled={pending || !input.trim()} size="icon" className="size-10" aria-label="Send"><SendHorizontal className="rtl:-scale-x-100" /></Button>
      </form>
    </Card>
  );
}
