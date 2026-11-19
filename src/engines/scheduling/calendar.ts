/**
 * Working-time calendars. Time is in epoch milliseconds; durations are in working hours.
 * A calendar is an ordered list of disjoint working intervals. `continuous` has no gaps
 * (used for driving and supplier lead times).
 */
const H = 3600000;

export interface Interval { start: number; end: number }

export class Calendar {
  readonly intervals: Interval[];
  readonly continuousMode: boolean;

  constructor(readonly name: string, intervals: Interval[] | "continuous") {
    this.continuousMode = intervals === "continuous";
    this.intervals = this.continuousMode ? [] : merge(intervals as Interval[]);
  }

  static continuous(name = "24/7") { return new Calendar(name, "continuous"); }

  /** Daily windows [startHour,endHour) local time between two dates (inclusive days). */
  static daily(name: string, from: Date, to: Date, startHour: number, endHour: number, tzOffsetHours: number, workdays?: number[]): Calendar {
    const out: Interval[] = [];
    const localFrom = new Date(from.getTime() + tzOffsetHours * H);
    const localTo = new Date(to.getTime() + tzOffsetHours * H);
    let d = Date.UTC(localFrom.getUTCFullYear(), localFrom.getUTCMonth(), localFrom.getUTCDate());
    const last = Date.UTC(localTo.getUTCFullYear(), localTo.getUTCMonth(), localTo.getUTCDate());
    for (; d <= last; d += 24 * H) {
      const wd = new Date(d).getUTCDay();
      if (workdays && !workdays.includes(wd)) continue;
      const s = d + (startHour - tzOffsetHours) * H;
      const e = d + (endHour - tzOffsetHours) * H;
      const cs = Math.max(s, from.getTime());
      const ce = Math.min(e, to.getTime());
      if (ce > cs) out.push({ start: cs, end: ce });
    }
    return new Calendar(name, out);
  }

  /** first working instant at or after t (Infinity if none) */
  nextWorking(t: number): number {
    if (this.continuousMode) return t;
    for (const iv of this.intervals) {
      if (t < iv.end) return Math.max(t, iv.start);
    }
    return Infinity;
  }

  /** finish time when `hours` of work start at t */
  addWork(t: number, hours: number): number {
    if (hours <= 0) return t;
    if (this.continuousMode) return t + hours * H;
    let remaining = hours * H;
    for (const iv of this.intervals) {
      if (iv.end <= t) continue;
      const s = Math.max(t, iv.start);
      const avail = iv.end - s;
      if (avail >= remaining) return s + remaining;
      remaining -= avail;
    }
    return Infinity;
  }

  /** latest start so that `hours` of work finish exactly at t */
  subtractWork(t: number, hours: number): number {
    if (hours <= 0) return t;
    if (this.continuousMode) return t - hours * H;
    let remaining = hours * H;
    for (let i = this.intervals.length - 1; i >= 0; i--) {
      const iv = this.intervals[i];
      if (iv.start >= t) continue;
      const e = Math.min(t, iv.end);
      const avail = e - iv.start;
      if (avail >= remaining) return e - remaining;
      remaining -= avail;
    }
    return -Infinity;
  }

  /** working hours between a and b */
  workBetween(a: number, b: number): number {
    if (b <= a) return 0;
    if (this.continuousMode) return (b - a) / H;
    let ms = 0;
    for (const iv of this.intervals) {
      const s = Math.max(a, iv.start), e = Math.min(b, iv.end);
      if (e > s) ms += e - s;
    }
    return ms / H;
  }

  totalHours(): number {
    return this.continuousMode ? Infinity : this.intervals.reduce((s, iv) => s + (iv.end - iv.start), 0) / H;
  }

  workingDays(): number {
    if (this.continuousMode) return Infinity;
    return new Set(this.intervals.map((iv) => new Date(iv.start).toISOString().slice(0, 10))).size;
  }
}

function merge(list: Interval[]): Interval[] {
  const s = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

export const HOUR_MS = H;
