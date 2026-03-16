from __future__ import annotations

import asyncio
import contextlib
import re
import time
import unicodedata
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings
from app.models import NutritionBasis

CRITICAL_FIELDS = ["kcal", "protein_g", "fat_g", "carbs_g"]
OFF_HEADERS = {
    "User-Agent": "nutri-tracker/0.1 (+https://github.com/nutri-tracker)",
}
OFF_FALLBACK_BASE_URLS = (
    "https://es.openfoodfacts.org/api/v2",
    "https://fr.openfoodfacts.org/api/v2",
    "https://world.openfoodfacts.org/api/v2",
)
SEARCH_FIELDS = ",".join(
    [
        "code",
        "product_name",
        "generic_name",
        "brands",
        "brands_tags",
        "countries",
        "countries_tags",
        "lang",
        "categories",
        "categories_tags",
        "image_front_url",
        "image_url",
        "serving_quantity",
        "product_quantity",
        "nutriments",
    ]
)


class OpenFoodFactsClientError(RuntimeError):
    pass


@dataclass(slots=True)
class _CacheEntry:
    value: Any
    expires_at: float


_OFF_CLIENT: httpx.AsyncClient | None = None
_OFF_CLIENT_LOCK: asyncio.Lock | None = None
_OFF_SEARCH_CACHE: dict[tuple[str, int, str], _CacheEntry] = {}
_OFF_PRODUCT_CACHE: dict[str, _CacheEntry] = {}
_OFF_MIRROR_FAILURES: dict[str, float] = {}
_NO_SUCCESS = object()


def _normalize_search_text(value: str) -> str:
    lowered = value.strip().lower()
    folded = unicodedata.normalize("NFKD", lowered)
    without_accents = "".join(char for char in folded if not unicodedata.combining(char))
    compact = re.sub(r"[^a-z0-9]+", " ", without_accents)
    return re.sub(r"\s+", " ", compact).strip()


def _brand_tag(value: str) -> str | None:
    normalized = _normalize_search_text(value)
    if not normalized:
        return None
    tag = normalized.replace(" ", "-")
    return tag or None


def _is_brand_focused_query(query: str) -> bool:
    tokens = [token for token in _normalize_search_text(query).split(" ") if token]
    return len(tokens) == 1 and len(tokens[0]) >= 3


def _brand_query_bonus(query: str, name: str, brand: str) -> float:
    if not _is_brand_focused_query(query):
        return 0.0

    q = _normalize_search_text(query)
    name_l = _normalize_search_text(name)
    brand_l = _normalize_search_text(brand)
    if not q or not brand_l:
        return 0.0

    bonus = 0.0
    if brand_l == q:
        bonus += 260.0
    elif brand_l.startswith(q):
        bonus += 120.0
    elif q in brand_l:
        bonus += 45.0

    if brand_l == q and name_l.startswith(q):
        bonus += 40.0
    return bonus


def _off_match_score(query: str, candidate: dict[str, Any]) -> float:
    q = _normalize_search_text(query)
    if not q:
        return 0.0

    name = _normalize_search_text(str(candidate.get("name") or ""))
    brand = _normalize_search_text(str(candidate.get("brand") or ""))
    lang = _normalize_search_text(str(candidate.get("lang") or ""))
    countries_tags_raw = candidate.get("countries_tags") or []
    if isinstance(countries_tags_raw, str):
        countries_tags = [_normalize_search_text(countries_tags_raw)]
    elif isinstance(countries_tags_raw, list):
        countries_tags = [_normalize_search_text(str(item)) for item in countries_tags_raw if item]
    else:
        countries_tags = []
    countries_text = _normalize_search_text(str(candidate.get("countries") or ""))
    score = 0.0

    if name == q:
        score += 900.0
    elif name.startswith(q):
        score += 520.0
    elif q in name:
        score += 260.0

    if brand == q:
        score += 700.0
    elif brand.startswith(q):
        score += 420.0
    elif q in brand:
        score += 240.0

    score += _brand_query_bonus(query, name, brand)

    query_tokens = [token for token in q.split(" ") if token]
    if query_tokens:
        merged = f"{name} {brand}".strip()
        if merged and all(token in merged for token in query_tokens):
            score += 180.0
        for token in query_tokens:
            if token in name:
                score += 70.0
            if token in brand:
                score += 92.0

    if candidate.get("kcal") is not None:
        score += 8.0
    else:
        score -= 45.0

    has_spain = any(
        tag in {"en:spain", "es:espana", "es:españa", "spain", "espana", "españa"} for tag in countries_tags
    ) or ("spain" in countries_text or "españa" in countries_text or "espana" in countries_text)
    eu_nearby_tags = {
        "en:france",
        "en:portugal",
        "en:italy",
        "en:germany",
        "en:belgium",
        "en:netherlands",
        "en:ireland",
        "en:austria",
        "en:poland",
        "en:sweden",
        "en:denmark",
    }
    has_nearby_eu = any(tag in eu_nearby_tags for tag in countries_tags)
    has_any_country = bool(countries_tags) or bool(countries_text)
    if has_spain:
        score += 320.0
    elif has_nearby_eu:
        score += 110.0
    elif has_any_country:
        score -= 120.0

    if lang.startswith("es"):
        score += 110.0
    elif lang.startswith(("fr", "pt", "it")):
        score += 20.0
    elif lang:
        score -= 30.0

    alpha_ratio = (sum(1 for char in name if "a" <= char <= "z") / max(len(name), 1)) if name else 0.0
    if alpha_ratio < 0.55:
        score -= 55.0
    if not candidate.get("protein_g") and not candidate.get("fat_g") and not candidate.get("carbs_g"):
        score -= 30.0

    return score


