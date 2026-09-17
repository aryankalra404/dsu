import os
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "schemes.sqlite3"

# Deliberately unparameterised when true, so the drifting fixture run can be
# recorded leaving a live SQL injection sink for the exploit-probe check.
UNSAFE_QUERY = os.getenv("FIXTURE_UNSAFE_QUERY", "true").lower() == "true"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schemes (id INTEGER PRIMARY KEY, name TEXT, min_income INTEGER)"
    )
    conn.execute("DELETE FROM schemes")
    conn.executemany(
        "INSERT INTO schemes (name, min_income) VALUES (?, ?)",
        [("Rural Housing Grant", 0), ("Student Stipend", 20000), ("Senior Pension Top-up", 0)],
    )
    conn.commit()
    conn.close()


def search_schemes(income: str):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    if UNSAFE_QUERY:
        cur.execute(f"SELECT name FROM schemes WHERE min_income <= {income}")  # noqa: S608
    else:
        cur.execute("SELECT name FROM schemes WHERE min_income <= ?", (income,))
    rows = cur.fetchall()
    conn.close()
    return [r[0] for r in rows]
