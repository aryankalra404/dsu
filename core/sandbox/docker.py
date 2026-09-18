import json
import subprocess
import tempfile
from pathlib import Path

IMAGE_NAME = "spatial-soc-sandbox"
NETWORK_NAME = "spatial-soc-sandbox-net"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DOCKERFILE = REPO_ROOT / "sandbox" / "Dockerfile"


def _ensure_network() -> None:
    inspected = subprocess.run(
        ["docker", "network", "inspect", NETWORK_NAME], capture_output=True
    )
    if inspected.returncode != 0:
        subprocess.run(
            ["docker", "network", "create", "--internal", NETWORK_NAME], check=True
        )


def build() -> None:
    _ensure_network()
    subprocess.run(
        ["docker", "build", "-f", str(DOCKERFILE), "-t", IMAGE_NAME, str(REPO_ROOT)],
        check=True,
    )


def run(mode: str, input: str, run_id: str = "", exec_id: str = "", iteration: int = 0) -> dict:
    with tempfile.TemporaryDirectory() as out_dir:
        subprocess.run(
            [
                "docker", "run", "--rm",
                "--network", NETWORK_NAME,
                "-e", f"SOC_MODE={mode}",
                "-e", f"SOC_RUN_ID={run_id}",
                "-e", f"SOC_EXEC_ID={exec_id}",
                "-e", f"SOC_ITERATION={iteration}",
                "-v", f"{out_dir}:/out",
                IMAGE_NAME,
                input,
            ],
            check=True,
            timeout=60,
        )
        trace_path = Path(out_dir) / "trace.json"
        return json.loads(trace_path.read_text())
