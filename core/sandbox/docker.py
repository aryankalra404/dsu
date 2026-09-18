"""Builds the generic sandbox image and its internal network (USE_SANDBOX=true). The image contains only
Python, pytest, the polygraph shim and the runner -- the supervised repo is mounted at /app per execution."""

import subprocess

import config

DOCKERFILE = config.REPO_ROOT / "sandbox" / "Dockerfile"


def ensure_network() -> None:
    inspected = subprocess.run(["docker", "network", "inspect", config.SANDBOX_NETWORK], capture_output=True)
    if inspected.returncode != 0:
        subprocess.run(["docker", "network", "create", "--internal", config.SANDBOX_NETWORK], check=True)


def build() -> None:
    ensure_network()
    subprocess.run(
        ["docker", "build", "-f", str(DOCKERFILE), "-t", config.SANDBOX_IMAGE, str(config.REPO_ROOT / "sandbox")],
        check=True,
    )


if __name__ == "__main__":
    build()
    print(f"built {config.SANDBOX_IMAGE}; network {config.SANDBOX_NETWORK} ready")
