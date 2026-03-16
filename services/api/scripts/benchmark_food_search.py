#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.api.routes import _local_search_candidates
from app.database import engine
from app.main import app
from app.models import UserAccount
from app.services import openfoodfacts
from app.services.auth import create_access_token

DEFAULT_QUERIES = [
    "pan",
    "hamburguesa",
    "pollo",
    "arroz",
    "huevo",
    "aceite",
    "manzana",
    "platano",
    "coca cola",
    "galleta",
    "carne",
    "yogur",
    "danone",
]


def _pick_user(session: Session, email: str | None) -> UserAccount:
    if email:
        user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
        if user is None:
            raise SystemExit(f"No se encontró usuario con email {email!r}")
        return user

    user = session.exec(select(UserAccount).where(UserAccount.onboarding_completed.is_(True)).limit(1)).first()
    if user is None:
        raise SystemExit("No hay usuario listo para ejecutar el benchmark")
    return user


def _headers_for_user(user: UserAccount) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email)}"}


def _benchmark_query(
    client: TestClient,
    session: Session,
    user: UserAccount,
    query: str,
    *,
    limit: int,
) -> dict[str, Any]:
    local_candidates = _local_search_candidates(
        session=session,
        current_user=user,
        query=query,
        bounded_limit=limit,
    )
    suggested_ids = {
        candidate.product.id
        for candidate in local_candidates
        if candidate.suggested and candidate.product.id is not None and candidate.relevance_score > 0
    }

    started_at = time.perf_counter()
    response = client.get(
        "/foods/search",
        params={"q": query, "limit": limit},
        headers=_headers_for_user(user),
    )
    elapsed_ms = (time.perf_counter() - started_at) * 1000.0
    response.raise_for_status()
    payload = response.json()
    rows = payload["results"]
    suggested_in_response = sum(
        1
        for item in rows
        if item["origin"] == "local" and item["product"]["id"] in suggested_ids
    )
    off_in_response = sum(1 for item in rows if item["origin"] == "openfoodfacts_remote")

    return {
        "query": query,
        "time_total_ms": round(elapsed_ms, 1),
        "result_count": len(rows),
        "relevant_count": len(rows) - suggested_in_response,
        "suggested_count": suggested_in_response,
        "openfoodfacts_count": off_in_response,
        "top5": [
            {
                "name": item["product"]["name"],
                "brand": item["product"]["brand"],
                "origin": item["origin"],
                "badge": item["badge"],
            }
            for item in rows[:5]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark reproducible de /foods/search")
    parser.add_argument("--email", help="Email del usuario a usar para autenticar la búsqueda")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--preserve-off-state", action="store_true")
    parser.add_argument("--queries", nargs="*", default=DEFAULT_QUERIES)
    args = parser.parse_args()

    with Session(engine) as session, TestClient(app) as client:
        user = _pick_user(session, args.email)
        results = []
        for query in args.queries:
            if not args.preserve_off_state:
                openfoodfacts._OFF_SEARCH_CACHE.clear()
                openfoodfacts._OFF_MIRROR_FAILURES.clear()
            results.append(_benchmark_query(client, session, user, query, limit=max(1, min(args.limit, 40))))

    if args.as_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return

    for row in results:
        print(
            f"{row['query']:<14} total={row['time_total_ms']:>7} ms  "
            f"results={row['result_count']:>2}  relevant={row['relevant_count']:>2}  "
            f"suggested={row['suggested_count']:>2}  off={row['openfoodfacts_count']:>2}"
        )
        for item in row["top5"]:
            print(f"  - {item['name']} | {item['brand']} | {item['origin']} | {item['badge']}")


if __name__ == "__main__":
    main()
