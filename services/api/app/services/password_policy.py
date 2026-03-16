from __future__ import annotations

from functools import lru_cache
from pathlib import Path

COMMON_PASSWORDS_FILE = Path(__file__).resolve().parent.parent / "data" / "common-passwords-xato-top100k.txt"


@lru_cache(maxsize=1)
def _load_common_passwords() -> set[str]:
    if not COMMON_PASSWORDS_FILE.exists():
        return set()

    with COMMON_PASSWORDS_FILE.open("r", encoding="utf-8", errors="ignore") as handle:
        return {line.strip().lower() for line in handle if line.strip()}


def is_common_password(password: str) -> bool:
    normalized = password.strip().lower()
    if not normalized:
        return True

    return normalized in _load_common_passwords()


def validate_password_policy(password: str) -> None:
    if len(password) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres")

    if is_common_password(password):
        raise ValueError(
            "Contraseña demasiado común o fácil de adivinar. Usa una combinación más única."
        )
