"""真实 Postgres 集成测试（@pytest.mark.pg）。

- testcontainers 起 postgres:16-alpine（需本机 Docker）；
- 也可用 TEST_DATABASE_URL 环境变量指向外部 PG（离线/CI 备用），此时跳过容器启动；
- 覆盖：Alembic 迁移执行与往返、迁移结果与模型 metadata 一致、
  业务键/外键/step_persons 联合主键在 PG 上的真实约束行为、seed 幂等。

注意：本文件内测试共享同一个容器数据库，执行顺序即文件内书写顺序
（roundtrip 把库留在 head 空库状态 → 幂等测试 → 约束测试制造脏数据）。
"""
import os

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

pytestmark = pytest.mark.pg

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 固定种子行数（seed.py 为准；台账种子为空，由管理员在线维护）
SEED_COUNTS = {
    "business_domains": 6, "flows": 5, "steps": 10,
    "guide_items": 9, "users": 2, "persons": 0, "units": 0,
}


def _alembic(url: str, *args: str) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    old = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url  # alembic/env.py 运行期优先读环境变量
    try:
        getattr(command, args[0])(cfg, *args[1:])
    finally:
        if old is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = old


@pytest.fixture(scope="module")
def pg_url():
    external = os.environ.get("TEST_DATABASE_URL")
    if external:
        yield external
        return
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg.get_connection_url().replace("postgresql+psycopg2://", "postgresql+psycopg://")


@pytest.fixture(scope="module")
def pg_engine(pg_url):
    _alembic(pg_url, "upgrade", "head")
    engine = create_engine(pg_url)
    yield engine
    engine.dispose()


def test_alembic_migration_upgrade(pg_url):
    """迁移在全新 PG 上可执行；数据保留型迁移不强制提供破坏性 downgrade。"""
    _alembic(pg_url, "upgrade", "head")

    engine = create_engine(pg_url)
    with engine.connect() as conn:
        tables = {
            r[0]
            for r in conn.execute(text(
                "SELECT tablename FROM pg_tables WHERE schemaname='public'"
            ))
        }
    expected = {
        "persons", "units", "step_persons", "person_domains", "flows", "steps",
        "guide_items", "change_logs", "users", "business_domains",
        "alembic_version",
    }
    assert expected <= tables
    engine.dispose()


def test_migration_matches_models(pg_url):
    """迁移建出的结构与 SQLAlchemy 模型 metadata 一致（防手写漂移）。"""
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from app.db import Base
    import app.models  # noqa: F401  确保全部表注册

    engine = create_engine(pg_url)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    engine.dispose()
    assert diff == [], f"迁移与模型不一致：{diff}"


def test_seed_idempotent_on_pg(pg_engine):
    """seed 在真实 PG 上跑两次：第二次不产生重复域或流程。"""
    from app.models import (
        BusinessDomain, Flow, GuideItem, Person, Step, Unit, User,
    )
    from app.seed import seed_data

    S = sessionmaker(bind=pg_engine, expire_on_commit=False)
    with S() as s:
        assert seed_data(s, admin_username="a", admin_password="x",
                         viewer_username="v", viewer_password="y") is True
        s.commit()
    with S() as s:
        assert seed_data(s, admin_username="a", admin_password="x",
                         viewer_username="v", viewer_password="y") is False
        s.commit()
    with S() as s:
        assert s.scalar(select(func.count(BusinessDomain.id))) == SEED_COUNTS["business_domains"]
        assert s.scalar(select(func.count(Flow.id))) == SEED_COUNTS["flows"]
        assert s.scalar(select(func.count(Step.id))) == SEED_COUNTS["steps"]
        assert s.scalar(select(func.count(GuideItem.id))) == SEED_COUNTS["guide_items"]
        assert s.scalar(select(func.count(User.id))) == SEED_COUNTS["users"]
        assert s.scalar(select(func.count(Person.id))) == SEED_COUNTS["persons"]
        assert s.scalar(select(func.count(Unit.id))) == SEED_COUNTS["units"]


def test_domain_and_flow_business_key_constraints_on_pg(pg_engine):
    """业务域 code、流程 slug 均唯一，流程不能引用不存在或被删除的域。"""
    with pytest.raises(IntegrityError):
        with pg_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO business_domains (code, name, description, icon, order_index) "
                "VALUES ('it-resource-delivery', '重复域', '', 'server', 99)"
            ))

    with pytest.raises(IntegrityError):
        with pg_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO flows "
                "(slug, domain_id, name, description, status, order_index, updated_by) "
                "VALUES ('phys-server-apply', NULL, '重复流程', '', 'draft', 99, 'pg-test')"
            ))

    with pytest.raises(IntegrityError):
        with pg_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO flows "
                "(slug, domain_id, name, description, status, order_index, updated_by) "
                "VALUES ('invalid-domain-flow', 999999, '错误域流程', '', 'draft', 99, 'pg-test')"
            ))

    with pytest.raises(IntegrityError):
        with pg_engine.begin() as conn:
            conn.execute(text(
                "DELETE FROM business_domains WHERE code = 'it-resource-delivery'"
            ))


def test_person_unit_fk_enforced(pg_engine):
    """人员不能挂在不存在的单位下（unit_id 外键）。"""
    with pytest.raises(IntegrityError):
        with pg_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO persons (name, unit_id, title, source, active) "
                "VALUES ('测试员', 999999, '', 'manual', true)"
            ))


def test_step_persons_composite_pk_enforced(pg_engine):
    """step_persons (step_id, person_id) 联合主键：重复挂同一人 → IntegrityError。"""
    with pg_engine.begin() as conn:
        max_pid = conn.execute(text("SELECT COALESCE(MAX(id),0) FROM persons")).scalar()
        step_id = conn.execute(text("SELECT MIN(id) FROM steps")).scalar()
        conn.execute(text(
            "INSERT INTO persons (id, name, unit_id, title, source, active) "
            f"VALUES ({max_pid + 1}, '测试员', NULL, '', 'manual', true)"
        ))
        conn.execute(text(
            f"INSERT INTO step_persons (step_id, person_id) VALUES ({step_id}, {max_pid + 1})"
        ))
    with pytest.raises(IntegrityError):
        with pg_engine.begin() as conn:
            conn.execute(text(
                f"INSERT INTO step_persons (step_id, person_id) VALUES ({step_id}, {max_pid + 1})"
            ))  # 主键冲突；begin() 退出时回滚，不脏库
