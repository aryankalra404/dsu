# Generic sandbox image (USE_SANDBOX=true). Build context: the sandbox/ folder.
#   cd core && uv run python -m sandbox.docker
# The supervised repo is mounted at /app for each execution; nothing repo-specific is baked in.
FROM python:3.11-slim

RUN pip install --no-cache-dir pytest requests httpx
COPY polygraph_shim/sitecustomize.py /usr/local/lib/python3.11/site-packages/sitecustomize.py
COPY runner.py /runner.py
WORKDIR /app
