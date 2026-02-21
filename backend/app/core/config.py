from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl
from typing import List

class Settings(BaseSettings):
    ENV: str = "dev"
    DATABASE_URL: str

    JWT_SECRET: str
    JWT_ACCESS_MINUTES: int = 30
    JWT_REFRESH_DAYS: int = 14

    # Comma-separated origins, e.g. "http://localhost:5173,https://your-frontend.vercel.app"
    CORS_ORIGINS: str = "http://localhost:5173"

    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

settings = Settings()
