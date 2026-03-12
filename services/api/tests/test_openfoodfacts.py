import asyncio

from app.services import openfoodfacts


def test_search_openfoodfacts_products_retries_basic_singular_variant_in_rescue_mode(monkeypatch):
    openfoodfacts._OFF_SEARCH_CACHE.clear()

    async def _mock_run(query: str, *, bounded_limit: int, rescue_mode: bool):
        assert bounded_limit == 20
        assert rescue_mode is True
        if query == "hamburguesas":
            return []
        if query == "hamburguesa":
            return [
                {
                    "barcode": "8410000000009",
                    "name": "Hamburguesa vacuno",
                    "brand": "Marca OFF",
                }
            ]
        return []

    monkeypatch.setattr(openfoodfacts, "_run_openfoodfacts_text_search", _mock_run)

    rows = asyncio.run(openfoodfacts.search_openfoodfacts_products("hamburguesas", limit=20, rescue_mode=True))

    assert rows
    assert rows[0]["name"] == "Hamburguesa vacuno"


def test_active_candidate_base_urls_rescue_ignores_breaker_when_all_mirrors_are_disabled():
    primary = "https://world.openfoodfacts.org/api/v2"
    candidates = openfoodfacts._candidate_base_urls(primary)
    openfoodfacts._OFF_MIRROR_FAILURES.clear()
    try:
        for candidate in candidates:
            openfoodfacts._OFF_MIRROR_FAILURES[candidate.rstrip("/")] = openfoodfacts._monotonic() + 60.0

        active = openfoodfacts._active_candidate_base_urls(
            primary,
            max_count=3,
            allow_disabled_fallback=True,
        )

        assert active[:3] == candidates[:3]
    finally:
        openfoodfacts._OFF_MIRROR_FAILURES.clear()
