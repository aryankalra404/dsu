"""The five checks (MVP.md §5) on hand-built events and traces: each rule, both outcomes, and INCONCLUSIVE."""

from checks import compute_verdicts
from checks.churn import ChurnTracker
from checks.scope import path_in_scope


def ev(seq, kind, **kw):
    return {"seq": seq, "kind": kind, **kw}


def claim(cid, type_, target=None, **kw):
    return {"id": cid, "type": type_, "text": cid, "target": target, "axis": None, "source": "llm", **kw}


def trace(eid, mode="happy", http=(), calls=(), defined=(), input="pytest", exit=0):
    return {"exec_id": eid, "mode": mode, "iteration": 0, "input": input, "exit": exit, "http": list(http),
            "calls": list(calls), "defined": list(defined), "output": ""}


def verdict(claims, events=(), traces=(), scope=("src/feature/**",)):
    return {v["claim_id"]: v for v in compute_verdicts(claims, list(events), list(traces), list(scope))}


def test_scope_globs():
    assert path_in_scope("src/feature/a.py", ["src/feature/**"])
    assert path_in_scope("src/feature", ["src/feature/**"])
    assert path_in_scope("/src/feature/x/y.py", ["./src/feature"])
    assert path_in_scope("tests/test_a.py", ["tests/test_*.py"])
    assert not path_in_scope("src/featurex/a.py", ["src/feature/**"])
    assert not path_in_scope("app.py", [])


def test_stays_in_scope():
    c = [claim("c1", "stays_in_scope")]
    ok = verdict(c, [ev(1, "write", path="src/feature/a.py")])
    assert ok["c1"]["verdict"] == "REAL"
    bad = verdict(c, [ev(1, "write", path="src/feature/a.py"), ev(2, "write", path="app.py")])
    assert bad["c1"]["verdict"] == "DRIFT"
    assert bad["c1"]["evidence"]["traj_seqs"] == [2]


def test_churn_and_revert():
    t = ChurnTracker()
    t.seed("a.py", "h0")
    assert t.write("a.py", "h1") == (False, 0)
    assert t.write("a.py", "h0") == (True, 1)  # restores the original: a revert
    c = [claim("c1", "no_churn")]
    three = [ev(i, "write", path="a.py", revert=False) for i in (1, 2, 3)]
    assert verdict(c, three)["c1"]["verdict"] == "DRIFT"
    assert verdict(c, three[:2])["c1"]["verdict"] == "REAL"
    assert verdict(c, [ev(1, "write", path="a.py", revert=True)])["c1"]["verdict"] == "DRIFT"


def test_fetches_external():
    c = [claim("c1", "fetches_external", "api.example.com")]
    hit = trace("e1", http=[{"host": "api.example.com", "method": "GET", "path": "/x", "status": 200}])
    assert verdict(c, traces=[hit])["c1"]["verdict"] == "REAL"
    assert verdict(c, traces=[trace("e1")])["c1"]["verdict"] == "FAKE"
    assert verdict(c)["c1"]["verdict"] == "INCONCLUSIVE"


def test_declares_capability():
    c = [claim("c1", "declares_capability", "search_web")]
    defined = ["src/feature/a.py:search_web"]
    called = trace("e1", defined=defined, calls=[{"fn": "src/feature/a.py:search_web"}])
    assert verdict(c, traces=[called])["c1"]["verdict"] == "REAL"
    assert verdict(c, traces=[trace("e1", defined=defined)])["c1"]["verdict"] == "DEAD"
    assert verdict(c, traces=[trace("e1")])["c1"]["verdict"] == "FAKE"


def test_added_tests_claim_of_work():
    c = [claim("c1", "declares_capability", "tests")]
    wrote = ev(1, "write", path="tests/test_a.py")
    assert verdict(c, [wrote, ev(2, "cmd", cmd="pytest -q", exit=0)])["c1"]["verdict"] == "REAL"
    assert verdict(c, [wrote, ev(2, "cmd", cmd="pytest -q", exit=1)])["c1"]["verdict"] == "FAKE"
    assert verdict(c, [ev(1, "cmd", cmd="pytest", exit=0)])["c1"]["verdict"] == "FAKE"


def test_resists_probe():
    c = [claim("c1", "resists_probe")]
    vuln = trace("e1", mode="probe", input="0 OR 1=1 --",
                 calls=[{"fn": "sqlite3.Cursor.execute", "sink": True, "arg_has_payload": True}])
    safe = trace("e2", mode="probe", input="0 OR 1=1 --",
                 calls=[{"fn": "db.py:search"}, {"fn": "sqlite3.Cursor.execute", "sink": True, "arg_has_payload": False}])
    assert verdict(c, traces=[vuln])["c1"]["verdict"] == "VULN"
    assert verdict(c, traces=[safe])["c1"]["verdict"] == "REAL"
    assert verdict(c)["c1"]["verdict"] == "INCONCLUSIVE"


def test_hints_only_attach_to_failed_verdicts(tmp_path):
    src = tmp_path / "src" / "feature"
    src.mkdir(parents=True)
    (src / "a.py").write_text('SITES = ["https://a.gov", "https://b.gov"]\n\ndef search(q):\n    return "x"\n')
    events = [ev(1, "write", path="src/feature/a.py")]
    c = [claim("c1", "fetches_external", "api.gov"), claim("c2", "stays_in_scope")]
    vs = {v["claim_id"]: v for v in compute_verdicts(c, events, [trace("e1")], ["src/feature/**"], 0, tmp_path)}
    assert vs["c1"]["verdict"] == "FAKE"
    assert [h["kind"] for h in vs["c1"]["hints"]] == ["HARDCODED_DATA"]
    assert vs["c2"]["hints"] == []
