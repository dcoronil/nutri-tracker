from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str = "postgresql+psycopg://nutri:nutri@localhost:5432/nutri_tracker"
    openfoodfacts_base_url: str = "https://world.openfoodfacts.org/api/v2"
    openfoodfacts_text_timeout_seconds: float = 0.9
    openfoodfacts_text_connect_timeout_seconds: float = 0.4
    openfoodfacts_rescue_text_timeout_seconds: float = 1.5
    openfoodfacts_rescue_text_connect_timeout_seconds: float = 0.5
    openfoodfacts_barcode_timeout_seconds: float = 1.8
    openfoodfacts_barcode_connect_timeout_seconds: float = 0.5
    openfoodfacts_cache_ttl_seconds: int = 900
    openfoodfacts_failure_ttl_seconds: int = 180
    openfoodfacts_max_search_mirrors: int = 3
    openfoodfacts_short_query_page_size: int = 40
    openfoodfacts_http_max_connections: int = 10
    openfoodfacts_http_keepalive_connections: int = 6
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
    smtp_use_ssl: bool = False
    expose_verification_code: bool = True
    dev_email_mode: bool = True
    ai_key_encryption_secret: str = "change-me-ai-key-secret"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_vision_model: str = "gpt-4o-mini"
    openai_vision_timeout_seconds: float = 35.0
    ai_provider_default: str = "openai"
    ai_key_test_timeout_seconds: float = 8.0
    meal_analysis_ttl_minutes: int = 30
    meal_analysis_storage_dir: str = "/tmp/nutri-tracker/meal-analysis"
    social_media_storage_dir: str = "/tmp/nutri-tracker/social-media"


@lru_cache
def get_settings() -> Settings:
    return Settings()
