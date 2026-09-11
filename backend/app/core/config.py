from typing import List

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Chrono-Twin API"
    API_V1_STR: str = "/api/v1"
    SCHEMA_VERSION: str = "0.2.0"

    # CORS: 콤마 구분 문자열 또는 JSON 리스트 허용
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = ["http://localhost:3000"]

    # 외부 API (선택) — 없으면 클라이언트가 sample/미인증 폴백
    FOODSAFETY_API_KEY: str = ""
    FITBIT_CLIENT_ID: str = ""

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _assemble_cors(cls, v):
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v


settings = Settings()
