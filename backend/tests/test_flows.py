"""GET /flows/{id} 返回结构：环节顺序、人员实时解析（含单位）、指引。"""
from tests.conftest import bearer, login, ADMIN

EXPECTED_CODES = ["010", "020", "030", "040", "050", "060", "070", "0100", "011", "014"]


def test_flows_requires_auth(client):
    assert client.get("/api/flows/1").status_code == 401


def test_draft_flow_hidden_from_viewer(client, viewer_token, admin_token):
    # seed 里 flows 2~5 为 draft；viewer 看 draft = 404（不暴露存在性），admin 可见
    assert client.get("/api/flows/2", headers=bearer(viewer_token)).status_code == 404
    assert client.get("/api/flows/2", headers=bearer(admin_token)).status_code == 200


def test_flow_detail_steps_ordered(client, admin_token, ledger):
    r = client.get("/api/flows/1", headers=bearer(admin_token))
    assert r.status_code == 200
    flow = r.json()

    steps = flow["steps"]
    assert [s["code"] for s in steps] == EXPECTED_CODES
    assert [s["order_index"] for s in steps] == list(range(10))


def test_flow_detail_persons_resolved_with_unit(client, admin_token, ledger):
    flow = client.get("/api/flows/1", headers=bearer(admin_token)).json()
    steps = flow["steps"]

    # 010 提交资源申请 → 张三（平台运维组）
    p010 = steps[0]["persons"]
    assert len(p010) == 1
    assert p010[0]["name"] == "张三"
    assert p010[0]["unit"]["name"] == "平台运维组"
    assert p010[0]["title"] == "系统设备主人"

    # 011 并行 → 李四 + 王五（跨单位）
    names = {p["name"] for p in steps[8]["persons"]}
    assert names == {"李四", "王五"}

    # 未选人的环节 persons 为空
    assert steps[1]["persons"] == []


def test_person_change_reflects_everywhere(client, admin_token, ledger):
    """台账里改名/调单位，所有引用该人员的环节实时跟着变（不限定死）。"""
    headers = bearer(admin_token)
    zhangsan_id = ledger["person_ids"][0]
    diaodu_id = ledger["unit_ids"][1]
    r = client.put(
        f"/api/persons/{zhangsan_id}",
        json={"name": "张三峰", "unit_id": diaodu_id, "title": "系统设备主人", "active": True},
        headers=headers,
    )
    assert r.status_code == 200
    flow = client.get("/api/flows/1", headers=headers).json()
    p010 = flow["steps"][0]["persons"][0]
    assert p010["name"] == "张三峰"
    assert p010["unit"]["name"] == "调度中心"


def test_flow_detail_guide_ordered_with_note(client, viewer_token):
    flow = client.get("/api/flows/1", headers=bearer(viewer_token)).json()
    guide = flow["steps"][0]["guide"]
    assert len(guide) == 8
    assert [g["order_index"] for g in guide] == list(range(1, 9))
    assert guide[0]["url"] == "http://10.100.186.75:8082/front/login"
    assert "办数字〔2026〕48号" in guide[1]["note"]
    assert guide[4]["system_name"] == "计算资源申请系统"
    # 050 环节 1 条指引；其余环节为空
    assert len(flow["steps"][4]["guide"]) == 1
    assert all(len(s["guide"]) == 0 for s in flow["steps"] if s["code"] not in ("010", "050"))


def test_flow_detail_404(client, admin_token):
    assert client.get("/api/flows/9999", headers=bearer(admin_token)).status_code == 404


def test_login_then_flows_with_token_in_response(client):
    token = login(client, ADMIN["username"], ADMIN["password"])
    assert client.get("/api/flows/1", headers=bearer(token)).status_code == 200