def _candidate_base_urls(primary_base_url: str) -> list[str]:
    normalized_primary = primary_base_url.rstrip("/")
    candidates = [normalized_primary, *OFF_FALLBACK_BASE_URLS]
    deduped: list[str] = []
    for base_url in candidates:
        normalized = base_url.rstrip("/")
        if normalized and normalized not in deduped:
            deduped.append(normalized)
    return deduped


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", ".")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _basis_from_nutriments(nutriments: dict[str, Any]) -> NutritionBasis | None:
    if any(key.endswith("_100g") for key in nutriments):
        return NutritionBasis.per_100g
    if any(key.endswith("_100ml") for key in nutriments):
        return NutritionBasis.per_100ml
    if any(key.endswith("_serving") for key in nutriments):
        return NutritionBasis.per_serving
    return None


def _pick(nutriments: dict[str, Any], base_key: str, basis: NutritionBasis | None) -> float | None:
    keys: list[str] = []
    if basis == NutritionBasis.per_100g:
        keys = [f"{base_key}_100g"]
    elif basis == NutritionBasis.per_100ml:
        keys = [f"{base_key}_100ml"]
    elif basis == NutritionBasis.per_serving:
        keys = [f"{base_key}_serving"]

    keys.extend([base_key, f"{base_key}_value"])

    for key in keys:
        value = _to_float(nutriments.get(key))
        if value is not None:
            return value
    return None


def _extract_product_entry(product: dict[str, Any]) -> dict[str, Any] | None:
    code = str(product.get("code") or "").strip()
    if not code:
        return None

    nutriments = product.get("nutriments") or {}
    basis = _basis_from_nutriments(nutriments)
    name = (
        str(product.get("product_name") or "").strip()
        or str(product.get("generic_name") or "").strip()
        or "Producto sin nombre"
    )

    return {
        "barcode": code,
        "name": name,
        "generic_name": str(product.get("generic_name") or "").strip() or None,
        "brand": (product.get("brands") or "").split(",")[0].strip() or None,
        "brands_tags": product.get("brands_tags") if isinstance(product.get("brands_tags"), list) else [],
        "countries": product.get("countries"),
        "countries_tags": product.get("countries_tags") if isinstance(product.get("countries_tags"), list) else [],
        "lang": product.get("lang"),
        "categories": product.get("categories"),
        "categories_tags": product.get("categories_tags") if isinstance(product.get("categories_tags"), list) else [],
        "image_url": product.get("image_front_url") or product.get("image_url"),
        "nutrition_basis": basis,
        "serving_size_g": _to_float(product.get("serving_quantity")),
        "net_weight_g": _to_float(product.get("product_quantity")),
        "kcal": _pick(nutriments, "energy-kcal", basis),
        "protein_g": _pick(nutriments, "proteins", basis),
        "fat_g": _pick(nutriments, "fat", basis),
        "sat_fat_g": _pick(nutriments, "saturated-fat", basis),
        "carbs_g": _pick(nutriments, "carbohydrates", basis),
        "sugars_g": _pick(nutriments, "sugars", basis),
        "fiber_g": _pick(nutriments, "fiber", basis),
        "salt_g": _pick(nutriments, "salt", basis),
    }


def extract_product_from_openfoodfacts_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    if payload.get("status") != 1:
        return None

    product = payload.get("product") or {}
    return _extract_product_entry(product)


