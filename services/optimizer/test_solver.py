from solver import Dep, Task, solve


def test_resource_levelling_and_precedence():
    tasks = [Task("A", 240, resource="CARP", units=3), Task("B", 240, resource="CARP", units=3), Task("C", 60)]
    r = solve(tasks, [Dep("A", "C"), Dep("B", "C")], {"CARP": 4})
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert abs(r.starts["A"] - r.starts["B"]) >= 240  # cannot overlap with 4 carpenters
    assert r.starts["C"] >= max(r.finishes["A"], r.finishes["B"])
    assert r.makespan == 540


def test_deadline_lateness_is_reported_not_hidden():
    r = solve([Task("SETUP", 600, deadline=300)], [], {})
    assert r.lateness == {"SETUP": 300}
    assert r.finishes["SETUP"] == 600


def test_ss_ff_relations():
    r = solve([Task("A", 100), Task("B", 30), Task("C", 30)], [Dep("A", "B", "SS", 20), Dep("A", "C", "FF", 10)], {})
    assert r.starts["B"] >= r.starts["A"] + 20
    assert r.finishes["C"] >= r.finishes["A"] + 10
