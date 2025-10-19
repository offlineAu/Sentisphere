import os
from pydantic import BaseSettings, AnyHttpUrl
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "Sentisphere Backend"
    ENV: str = os.getenv("ENV", "development")

    # Database
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASS: str = os.getenv("DB_PASS", "")
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "3306")
    DB_NAME: str = os.getenv("DB_NAME", "sentisphere_app")
    DB_DRIVER: str = os.getenv("DB_DRIVER", "mysql+mysqlconnector")

    # CORS
    CORS_ORIGINS: List[AnyHttpUrl] = [
        os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    ]

    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-me-in-prod")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
