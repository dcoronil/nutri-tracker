from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import get_settings
from app.services.password_policy import validate_password_policy

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class AuthTokenError(ValueError):
    pass


def validate_email_format(email: str) -> bool:
    return bool(EMAIL_RE.match(email.strip().lower()))


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    validate_password_policy(password)

    iterations = 200_000
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${derived.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_str, salt_hex, digest_hex = password_hash.split("$")
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    try:
        iterations = int(iterations_str)
    except ValueError:
        return False

    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    current = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(current, expected)


def create_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp_code(code: str) -> str:
    settings = get_settings()
    secret = settings.auth_secret_key.encode("utf-8")
    digest = hmac.new(secret, code.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest


def verify_otp_code(code: str, code_hash: str) -> bool:
    current = hash_otp_code(code)
    return hmac.compare_digest(current, code_hash)


def create_access_token(user_id: int, email: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(hours=settings.auth_token_ttl_hours)

    payload = {
        "uid": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    payload_raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_enc = _b64url_encode(payload_raw)

    signature = hmac.new(
        settings.auth_secret_key.encode("utf-8"),
        payload_enc.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    return f"{payload_enc}.{_b64url_encode(signature)}"


def verify_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()

    try:
        payload_enc, signature_enc = token.split(".", maxsplit=1)
    except ValueError as exc:
        raise AuthTokenError("Token inválido") from exc

    expected_signature = hmac.new(
        settings.auth_secret_key.encode("utf-8"),
        payload_enc.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    provided_signature = _b64url_decode(signature_enc)
    if not hmac.compare_digest(expected_signature, provided_signature):
        raise AuthTokenError("Firma de token inválida")

    try:
        payload = json.loads(_b64url_decode(payload_enc).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise AuthTokenError("Payload de token inválido") from exc

    exp = payload.get("exp")
    uid = payload.get("uid")

    if not isinstance(exp, int) or not isinstance(uid, int):
        raise AuthTokenError("Claims de token inválidas")

    if exp < int(datetime.now(UTC).timestamp()):
        raise AuthTokenError("Token expirado")

    return payload
