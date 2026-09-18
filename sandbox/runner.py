"""One sandbox execution (MVP.md §8) -> trace.json. Runs inside the Docker sandbox or as a subprocess, with the
polygraph shim already loaded via sitecustomize. Two ways to exercise the supervised repo:

  --pytest                    run the repo's own test suite (happy / chaos executions)
  --entry module:function     call function(input) with --input (probe / differential executions)
"""

import argparse
import contextlib
import importlib
import io
import json
import os
import sys
import time
import traceback


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--mode", default="happy")
    ap.add_argument("--exec-id", default="")
    ap.add_argument("--run-id", default="")
    ap.add_argument("--iteration", type=int, default=0)
    ap.add_argument("--claim-id", default=None)
    ap.add_argument("--pytest", action="store_true")
    ap.add_argument("--entry", default=None)
    ap.add_argument("--input", default="")
    args = ap.parse_args()

    app_dir = os.path.realpath(os.environ.get("SOC_APP_DIR", "/app"))
    os.chdir(app_dir)
    sys.path.insert(0, app_dir)

    try:
        import sitecustomize as shim  # the polygraph shim
    except ImportError:
        shim = None

    start = time.time()
    out_buf, err_tail, exit_code, output = io.StringIO(), "", 0, ""
    try:
        with contextlib.redirect_stdout(out_buf):
            if args.pytest:
                import pytest

                exit_code = int(pytest.main(["-q", "-p", "no:cacheprovider", "--color=no", app_dir]))
                output = out_buf.getvalue()[-4000:]
            elif args.entry:
                mod_name, _, fn_name = args.entry.partition(":")
                fn = getattr(importlib.import_module(mod_name), fn_name or "run")
                output = str(fn(args.input))
            else:
                raise SystemExit("runner: pass --pytest or --entry module:function")
    except SystemExit as e:
        exit_code = e.code if isinstance(e.code, int) else 1
    except BaseException:  # noqa: BLE001 -- the trace must record whatever the repo code raised
        exit_code = 1
        err_tail = traceback.format_exc()[-2000:]
    sys.setprofile(None)

    payload = shim.trace_payload() if shim and hasattr(shim, "trace_payload") else {"http": [], "calls": [], "defined": []}
    trace = {
        "run_id": args.run_id,
        "exec_id": args.exec_id,
        "mode": args.mode,
        "iteration": args.iteration,
        "input": args.input if args.entry else "pytest",
        "output": output if args.entry else (output or out_buf.getvalue()[-4000:]),
        "exit": exit_code,
        "duration_ms": int((time.time() - start) * 1000),
        **payload,
        "stderr_tail": err_tail,
    }
    if args.claim_id:
        trace["claim_id"] = args.claim_id
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(trace, f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
