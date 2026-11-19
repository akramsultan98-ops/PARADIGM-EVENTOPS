"""HTTP wrapper: POST /schedule  (JSON in / JSON out). GET /health."""
from fastapi import FastAPI
from pydantic import BaseModel
from solver import Dep, Task, solve

app = FastAPI(title="PARADIGM EVENTOPS optimizer", version="1.0.0")


class TaskIn(BaseModel):
    id: str
    duration: int
    release: int = 0
    deadline: int | None = None
    resource: str | None = None
    units: int = 0
    fixedStart: int | None = None


class DepIn(BaseModel):
    from_: str
    to: str
    type: str = "FS"
    lag: int = 0

    model_config = {"populate_by_name": True, "alias_generator": lambda f: "from" if f == "from_" else f}


class Req(BaseModel):
    tasks: list[TaskIn]
    dependencies: list[DepIn]
    capacities: dict[str, int]
    timeLimitSeconds: float = 10.0


@app.get("/health")
def health():
    return {"status": "ok", "engine": "ortools-cp-sat"}


@app.post("/schedule")
def schedule(r: Req):
    res = solve(
        [Task(t.id, t.duration, t.release, t.deadline, t.resource, t.units, t.fixedStart) for t in r.tasks],
        [Dep(d.from_, d.to, d.type, d.lag) for d in r.dependencies],
        r.capacities,
        time_limit_s=r.timeLimitSeconds,
    )
    return {"status": res.status, "starts": res.starts, "finishes": res.finishes, "lateness": res.lateness, "makespan": res.makespan}
