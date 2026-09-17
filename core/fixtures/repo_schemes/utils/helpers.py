def slugify(text: str) -> str:
    return "-".join(text.strip().lower().split())


def truncate(text: str, length: int = 80) -> str:
    return text if len(text) <= length else text[: length - 1] + "…"
