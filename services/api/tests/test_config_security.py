import pytest

from app.config import Settings


def test_production_rejects_known_secrets():
    settings = Settings(
        environment="production",
        auth_secret_key="change-me-in-production",
        ai_key_encryption_secret="change-me-ai-key-secret",
        database_url="postgresql+psycopg://app:strong-password@db:5432/nutri_tracker",
    )

    with pytest.raises(RuntimeError, match="explicit AUTH_SECRET_KEY"):
        settings.validate_for_runtime()


def test_production_rejects_wildcard_cors():
    settings = Settings(
        environment="production",
        auth_secret_key="auth-secret",
        ai_key_encryption_secret="ai-secret",
        database_url="postgresql+psycopg://app:strong-password@db:5432/nutri_tracker",
        cors_origins="*",
    )

    with pytest.raises(RuntimeError, match="explicit origins"):
        settings.validate_for_runtime()
