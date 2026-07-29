"""测试基座。

- 快速组（默认）：SQLite 内存库 + TestClient，模型只用可移植类型，行为与 PG 一致；
- PG 组（@pytest.mark.pg，见 test_pg_integration.py）：testcontainers 起真实 Postgres，
  需本机 Docker 运行；可用 TEST_DATABASE_URL 指向外部 PG 作为离线备用路径。
"""
import os

os.environ.setdefault("JWT_SECRET", "test-secret")
# 占位，sqlite 测试不真正连接；防止 settings 在无 env 时拿到空值
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://flow:flow@localhost:5432/flowmap")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Person, StepPerson, Unit
from app.seed import seed_data

ADMIN = {"username": "admin", "password": "admin-pass"}
VIEWER = {"username": "viewer", "password": "viewer-pass"}


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # 全测试共享同一内存库
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def db_session(session_factory):
    with session_factory() as s:
        yield s


@pytest.fixture()
def seeded(session_factory):
    with session_factory() as s:
        seed_data(
            s,
            admin_username=ADMIN["username"],
            admin_password=ADMIN["password"],
            viewer_username=VIEWER["username"],
            viewer_password=VIEWER["password"],
        )
        s.commit()


@pytest.fixture()
def client(seeded, session_factory):
    def override_get_db():
        with session_factory() as s:
            yield s

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def login(client: TestClient, username: str, password: str) -> str:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_token(client) -> str:
    return login(client, ADMIN["username"], ADMIN["password"])


@pytest.fixture()
def viewer_token(client) -> str:
    return login(client, VIEWER["username"], VIEWER["password"])


@pytest.fixture()
def ledger(seeded, session_factory):
    """台账夹具：2 单位 + 3 人员；并给 seed 流程挂人
    （010→张三，011→李四+王五 并行）。seed 流程步骤 id 依入库顺序 1..10。
    """
    with session_factory() as s:
        u1 = Unit(name="平台运维组", order_index=0)
        u2 = Unit(name="调度中心", order_index=1)
        s.add_all([u1, u2])
        s.flush()
        p1 = Person(name="张三", unit_id=u1.id, title="系统设备主人")
        p2 = Person(name="李四", unit_id=u1.id, title="平台交付")
        p3 = Person(name="王五", unit_id=u2.id, title="监控交付")
        s.add_all([p1, p2, p3])
        s.flush()
        s.add(StepPerson(step_id=1, person_id=p1.id))  # 010 提交资源申请
        s.add(StepPerson(step_id=9, person_id=p2.id))  # 011 并行交付
        s.add(StepPerson(step_id=9, person_id=p3.id))
        s.commit()
        yield {
            "unit_ids": [u1.id, u2.id],
            "person_ids": [p1.id, p2.id, p3.id],
            "names": ["张三", "李四", "王五"],
        }