def extract_products_from_openfoodfacts_search_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    products = payload.get("products")
    if not isinstance(products, list):
        return []

    extracted: list[dict[str, Any]] = []
    seen_barcodes: set[str] = set()
    for raw in products:
        if not isinstance(raw, dict):
            continue
        candidate = _extract_product_entry(raw)
        if not candidate:
            continue
        barcode = str(candidate.get("barcode") or "").strip()
        if not barcode or barcode in seen_barcodes:
            continue
        seen_barcodes.add(barcode)
        extracted.append(candidate)
    return extracted


def missing_critical_fields(nutrition: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    if nutrition.get("nutrition_basis") is None:
        missing.append("nutrition_basis")
    for key in CRITICAL_FIELDS:
        if nutrition.get(key) is None:
            missing.append(key)
    return missing


def _monotonic() -> float:
    return time.monotonic()


def _cache_lookup(cache: dict[Any, _CacheEntry], key: Any) -> tuple[bool, Any]:
    entry = cache.get(key)
    if entry is None:
        return False, None
    if entry.expires_at <= _monotonic():
        cache.pop(key, None)
        return False, None
    return True, entry.value


def _cache_store(cache: dict[Any, _CacheEntry], key: Any, value: Any, ttl_seconds: float) -> None:
    cache[key] = _CacheEntry(value=value, expires_at=_monotonic() + max(ttl_seconds, 1.0))


def _search_cache_key(query: str, bounded_limit: int, *, rescue_mode: bool = False) -> tuple[str, int, str]:
    return (_normalize_search_text(query), bounded_limit, "rescue" if rescue_mode else "normal")


def _clone_search_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(item) for item in results]


def _clone_product(product: dict[str, Any] | None) -> dict[str, Any] | None:
    if product is None:
        return None
    return dict(product)


def _failure_ttl_seconds() -> float:
    settings = get_settings()
    return float(max(30, settings.openfoodfacts_failure_ttl_seconds))


def _mark_mirror_success(base_url: str) -> None:
    _OFF_MIRROR_FAILURES.pop(base_url.rstrip("/"), None)


def _mark_mirror_failure(base_url: str) -> None:
    _OFF_MIRROR_FAILURES[base_url.rstrip("/")] = _monotonic() + _failure_ttl_seconds()


def _mirror_temporarily_disabled(base_url: str) -> bool:
    normalized = base_url.rstrip("/")
    expires_at = _OFF_MIRROR_FAILURES.get(normalized)
    if expires_at is None:
        return False
    if expires_at <= _monotonic():
        _OFF_MIRROR_FAILURES.pop(normalized, None)
        return False
    return True


def _active_candidate_base_urls(
    primary_base_url: str,
    *,
    max_count: int | None = None,
    allow_disabled_fallback: bool = False,
) -> list[str]:
    candidates = _candidate_base_urls(primary_base_url)
    active = [url for url in candidates if not _mirror_temporarily_disabled(url)]
    if allow_disabled_fallback and not active:
        active = list(candidates)
    if max_count is None:
        return active
    return active[: max(1, max_count)]


def _text_timeout(*, rescue_mode: bool = False) -> httpx.Timeout:
    settings = get_settings()
    if rescue_mode:
        total = max(1.0, float(settings.openfoodfacts_rescue_text_timeout_seconds))
        connect = min(total, max(0.2, float(settings.openfoodfacts_rescue_text_connect_timeout_seconds)))
    else:
        total = max(0.5, float(settings.openfoodfacts_text_timeout_seconds))
        connect = min(total, max(0.1, float(settings.openfoodfacts_text_connect_timeout_seconds)))
    return httpx.Timeout(total, connect=connect)


def _barcode_timeout() -> httpx.Timeout:
    settings = get_settings()
    total = max(0.8, float(settings.openfoodfacts_barcode_timeout_seconds))
    connect = min(total, max(0.1, float(settings.openfoodfacts_barcode_connect_timeout_seconds)))
    return httpx.Timeout(total, connect=connect)


async def _get_off_client() -> httpx.AsyncClient:
    global _OFF_CLIENT, _OFF_CLIENT_LOCK

    if _OFF_CLIENT is not None:
        return _OFF_CLIENT

    if _OFF_CLIENT_LOCK is None:
        _OFF_CLIENT_LOCK = asyncio.Lock()

    async with _OFF_CLIENT_LOCK:
        if _OFF_CLIENT is None:
            settings = get_settings()
            limits = httpx.Limits(
                max_connections=max(4, settings.openfoodfacts_http_max_connections),
                max_keepalive_connections=max(2, settings.openfoodfacts_http_keepalive_connections),
            )
            _OFF_CLIENT = httpx.AsyncClient(headers=OFF_HEADERS, limits=limits)

    return _OFF_CLIENT


