from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str = "postgresql+psycopg://nutri:nutri@localhost:5432/nutri_tracker"
    openfoodfacts_base_url: str = "https://world.openfoodfacts.org/api/v2"
    ocr_lang: str = "eng+spa"
    auth_secret_key: str = "change-me-in-production"
    auth_token_ttl_hours: int = 720
    verification_code_ttl_minutes: int = 15

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "no-reply@nutri-tracker.local"
    smtp_use_tls: bool = True
    expose_verification_code: bool = True
    dev_email_mode: bool = True
    ai_key_encryption_secret: str = "change-me-ai-key-secret"
    openai_base_url: str = "https://api.openai.com/v1"
    ai_provider_default: str = "openai"
    ai_key_test_timeout_seconds: float = 8.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
