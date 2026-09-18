from fastapi import FastAPI

app = FastAPI()

CANNED_SCHEMES = [
    {"name": "Rural Housing Grant", "min_income": 0},
    {"name": "Student Stipend", "min_income": 20000},
    {"name": "Senior Pension Top-up", "min_income": 0},
]


@app.api_route("/{full_path:path}", methods=["GET", "POST"])
def catch_all(full_path: str):
    if "chat/completions" in full_path:
        return {"choices": [{"message": {"role": "assistant", "content": "canned completion"}}]}
    return {"schemes": CANNED_SCHEMES}