async def close_openfoodfacts_client() -> None:
    global _OFF_CLIENT
    if _OFF_CLIENT is None:
        return
    await _OFF_CLIENT.aclose()
    _OFF_CLIENT = None


def _scored_candidates(query: str, candidates: list[dict[str, Any]], bounded_limit: int) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen_barcodes: set[str] = set()
    for candidate in candidates:
        barcode = str(candidate.get("barcode") or "").strip()
        if not barcode or barcode in seen_barcodes:
            continue
        seen_barcodes.add(barcode)
        scored = dict(candidate)
        scored["_off_score"] = _off_match_score(query, candidate)
        deduped.append(scored)

    deduped.sort(key=lambda item: float(item.get("_off_score") or 0.0), reverse=True)
    return deduped[:bounded_limit]


def _search_page_size(query: str, *, bounded_limit: int, rescue_mode: bool) -> int:
    settings = get_settings()
    normalized_query = _normalize_search_text(query)
    token_count = len([token for token in normalized_query.split(" ") if token])
    base_page_size = max(10, min(24, bounded_limit * 2))
    if token_count == 1 and len(normalized_query) <= 4:
        return max(base_page_size, min(60, settings.openfoodfacts_short_query_page_size))
    if rescue_mode and token_count == 1 and len(normalized_query) <= 8:
        return max(base_page_size, min(60, settings.openfoodfacts_short_query_page_size))
    return base_page_size


def _should_use_brand_fallback(query: str, *, rescue_mode: bool) -> bool:
    normalized_query = _normalize_search_text(query)
    if rescue_mode:
        return False
    if not _is_brand_focused_query(query):
        return False
    return len(normalized_query) >= 5


def _rescue_query_variant(query: str) -> str | None:
    normalized_query = _normalize_search_text(query)
    tokens = [token for token in normalized_query.split(" ") if token]
    if len(tokens) != 1:
        return None

    token = tokens[0]
    candidates: list[str] = []
    if token.endswith("es") and len(token) > 4:
        candidates.append(token[:-2])
    if token.endswith("s") and len(token) > 3:
        candidates.append(token[:-1])

    for candidate in candidates:
        if candidate and candidate != token and len(candidate) >= 2:
            return candidate
    return None


