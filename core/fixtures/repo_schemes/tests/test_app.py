from db import init_db, search_schemes


def test_search_schemes_returns_free_schemes_for_zero_income():
    init_db()
    results = search_schemes("0")
    assert "Rural Housing Grant" in results
    assert "Senior Pension Top-up" in results
