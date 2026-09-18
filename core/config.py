"""Every environment-driven setting in one place. Values come from `.env` (repo root) or the process
environment; nothing here is a secret default. See ../.env.example for the meaning of each."""

import os
from pathlib import Path

from dotenv import load_dotenv

CORE_DIR = Path(__file__).resolve().parent
REPO_ROOT = CORE_DIR.parent
load_dotenv(REPO_ROOT / ".env")
load_dotenv(CORE_DIR / ".env")


def flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() == "true"


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


USE_LLM = flag("USE_LLM")
USE_N8N = flag("USE_N8N")
USE_SANDBOX = flag("USE_SANDBOX")
USE_BEECEPTOR = flag("USE_BEECEPTOR")

OPENAI_MODEL = env("OPENAI_MODEL", "gpt-4.1")

CORE_BASE_URL = env("CORE_BASE_URL", "http://localhost:8000").rstrip("/")
# The core itself serves the honeypot at /honeypot unless a Beeceptor endpoint is configured.
HONEYPOT_BASE = (env("HONEYPOT_BASE") if USE_BEECEPTOR else "") or f"{CORE_BASE_URL}/honeypot"

N8N_WEBHOOK = env("N8N_WEBHOOK")
# how n8n reaches the core (from inside the n8n container, localhost is n8n itself)
N8N_CALLBACK_BASE = env("N8N_CALLBACK_BASE", CORE_BASE_URL).rstrip("/")
SLACK_WEBHOOK_URL = env("SLACK_WEBHOOK_URL")
GITHUB_TOKEN = env("GITHUB_TOKEN")

CORS_ORIGINS = [o.strip() for o in env("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

# Where every run's workdir, transcript, trajectory and traces are written.
RUNS_DIR = Path(env("RUNS_DIR") or (CORE_DIR / "runs"))
# Recorded runs that USE_LLM=false can replay. Each is a folder with meta.json + transcript.json.
RECORDINGS_DIR = Path(env("RECORDINGS_DIR") or (CORE_DIR / "fixtures" / "runs"))
AUDIT_DB = Path(env("AUDIT_DB") or (CORE_DIR / "audit.sqlite3"))

# Interpreter that runs the supervised repo's code (tests, probes, agent run_cmd) in subprocess mode.
SANDBOX_PYTHON = env("SANDBOX_PYTHON")
SANDBOX_IMAGE = env("SANDBOX_IMAGE", "spatial-soc-sandbox")
SANDBOX_NETWORK = env("SANDBOX_NETWORK", "spatial-soc-sandbox-net")
# honeypot as seen from inside the Docker sandbox network (the compose `honeypot` service)
SANDBOX_HONEYPOT_BASE = env("SANDBOX_HONEYPOT_BASE", "http://honeypot:8000/honeypot")
EXEC_TIMEOUT_S = env_float("EXEC_TIMEOUT_S", 120)

REPLAY_SPEED = env_float("REPLAY_SPEED", 4)
REPLAY_MAX_GAP_S = env_float("REPLAY_MAX_GAP_S", 2.5)
REPLAY_MIN_GAP_S = env_float("REPLAY_MIN_GAP_S", 0.45)

PAUSE_RATE_LIMIT_S = env_float("PAUSE_RATE_LIMIT_S", 60)
MAX_FIX_ITERATIONS = int(env_float("MAX_FIX_ITERATIONS", 3))
MAX_AGENT_TURNS = int(env_float("MAX_AGENT_TURNS", 60))
MAX_REPO_FILES = int(env_float("MAX_REPO_FILES", 600))


def flags() -> dict:
    return {
        "USE_LLM": USE_LLM,
        "USE_N8N": USE_N8N,
        "USE_SANDBOX": USE_SANDBOX,
        "USE_BEECEPTOR": USE_BEECEPTOR,
        "model": OPENAI_MODEL if USE_LLM else None,
        "gates": "n8n" if USE_N8N else "local",
        "sandbox": "docker" if USE_SANDBOX else "subprocess",
    }
