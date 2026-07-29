"""数据库引擎与会话。测试通过依赖覆盖 get_db 注入 SQLite/PG。"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    """FastAPI 依赖：请求级会话。"""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
