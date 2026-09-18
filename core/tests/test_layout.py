"""The code city: works on any repo, deterministic, buildings don't overlap, new files get a lot."""

from pathlib import Path

from scene.layout import CITY, City

SAMPLE = Path(__file__).resolve().parent.parent / "fixtures" / "repo_schemes"


def _repo(tmp_path: Path) -> Path:
    files = {
        "src/pay/api.py": "from src.pay import models\nimport src.util.text\n",
        "src/pay/models.py": "X = 1\n" * 40,
        "src/util/text.py": "def f():\n    return 1\n",
        "web/app.ts": "import { x } from './lib/x';\n",
        "web/lib/x.ts": "export const x = 1;\n",
        "README.md": "# hi\n",
        "node_modules/ignored.js": "",
    }
    for rel, text in files.items():
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    return tmp_path


def test_city_from_any_repo(tmp_path):
    city = City(_repo(tmp_path), ["src/pay/**"], 600)
    g = city.graph()
    ids = {n["id"] for n in g["nodes"]}
    assert "node_modules/ignored.js" not in ids
    assert {"src/pay/api.py", "web/app.ts", "README.md"} <= ids
    assert city.scope_nodes() == ["src/pay/api.py", "src/pay/models.py"]
    edges = {(e["src"], e["dst"]) for e in g["edges"]}
    assert ("src/pay/api.py", "src/pay/models.py") in edges
    assert ("src/pay/api.py", "src/util/text.py") in edges
    assert ("web/app.ts", "web/lib/x.ts") in edges
    for n in g["nodes"]:
        x, _, z = n["pos"]
        assert -CITY / 2 <= x <= CITY / 2 and -CITY / 2 <= z <= CITY / 2
    positions = [tuple(n["pos"]) for n in g["nodes"]]
    assert len(positions) == len(set(positions))
    big = next(n for n in g["nodes"] if n["id"] == "src/pay/models.py")
    small = next(n for n in g["nodes"] if n["id"] == "src/util/text.py")
    assert big["size"][1] > small["size"][1]


def test_layout_is_deterministic(tmp_path):
    repo = _repo(tmp_path)
    assert City(repo, [], 600).graph() == City(repo, [], 600).graph()


def test_new_files_get_a_building(tmp_path):
    repo = _repo(tmp_path)
    city = City(repo, ["src/pay/**"], 600)
    before = {tuple(n["pos"]) for n in city.nodes.values()}
    (repo / "src/pay/new.py").write_text("from src.pay import models\n")
    (repo / "brand/new/dir.py").parent.mkdir(parents=True)
    (repo / "brand/new/dir.py").write_text("x = 1\n")
    a, edges = city.touch("src/pay/new.py")
    b, _ = city.touch("brand/new/dir.py")
    assert a["in_scope"] and a["district"] == "src/pay"
    assert b["district"] == "~new"
    assert tuple(a["pos"]) not in before and tuple(b["pos"]) not in before
    assert edges == [{"src": "src/pay/new.py", "dst": "src/pay/models.py", "kind": "import"}]


def test_sample_repo_city():
    city = City(SAMPLE, ["features/schemes/**"], 600)
    assert "app.py" in city.nodes and "db.py" in city.nodes
    assert ("app.py", "db.py") in {(e["src"], e["dst"]) for e in city.graph()["edges"]}
