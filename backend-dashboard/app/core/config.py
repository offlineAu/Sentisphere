import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "Sentisphere Backend"
    ENV: str = os.getenv("ENV", "development")

    # Database
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASS: str = os.getenv("DB_PASS", "")
    DB_HOST: str = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT: str = os.getenv("DB_PORT", "3306")
    DB_NAME: str = os.getenv("DB_NAME", "sentisphere_app")
    DB_DRIVER: str = os.getenv("DB_DRIVER", "mysql+mysqlconnector")

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"{self.DB_DRIVER}://{self.DB_USER}:{self.DB_PASS}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def unified_db_url(self) -> str:
        """Unified database URL for both web and mobile connections."""
        return self.DATABASE_URL

    # ==========================================================================
    # DEPRECATED: Mobile database config (kept for backward compatibility)
    # As of Dec 2024, mobile and web now share a single unified database.
    # These vars are kept so old code importing them won't break.
    # ==========================================================================
    MOBILE_DB_USER: str | None = None
    MOBILE_DB_PASS: str | None = None
    MOBILE_DB_HOST: str | None = None
    MOBILE_DB_PORT: str | None = None
    MOBILE_DB_NAME: str | None = None
    MOBILE_DB_DRIVER: str | None = None

    # CORS
    CORS_ORIGINS: List[str] = []

    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "super-dev-secret-please-change-later")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))
    
    # Microsoft verification
    ALLOWED_EMAIL_DOMAINS: List[str] = [d.strip() for d in (os.getenv("ALLOWED_EMAIL_DOMAINS", "ustp.edu.ph").split(",")) if d.strip()]
    MS_TENANT_ID: str = os.getenv("MS_TENANT_ID", "")
    MS_CLIENT_ID: str = os.getenv("MS_CLIENT_ID", "")
    MS_CLIENT_SECRET: str = os.getenv("MS_CLIENT_SECRET", "")
    MS_VERIFY_STRICT: bool = os.getenv("MS_VERIFY_STRICT", "0") in ("1", "true", "True")
    ALLOW_PASSWORDLESS_STUDENT_LOGIN: bool = os.getenv("ALLOW_PASSWORDLESS_STUDENT_LOGIN", "1") in ("1", "true", "True")
    
    # Internal features / flags
    INTERNAL_API_TOKEN: str = os.getenv("INTERNAL_API_TOKEN", "")
    INSIGHTS_FEATURE_ENABLED: bool = os.getenv("INSIGHTS_FEATURE_ENABLED", "1") in ("1", "true", "True")
    
    # Pydantic v2 settings config
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

def _load_settings() -> "Settings":
    s = Settings()
    origins = os.getenv("FRONTEND_ORIGINS") or os.getenv("FRONTEND_ORIGIN")
    dev_defaults = [
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8010",
        "http://127.0.0.1:8010",
    ]
    if origins:
        provided = [o.strip() for o in origins.split(",") if o.strip()]
        # Always include dev defaults to prevent missing headers in local testing
        s.CORS_ORIGINS = sorted(set(provided + dev_defaults))
    else:
        s.CORS_ORIGINS = dev_defaults
    return s

settings = _load_settings()
