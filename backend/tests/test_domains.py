"""业务域导航接口与种子归属。"""
from sqlalchemy import func, select

from app.models import Flow, Step
from app.seed import seed_data
from tests.conftest import ADMIN, VIEWER, bearer


def test_domains_require_auth(client):
    assert client.get("/api/domains").status_code == 401
    assert client.get("/api/domains/1").status_code == 401


def test_domains_list_derives_published_count(client, viewer_token):
    response = client.get("/api/domains", headers=bearer(viewer_token))
    assert response.status_code == 200
    domains = response.json()

    assert len(domains) == 7
    assert [domain["name"] for domain in domains] == [
        "主机运维", "存储运维", "备份设备运维", "云平台运维", "平台软件运维", "IT资源交付",
        "协同办公体验区",
    ]
    assert [domain["published_flow_count"] for domain in domains] == [0, 0, 0, 0, 0, 1, 1]


def test_delivery_domain_lists_five_flows_and_physical_is_adopted(
    client, viewer_token, admin_token, db_session
):
    delivery = next(
        domain
        for domain in client.get("/api/domains", headers=bearer(viewer_token)).json()
        if domain["code"] == "it-resource-delivery"
    )
    # viewer：只看到已发布流程，draft 不暴露
    viewer_detail = client.get(
        f"/api/domains/{delivery['id']}", headers=bearer(viewer_token)
    ).json()
    assert [flow["status"] for flow in viewer_detail["flows"]] == ["published"]
    assert [flow["name"] for flow in viewer_detail["flows"]] == ["物理机服务器资源申请"]
    assert viewer_detail["flows"][0]["slug"] == "phys-server-apply"

    # admin：可见全部（含 draft）
    admin_detail = client.get(
        f"/api/domains/{delivery['id']}", headers=bearer(admin_token)
    ).json()
    assert [flow["status"] for flow in admin_detail["flows"]] == [
        "published", "draft", "draft", "draft", "draft",
    ]
    assert [flow["name"] for flow in admin_detail["flows"]] == [
        "物理机服务器资源申请",
        "虚拟机申请",
        "平台软件申请(操作系统/数据库/中间件/消息队列)",
        "备份资源申请",
        "资源扩容",
    ]

    physical = db_session.scalar(select(Flow).where(Flow.slug == "phys-server-apply"))
    assert physical is not None
    assert physical.domain_id == delivery["id"]


def test_seed_adopts_the_only_legacy_flow_with_steps_without_name_matching(db_session):
    legacy = Flow(name="任意历史名称", description="", status="draft", updated_by="legacy")
    db_session.add(legacy)
    db_session.flush()
    db_session.add(Step(
        flow_id=legacy.id,
        code="legacy",
        name="历史环节",
        task="",
        order_index=0,
    ))
    db_session.commit()

    assert seed_data(
        db_session,
        admin_username=ADMIN["username"],
        admin_password=ADMIN["password"],
        viewer_username=VIEWER["username"],
        viewer_password=VIEWER["password"],
    ) is True
    db_session.commit()

    adopted = db_session.scalar(select(Flow).where(Flow.slug == "phys-server-apply"))
    assert adopted is not None
    assert adopted.id == legacy.id
    assert adopted.name == "任意历史名称"
    assert adopted.status == "published"
    assert db_session.scalar(select(func.count(Flow.id))) == 6


# ---------- 管理员业务域增改删 ----------

def test_domain_create_update_delete(client, admin_token):
    headers = bearer(admin_token)
    # create
    r = client.post(
        "/api/domains",
        json={"code": "ai-computing", "name": "智能算力资源管理", "description": "算力资源", "icon": "compute"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    domain = r.json()
    assert domain["order_index"] == 7  # 排在 7 个种子域之后
    assert domain["published_flow_count"] == 0

    # 重码 / 非法码 → 422
    assert client.post(
        "/api/domains", json={"code": "ai-computing", "name": "重复"}, headers=headers
    ).status_code == 422
    assert client.post(
        "/api/domains", json={"code": "BAD CODE", "name": "坏码"}, headers=headers
    ).status_code == 422

    # update（code 不可变，改名留痕）
    r = client.put(
        f"/api/domains/{domain['id']}",
        json={"code": "ignored", "name": "智能算力管理", "description": "算力", "icon": "compute"},
        headers=headers,
    )
    assert r.status_code == 200 and r.json()["name"] == "智能算力管理"
    logs = client.get("/api/change-logs", headers=headers).json()
    rename = next(log for log in logs if log["entity_type"] == "domain" and log["field"] == "name")
    assert rename["old_name"] == "智能算力资源管理"

    # delete（空域可删）
    assert client.delete(f"/api/domains/{domain['id']}", headers=headers).status_code == 200
    assert client.delete(f"/api/domains/{domain['id']}", headers=headers).status_code == 404


def test_domain_delete_guarded_by_flows(client, admin_token):
    headers = bearer(admin_token)
    delivery = next(
        d for d in client.get("/api/domains", headers=headers).json()
        if d["code"] == "it-resource-delivery"
    )
    r = client.delete(f"/api/domains/{delivery['id']}", headers=headers)
    assert r.status_code == 422


def test_domain_delete_guarded_by_person_domains(client, admin_token):
    headers = bearer(admin_token)
    domain = client.post(
        "/api/domains",
        json={"code": "person-bound", "name": "人员绑定域", "description": "", "icon": "users"},
        headers=headers,
    ).json()
    person = client.post(
        "/api/persons",
        json={"name": "绑定测试员", "title": "测试", "domain_ids": [domain["id"]]},
        headers=headers,
    ).json()
    r = client.delete(f"/api/domains/{domain['id']}", headers=headers)
    assert r.status_code == 422
    assert "人员" in r.json()["detail"]
    # 解绑后可删
    client.put(
        f"/api/persons/{person['id']}",
        json={
            "name": person["name"],
            "unit_id": None,
            "title": person["title"],
            "contact": None,
            "active": True,
            "domain_ids": [],
        },
        headers=headers,
    )
    assert client.delete(f"/api/domains/{domain['id']}", headers=headers).status_code == 200


def test_domain_mutations_require_admin(client, viewer_token):
    headers = bearer(viewer_token)
    assert client.post("/api/domains", json={"code": "x-y", "name": "x"}, headers=headers).status_code == 403
    assert client.put("/api/domains/1", json={"code": "x", "name": "x"}, headers=headers).status_code == 403
    assert client.delete("/api/domains/1", headers=headers).status_code == 403
