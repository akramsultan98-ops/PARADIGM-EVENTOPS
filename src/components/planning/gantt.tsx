"use client";
import { useMemo, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface GanttTask {
  id: string;
  wbs: string;
  name: string;
  department: string | null;
  phase: string;
  start: string | null;
  finish: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  critical: boolean;
  milestone: boolean;
  status?: string;
  percent?: number;
  floatHours?: number | null;
  crew?: number | null;
  trade?: string | null;
}
export interface GanttDep { from: string; to: string; type: string }

const H = 3600000;
const PHASE_COLOR: Record<string, string> = {
  PROCUREMENT: "bg-chart-5/70", PRODUCTION: "bg-chart-2/80", TRANSPORT: "bg-chart-3/80", SETUP: "bg-chart-1/80", EVENT: "bg-brand-navy", DISMANTLE: "bg-muted-foreground/60", ADMIN: "bg-muted-foreground/50",
};
const ZOOMS = [{ label: "Weeks", pxPerHour: 1.2 }, { label: "Days", pxPerHour: 4 }, { label: "Shifts", pxPerHour: 12 }, { label: "Hours", pxPerHour: 30 }];
const fmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", ...opts }).format(new Date(ms));

export function Gantt({ tasks, deps = [], now, initialZoom, height = 560, focusFrom }: { tasks: GanttTask[]; deps?: GanttDep[]; now?: string; initialZoom?: number; height?: number; focusFrom?: string }) {
  const [zoom, setZoom] = useState(() => {
    if (initialZoom !== undefined) return initialZoom;
    const ts = tasks.flatMap((t) => [t.start, t.finish]).filter(Boolean).map((x) => Date.parse(x!));
    const days = ts.length ? (Math.max(...ts) - Math.min(...ts)) / 86400000 : 0;
    return days > 14 ? 0 : days > 4 ? 1 : 2;
  });
  const [dept, setDept] = useState<string>("ALL");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [showDeps, setShowDeps] = useState(true);
  const depts = useMemo(() => [...new Set(tasks.map((t) => t.department).filter(Boolean) as string[])].sort(), [tasks]);
  const rows = tasks.filter((t) => t.start && (dept === "ALL" || t.department === dept) && (!criticalOnly || t.critical));
  const starts = rows.map((t) => Date.parse(t.start!));
  const ends = rows.map((t) => Date.parse(t.finish ?? t.start!));
  if (!rows.length) return <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">No scheduled tasks to display.</div>;
  const min = Math.min(...starts, focusFrom ? Date.parse(focusFrom) : Infinity);
  const t0 = min - (min % (24 * H)) - 2 * H;
  const t1 = Math.max(...ends) + 12 * H;
  const px = ZOOMS[zoom].pxPerHour;
  const width = Math.max(600, ((t1 - t0) / H) * px);
  const x = (ms: number) => ((ms - t0) / H) * px;
  const ROW = 30;
  const days: number[] = [];
  for (let d = t0 + 2 * H; d < t1; d += 24 * H) days.push(d);
  const index = new Map(rows.map((r, i) => [r.id, i]));
  const nowMs = now ? Date.parse(now) : null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-xs" aria-label="Department filter">
          <option value="ALL">All departments</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} className="accent-[hsl(var(--primary))]" />Critical path only</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={showDeps} onChange={(e) => setShowDeps(e.target.checked)} className="accent-[hsl(var(--primary))]" />Dependencies</label>
        <div className="ms-auto flex items-center gap-1">
          <span className="text-2xs text-muted-foreground">{ZOOMS[zoom].label}</span>
          <Button variant="outline" size="icon-sm" onClick={() => setZoom((z) => Math.max(0, z - 1))} aria-label="Zoom out"><ZoomOut /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} aria-label="Zoom in"><ZoomIn /></Button>
        </div>
      </div>
      <div className="flex" style={{ maxHeight: height }} dir="ltr">
        {/* task list */}
        <div className="w-[38%] min-w-[180px] max-w-[340px] shrink-0 overflow-hidden border-e">
          <div className="sticky top-0 flex h-10 items-end border-b bg-muted/60 px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Task</div>
          <div className="overflow-hidden">
            {rows.map((r) => (
              <div key={r.id} className={cn("flex items-center gap-2 border-b border-border/60 px-3 text-xs", r.critical && "font-medium")} style={{ height: ROW }}>
                <span className="w-9 shrink-0 text-2xs text-muted-foreground tabular">{r.wbs}</span>
                <span className="truncate" title={r.name}>{r.name}</span>
              </div>
            ))}
          </div>
        </div>
        {/* timeline */}
        <div className="scrollbar-thin relative flex-1 overflow-auto">
          <div style={{ width }} className="relative">
            <div className="sticky top-0 z-10 h-10 border-b bg-muted/60 backdrop-blur">
              {days.map((d) => (
                <div key={d} className="absolute top-0 h-full border-s border-border/80 ps-1 text-2xs text-muted-foreground" style={{ left: x(d), width: 24 * px }}>
                  <div className="font-semibold text-foreground/70">{fmt(d, { weekday: "short" })}</div>
                  <div>{fmt(d, { day: "2-digit", month: "short" })}</div>
                </div>
              ))}
            </div>
            <div className="relative" style={{ height: rows.length * ROW }}>
              {days.map((d) => <div key={d} className="absolute inset-y-0 border-s border-border/50" style={{ left: x(d) }} />)}
              {nowMs && nowMs > t0 && nowMs < t1 && <div className="absolute inset-y-0 z-[2] w-px bg-danger" style={{ left: x(nowMs) }}><span className="absolute -top-0 start-1 rounded bg-danger px-1 text-[9px] font-bold text-white">NOW</span></div>}
              {showDeps && (
                <svg className="pointer-events-none absolute inset-0 z-[1]" width={width} height={rows.length * ROW}>
                  {deps.map((d, i) => {
                    const a = index.get(d.from), b = index.get(d.to);
                    if (a === undefined || b === undefined) return null;
                    const ta = rows[a], tb = rows[b];
                    const xa = x(Date.parse(ta.finish ?? ta.start!)), xb = x(Date.parse(tb.start!));
                    const ya = a * ROW + ROW / 2, yb = b * ROW + ROW / 2;
                    const mid = Math.max(xa + 6, Math.min(xb - 6, xa + 12));
                    const crit = ta.critical && tb.critical;
                    return <path key={i} d={`M${xa},${ya} H${mid} V${yb} H${xb}`} fill="none" stroke={crit ? "hsl(var(--danger))" : "hsl(var(--muted-foreground) / 0.35)"} strokeWidth={crit ? 1.2 : 0.8} markerEnd="" />;
                  })}
                </svg>
              )}
              {rows.map((r, i) => {
                const s = Date.parse(r.start!), f = Date.parse(r.finish ?? r.start!);
                const top = i * ROW;
                const tip = (
                  <div className="space-y-0.5">
                    <div className="font-semibold">{r.wbs} {r.name}</div>
                    <div>{fmt(s, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} → {fmt(f, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                    {r.crew ? <div>{r.crew} × {r.trade}</div> : null}
                    <div>Float: {r.floatHours ?? "—"} h{r.critical ? " · CRITICAL" : ""}</div>
                    {r.status && <div>Status: {r.status.replace(/_/g, " ").toLowerCase()} {r.percent ? `(${r.percent}%)` : ""}</div>}
                  </div>
                );
                if (r.milestone) return (
                  <Tip key={r.id} content={tip}><div className="absolute z-[3] size-3 rotate-45 bg-brand-navy ring-2 ring-brand-cyan" style={{ left: x(s) - 6, top: top + ROW / 2 - 6 }} /></Tip>
                );
                return (
                  <div key={r.id}>
                    <Tip content={tip}>
                      <div className={cn("absolute z-[3] h-[14px] overflow-hidden rounded-sm", PHASE_COLOR[r.phase] ?? "bg-chart-1", r.critical && "ring-2 ring-danger/70", r.status === "DELAYED" && "bg-danger/80")} style={{ left: x(s), top: top + 5, width: Math.max(3, x(f) - x(s)) }}>
                        {r.percent ? <div className="h-full bg-black/25" style={{ width: `${r.percent}%` }} /> : null}
                      </div>
                    </Tip>
                    {r.actualStart && (
                      <div className="absolute z-[2] h-[5px] rounded-sm bg-success" style={{ left: x(Date.parse(r.actualStart)), top: top + 21, width: Math.max(3, x(Date.parse(r.actualEnd ?? now ?? r.actualStart)) - x(Date.parse(r.actualStart))) }} title="Actual" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-2xs text-muted-foreground">
        {Object.entries(PHASE_COLOR).filter(([k]) => tasks.some((t) => t.phase === k)).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className={cn("inline-block h-2 w-4 rounded-sm", c)} />{k.toLowerCase()}</span>)}
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm ring-2 ring-danger/70" />critical path</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1 w-4 rounded-sm bg-success" />actual</span>
        <span className="flex items-center gap-1"><span className="inline-block size-2 rotate-45 bg-brand-navy" />milestone</span>
      </div>
    </div>
  );
}
