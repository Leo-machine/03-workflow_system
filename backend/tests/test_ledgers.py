"""台账 CRUD：units / persons，含引用保护、权限、留痕。"""
from tests.conftest import bearer


# ---------- units ----------

def test_units_list_starts_empty(client, viewer_token):
    r = client.get("/api/units", headers=bearer(viewer_token))
    assert r.status_code == 200
    assert r.json() == []


def test_unit_crud_and_logs(client, admin_token):
    headers = bearer(admin_token)
    # create
    r = client.post("/api/units", json={"name": "平台运维组"}, headers=headers)
    assert r.status_code == 200, r.text
    unit_id = r.json()["id"]
    # 重名 → 422
    assert client.post("/api/units", json={"name": "平台运维组"}, headers=headers).status_code == 422
    # update
    r = client.put(f"/api/units/{unit_id}", json={"name": "平台运维大组"}, headers=headers)
    assert r.status_code == 200 and r.json()["name"] == "平台运维大组"
    logs = client.get("/api/change-logs", headers=headers).json()
    name_log = next(log for log in logs if log["entity_type"] == "unit" and log["field"] == "name")
    assert name_log["old_name"] == "平台运维组"
    assert name_log["new_name"] == "平台运维大组"
    # delete
    assert client.delete(f"/api/units/{unit_id}", headers=headers).status_code == 200


def test_unit_delete_guarded_by_person_refs(client, admin_token, ledger):
    headers = bearer(admin_token)
    unit_id = ledger["unit_ids"][0]
    r = client.delete(f"/api/units/{unit_id}", headers=headers)
    assert r.status_code == 422


def test_unit_mutations_require_admin(client, viewer_token):
    headers = bearer(viewer_token)
    assert client.post("/api/units", json={"name": "x"}, headers=headers).status_code == 403
    assert client.put("/api/units/1", json={"name": "x"}, headers=headers).status_code == 403
    assert client.delete("/api/units/1", headers=headers).status_code == 403


# ---------- persons ----------

def test_person_crud(client, admin_token):
    headers = bearer(admin_token)
    unit = client.post("/api/units", json={"name": "调度中心"}, headers=headers).json()

    r = client.post(
        "/api/persons",
        json={"name": "赵六", "unit_id": unit["id"], "title": "值班员"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    person = r.json()
    assert person["unit"]["name"] == "调度中心"
    assert person["title"] == "值班员"

    # 挂在不存在单位 → 422
    assert client.post(
        "/api/persons", json={"name": "x", "unit_id": 9999}, headers=headers
    ).status_code == 422

    # update：换单位 + 改名，留痕
    unit2 = client.post("/api/units", json={"name": "安运组"}, headers=headers).json()
    r = client.put(
        f"/api/persons/{person['id']}",
        json={"name": "赵小七", "unit_id": unit2["id"], "title": "值班员", "active": True},
        headers=headers,
    )
    assert r.status_code == 200
    logs = client.get("/api/change-logs", headers=headers).json()
    person_logs = [log for log in logs if log["entity_type"] == "person"]
    assert any(log["field"] == "name" and log["old_name"] == "赵六" for log in person_logs)
    assert any(log["field"] == "unit" and log["new_value"] == "安运组" for log in person_logs)

    # no-op update：不写日志
    before = len(client.get("/api/change-logs", headers=headers).json())
    client.put(
        f"/api/persons/{person['id']}",
        json={"name": "赵小七", "unit_id": unit2["id"], "title": "值班员", "active": True},
        headers=headers,
    )
    after = len(client.get("/api/change-logs", headers=headers).json())
    assert after == before

    # delete
    assert client.delete(f"/api/persons/{person['id']}", headers=headers).status_code == 200


def test_person_delete_guarded_by_step_refs(client, admin_token, ledger):
    headers = bearer(admin_token)
    zhangsan_id = ledger["person_ids"][0]  # 挂在 010 环节
    r = client.delete(f"/api/persons/{zhangsan_id}", headers=headers)
    assert r.status_code == 422


def test_person_mutations_require_admin(client, viewer_token):
    headers = bearer(viewer_token)
    assert client.post("/api/persons", json={"name": "x"}, headers=headers).status_code == 403
    assert client.put("/api/persons/1", json={"name": "x"}, headers=headers).status_code == 403
    assert client.delete("/api/persons/1", headers=headers).status_code == 403


def test_persons_list_includes_unit(client, viewer_token, ledger):
    r = client.get("/api/persons", headers=bearer(viewer_token))
    assert r.status_code == 200
    persons = {p["name"]: p for p in r.json()}
    assert persons["张三"]["unit"]["name"] == "平台运维组"
    assert persons["王五"]["unit"]["name"] == "调度中心"


# ---------- 可服务业务域（person↔domain 多对多） ----------

def test_person_service_domains_multi(client, admin_token):
    """新增/编辑人员可下拉多选业务域；不存在的域 422；列表返回域名。"""
    headers = bearer(admin_token)
    domains = client.get("/api/domains", headers=headers).json()
    d1, d2 = domains[0]["id"], domains[1]["id"]

    # 新增带两个可服务域
    r = client.post(
        "/api/persons",
        json={"name": "钱七", "domain_ids": [d1, d2]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    person = r.json()
    assert [d["name"] for d in person["domains"]] == [domains[0]["name"], domains[1]["name"]]

    # 不存在的域 → 422
    assert client.post(
        "/api/persons", json={"name": "x", "domain_ids": [99999]}, headers=headers
    ).status_code == 422

    # 编辑调整为一个域，留痕含域名快照
    r = client.put(
        f"/api/persons/{person['id']}",
        json={"name": "钱七", "domain_ids": [d2], "active": True},
        headers=headers,
    )
    assert r.status_code == 200
    assert [d["id"] for d in r.json()["domains"]] == [d2]
    logs = client.get("/api/change-logs", headers=headers).json()
    dom_log = next(log for log in logs if log["entity_type"] == "person" and log["field"] == "domains")
    assert domains[0]["name"] in (dom_log["old_value"] or "")
    assert dom_log["new_value"] == domains[1]["name"]

    # 列表接口也带 domains
    persons = {p["name"]: p for p in client.get("/api/persons", headers=headers).json()}
    assert [d["id"] for d in persons["钱七"]["domains"]] == [d2]
