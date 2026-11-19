"""
PARADIGM EVENTOPS — OR-Tools CP-SAT resource-constrained scheduler.

Input: tasks on a working-time axis (integer minutes since the plan anchor), precedence
relations (FS/SS/FF/SF + lag), renewable resources with capacities, release times and
deadlines. Output: start/finish per task minimising (a) total deadline lateness, then (b)
makespan. Required tasks are never dropped: lateness is reported, not hidden.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from ortools.sat.python import cp_model


@dataclass
class Task:
    id: str
    duration: int
    release: int = 0
    deadline: int | None = None
    resource: str | None = None
    units: int = 0
    fixed_start: int | None = None


@dataclass
class Dep:
    frm: str
    to: str
    type: str = "FS"
    lag: int = 0


@dataclass
class Result:
    status: str
    starts: dict[str, int] = field(default_factory=dict)
    finishes: dict[str, int] = field(default_factory=dict)
    lateness: dict[str, int] = field(default_factory=dict)
    makespan: int | None = None


def solve(tasks: list[Task], deps: list[Dep], capacities: dict[str, int], horizon: int | None = None, time_limit_s: float = 10.0) -> Result:
    m = cp_model.CpModel()
    H = horizon or (sum(t.duration for t in tasks) + max([t.release for t in tasks] + [0]) + 1)
    start, end, interval, late = {}, {}, {}, {}
    for t in tasks:
        lo = t.fixed_start if t.fixed_start is not None else t.release
        hi = t.fixed_start if t.fixed_start is not None else H
        start[t.id] = m.NewIntVar(lo, hi, f"s_{t.id}")
        end[t.id] = m.NewIntVar(lo + t.duration, hi + t.duration, f"e_{t.id}")
        interval[t.id] = m.NewIntervalVar(start[t.id], t.duration, end[t.id], f"i_{t.id}")
        if t.deadline is not None:
            late[t.id] = m.NewIntVar(0, H, f"late_{t.id}")
            m.Add(late[t.id] >= end[t.id] - t.deadline)
    for d in deps:
        if d.frm not in start or d.to not in start:
            continue
        a_s, a_e, b_s, b_e = start[d.frm], end[d.frm], start[d.to], end[d.to]
        if d.type == "FS": m.Add(b_s >= a_e + d.lag)
        elif d.type == "SS": m.Add(b_s >= a_s + d.lag)
        elif d.type == "FF": m.Add(b_e >= a_e + d.lag)
        elif d.type == "SF": m.Add(b_e >= a_s + d.lag)
    for res, cap in capacities.items():
        users = [t for t in tasks if t.resource == res and t.units > 0 and t.duration > 0]
        if users:
            m.AddCumulative([interval[t.id] for t in users], [min(t.units, cap) for t in users], cap)
    mk = m.NewIntVar(0, H * 2, "makespan")
    m.AddMaxEquality(mk, [end[t.id] for t in tasks])
    # lexicographic: lateness dominates makespan
    m.Minimize(sum(late.values()) * (H * 2 + 1) + mk)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_workers = 4
    st = solver.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Result(status=solver.StatusName(st))
    return Result(
        status=solver.StatusName(st),
        starts={k: solver.Value(v) for k, v in start.items()},
        finishes={k: solver.Value(v) for k, v in end.items()},
        lateness={k: solver.Value(v) for k, v in late.items() if solver.Value(v) > 0},
        makespan=solver.Value(mk),
    )
