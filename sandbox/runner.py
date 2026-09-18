"""Entry point for the sandbox container (MVP.md §8): `import app; out = app.run(sys.argv[1])`."""

import json
import os
import sys
import time

sys.path.insert(0, "/app")

OUT_DIR = "/out"


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    probe_input = sys.argv[1] if len(sys.argv) > 1 else ""

    import sitecustomize

    start = time.time()
    exit_code = 0
    output = ""
    stderr_tail = ""
    try:
        import app as agent_app

        output = agent_app.run(probe_input)
    except SystemExit as e:
        exit_code = e.code or 0
    except Exception as e:
        exit_code = 1
        stderr_tail = str(e)[-2000:]
    duration_ms = int((time.time() - start) * 1000)

    trace = {
        "run_id": os.environ.get("SOC_RUN_ID", ""),
        "exec_id": os.environ.get("SOC_EXEC_ID", ""),
        "mode": os.environ.get("SOC_MODE", "happy"),
        "iteration": int(os.environ.get("SOC_ITERATION", "0")),
        "input": probe_input,
        "output": output,
        "exit": exit_code,
        "duration_ms": duration_ms,
        "http": sitecustomize.HTTP_LOG,
        "calls": sitecustomize.CALL_LOG,
        "defined": sitecustomize.DEFINED,
        "stderr_tail": stderr_tail,
    }

    with open(os.path.join(OUT_DIR, "trace.json"), "w") as f:
        json.dump(trace, f)

    print(output)


if __name__ == "__main__":
    main()
