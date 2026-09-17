import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() == "true"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/flags")
def flags():
    return {
        "USE_LLM": _flag("USE_LLM"),
        "USE_N8N": _flag("USE_N8N"),
        "USE_SANDBOX": _flag("USE_SANDBOX"),
        "USE_BEECEPTOR": _flag("USE_BEECEPTOR"),
    }
