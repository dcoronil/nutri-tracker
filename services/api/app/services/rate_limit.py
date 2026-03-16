from __future__ import annotations

from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from threading import Lock

from fastapi import HTTPException, status


class InMemoryRateLimiter:
    """Simple in-memory limiter suitable for single-process deployments/dev."""

    def __init__(self) -> None:
        self._buckets: dict[str, deque[datetime]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, *, scope: str, key: str, limit: int, window_seconds: int) -> None:
        if limit <= 0 or window_seconds <= 0:
            return

        now = datetime.now(UTC)
        cutoff = now - timedelta(seconds=window_seconds)
        bucket_key = f"{scope}:{key}"

        with self._lock:
            events = self._buckets[bucket_key]
            while events and events[0] < cutoff:
                events.popleft()

            if len(events) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Demasiadas solicitudes. Inténtalo de nuevo en unos segundos.",
                )

            events.append(now)

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


rate_limiter = InMemoryRateLimiter()


def client_key_from_ip(ip: str | None) -> str:
    raw = (ip or "").strip()
    if not raw:
        return "unknown"
    # X-Forwarded-For may have multiple IPs: client,proxy1,proxy2
    return raw.split(",")[0].strip() or "unknown"
