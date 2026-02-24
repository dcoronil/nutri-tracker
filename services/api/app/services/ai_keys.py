from __future__ import annotations

import base64
import hashlib
import secrets
from typing import Literal

import httpx

from app.config import get_settings

AIProvider = Literal["openai", "gemini"]


class AIKeyError(RuntimeError):
    pass


class AIKeyValidationError(AIKeyError):
    pass


def _normalized_provider(provider: str | None) -> AIProvider:
    value = (provider or "").strip().lower()
    if value not in {"openai", "gemini"}:
        raise AIKeyValidationError("Unsupported AI provider")
    return value  # type: ignore[return-value]


def normalize_provider_or_default(provider: str | None) -> AIProvider:
    settings = get_settings()
    if provider and provider.strip():
        return _normalized_provider(provider)
    return _normalized_provider(settings.ai_provider_default)


def _derive_key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_api_key(raw_key: str) -> str:
    settings = get_settings()
    secret = settings.ai_key_encryption_secret.strip() or settings.auth_secret_key

    key_bytes = _derive_key(secret)
    nonce = secrets.token_bytes(16)
    payload = raw_key.encode("utf-8")
    encrypted = bytes(
        byte ^ key_bytes[idx % len(key_bytes)] ^ nonce[idx % len(nonce)] for idx, byte in enumerate(payload)
    )

    token = base64.urlsafe_b64encode(nonce + encrypted).decode("ascii")
    return f"v1:{token}"


def decrypt_api_key(encrypted_key: str) -> str:
    settings = get_settings()
    secret = settings.ai_key_encryption_secret.strip() or settings.auth_secret_key

    if not encrypted_key or ":" not in encrypted_key:
        raise AIKeyValidationError("Invalid encrypted key format")

    version, _, token = encrypted_key.partition(":")
    if version != "v1":
        raise AIKeyValidationError("Unsupported encrypted key format")

    try:
        decoded = base64.urlsafe_b64decode(token.encode("ascii"))
    except Exception as exc:  # pragma: no cover - invalid external value
        raise AIKeyValidationError("Invalid encrypted key payload") from exc

    if len(decoded) < 17:
        raise AIKeyValidationError("Invalid encrypted key payload")

    nonce = decoded[:16]
    ciphertext = decoded[16:]
    key_bytes = _derive_key(secret)
    plain = bytes(
        byte ^ key_bytes[idx % len(key_bytes)] ^ nonce[idx % len(nonce)] for idx, byte in enumerate(ciphertext)
    )

    try:
        return plain.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise AIKeyValidationError("Encrypted key could not be decoded") from exc


def validate_api_key_shape(provider: str, api_key: str) -> None:
    normalized_provider = _normalized_provider(provider)
    key = api_key.strip()
    if len(key) < 16:
        raise AIKeyValidationError("API key is too short")

    if normalized_provider == "openai" and not (key.startswith("sk-") or key.startswith("sess-")):
        raise AIKeyValidationError("OpenAI API key format looks invalid")


def mask_key_for_display(api_key: str) -> str:
    key = api_key.strip()
    if len(key) <= 8:
        return "********"
    return f"{key[:4]}...{key[-4:]}"


async def test_provider_api_key(provider: str, api_key: str) -> tuple[bool, str]:
    normalized_provider = _normalized_provider(provider)
    key = api_key.strip()
    validate_api_key_shape(normalized_provider, key)

    settings = get_settings()

    if normalized_provider == "openai":
        url = f"{settings.openai_base_url.rstrip('/')}/models?limit=1"
        headers = {"Authorization": f"Bearer {key}"}

        try:
            async with httpx.AsyncClient(timeout=settings.ai_key_test_timeout_seconds) as client:
                response = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            return False, f"Provider request failed: {exc}"

        if response.status_code == 200:
            return True, "OpenAI API key is valid"

        if response.status_code in {401, 403}:
            return False, "Invalid API key or insufficient permissions"

        return False, f"Provider error HTTP {response.status_code}"

    return False, "Provider test is not implemented yet"
