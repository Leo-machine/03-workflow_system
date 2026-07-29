"""应用配置：全部走环境变量 / .env，内网部署只换配置不改代码。"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://flow:flow@localhost:5432/flowmap"

    jwt_secret: str = "change-me-to-a-long-random-string"  # ⚠️ 迁内网前必改
    jwt_expire_minutes: int = 720  # 12h

    # 初始账号仅 seed 时生效
    admin_username: str = "admin"
    admin_password: str = "admin123"  # ⚠️ 迁内网前必改
    viewer_username: str = "viewer"
    viewer_password: str = "viewer123"  # ⚠️ 迁内网前必改

    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