async def _search_single_mirror(
    base_url: str,
    query: str,
    *,
    bounded_limit: int,
    rescue_mode: bool,
) -> list[dict[str, Any]]:
    client = await _get_off_client()
    url = f"{base_url}/search"
    page_size = _search_page_size(query, bounded_limit=bounded_limit, rescue_mode=rescue_mode)
    timeout = _text_timeout(rescue_mode=rescue_mode)
    base_params = {
        "page_size": page_size,
        "page": 1,
        "fields": SEARCH_FIELDS,
        "search_simple": 1,
    }
    try:
        response = await client.get(
            url,
            params={
                **base_params,
                "search_terms": query,
            },
            timeout=timeout,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        _mark_mirror_failure(base_url)
        raise OpenFoodFactsClientError(f"{base_url}: {exc.__class__.__name__}") from exc

    _mark_mirror_success(base_url)
    payload = response.json()
    candidates = extract_products_from_openfoodfacts_search_payload(payload)
    tag = _brand_tag(query)

    if (
        tag
        and " " not in query.strip()
        and _should_use_brand_fallback(query, rescue_mode=rescue_mode)
        and len(candidates) < max(6, bounded_limit)
    ):
        try:
            brand_response = await client.get(
                url,
                params={
                    **base_params,
                    "brands_tags": tag,
                },
                timeout=timeout,
            )
            brand_response.raise_for_status()
            brand_payload = brand_response.json()
            candidates.extend(extract_products_from_openfoodfacts_search_payload(brand_payload))
        except httpx.HTTPError:
            pass

    return _scored_candidates(query, candidates, bounded_limit)


async def _fetch_single_mirror(base_url: str, ean: str) -> dict[str, Any] | None:
    client = await _get_off_client()
    url = f"{base_url}/product/{ean}.json"
    try:
        response = await client.get(url, timeout=_barcode_timeout())
        response.raise_for_status()
    except httpx.HTTPError as exc:
        _mark_mirror_failure(base_url)
        raise OpenFoodFactsClientError(f"{base_url}: {exc.__class__.__name__}") from exc

    _mark_mirror_success(base_url)
    payload = response.json()
    return extract_product_from_openfoodfacts_payload(payload)


async def _race_mirrors(
    base_urls: list[str],
    runner: Any,
) -> tuple[Any, list[str]]:
    if not base_urls:
        raise OpenFoodFactsClientError("OpenFoodFacts mirrors temporarily disabled")

    async def _wrapped(base_url: str) -> tuple[str, Any, OpenFoodFactsClientError | None]:
        try:
            return base_url, await runner(base_url), None
        except OpenFoodFactsClientError as exc:
            return base_url, None, exc
        except Exception as exc:  # pragma: no cover - defensive fallback
            return base_url, None, OpenFoodFactsClientError(f"{base_url}: {exc.__class__.__name__}")

    tasks = [asyncio.create_task(_wrapped(base_url)) for base_url in base_urls]
    errors: list[str] = []
    fallback_result: Any = _NO_SUCCESS

    try:
        for completed in asyncio.as_completed(tasks):
            base_url, result, error = await completed
            if error is not None:
                errors.append(str(error))
                continue
            if result:
                return result, errors
            if fallback_result is _NO_SUCCESS:
                fallback_result = result
        return fallback_result, errors
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task


async def fetch_openfoodfacts_product(ean: str) -> dict[str, Any] | None:
    barcode = ean.strip()
    if not barcode:
        return None

    hit, cached = _cache_lookup(_OFF_PRODUCT_CACHE, barcode)
    if hit:
        return _clone_product(cached)

    settings = get_settings()
    base_urls = _active_candidate_base_urls(settings.openfoodfacts_base_url)
    result, errors = await _race_mirrors(base_urls, lambda base_url: _fetch_single_mirror(base_url, barcode))

    if result is _NO_SUCCESS and errors:
        await close_openfoodfacts_client()
        raise OpenFoodFactsClientError(f"OpenFoodFacts request failed on all mirrors: {' | '.join(errors)}")

    if result is None:
        _cache_store(_OFF_PRODUCT_CACHE, barcode, None, settings.openfoodfacts_cache_ttl_seconds)
        return None

    _cache_store(_OFF_PRODUCT_CACHE, barcode, result, settings.openfoodfacts_cache_ttl_seconds)
    return _clone_product(result)


async def _run_openfoodfacts_text_search(
    query: str,
    *,
    bounded_limit: int,
    rescue_mode: bool,
) -> list[dict[str, Any]]:
    settings = get_settings()
    base_urls = _active_candidate_base_urls(
        settings.openfoodfacts_base_url,
        max_count=max(1, settings.openfoodfacts_max_search_mirrors),
        allow_disabled_fallback=True,
    )
    result, errors = await _race_mirrors(
        base_urls,
        lambda base_url: _search_single_mirror(
            base_url,
            query,
            bounded_limit=bounded_limit,
            rescue_mode=rescue_mode,
        ),
    )

    if result is _NO_SUCCESS and errors:
        await close_openfoodfacts_client()
        raise OpenFoodFactsClientError(f"OpenFoodFacts search request failed on all mirrors: {' | '.join(errors)}")

    return result if isinstance(result, list) else []


async def search_openfoodfacts_products(
    query: str,
    *,
    limit: int = 20,
    rescue_mode: bool = False,
) -> list[dict[str, Any]]:
    raw_query = query.strip()
    normalized_query = _normalize_search_text(raw_query)
    if not normalized_query:
        return []

    settings = get_settings()
    bounded_limit = max(1, min(limit, 20))
    cache_key = _search_cache_key(normalized_query, bounded_limit, rescue_mode=rescue_mode)
    hit, cached = _cache_lookup(_OFF_SEARCH_CACHE, cache_key)
    if hit:
        return _clone_search_results(cached)

    resolved = await _run_openfoodfacts_text_search(raw_query, bounded_limit=bounded_limit, rescue_mode=rescue_mode)
    if rescue_mode and not resolved:
        variant = _rescue_query_variant(raw_query)
        if variant and variant != normalized_query:
            resolved = await _run_openfoodfacts_text_search(
                variant,
                bounded_limit=bounded_limit,
                rescue_mode=True,
            )
    _cache_store(_OFF_SEARCH_CACHE, cache_key, resolved, settings.openfoodfacts_cache_ttl_seconds)
    return _clone_search_results(resolved)
