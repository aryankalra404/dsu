from flask import Flask, jsonify, request

from db import init_db, search_schemes

flask_app = Flask(__name__)
init_db()


def _extract_income(bio: str) -> str:
    digits = "".join(ch for ch in bio if ch.isdigit())
    return digits or "0"


@flask_app.get("/schemes")
def schemes_route():
    bio = request.args.get("bio", "")
    return jsonify(search_schemes(_extract_income(bio)))


def run(input: str) -> str:
    """Sandbox entry point: `import app; app.run(argv[1])` (see MVP.md §8 runner.py).

    Passes input straight to the DB layer, unmodified, so probe payloads reach
    the sink in `db.py` for the exploit-probe check.
    """
    return ", ".join(search_schemes(input))


if __name__ == "__main__":
    flask_app.run(host="0.0.0.0", port=5000)
