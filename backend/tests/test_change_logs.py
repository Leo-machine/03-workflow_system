"""GET /change-logs：admin 专属、倒序、分页。日志由流程变更产生。"""
from tests.conftest import bearer


def test_viewer_forbidden(client, viewer_token):
    assert client.get("/api/change-logs", headers=bearer(viewer_token)).status_code == 403


def test_unauthenticated_rejected(client):
    assert client.get("/api/change-logs").status_code == 401


def test_empty_initially(client, admin_token):
    r = client.get("/api/change-logs", headers=bearer(admin_token))
    assert r.status_code == 200
    assert r.json() == []


def test_desc_order_and_pagination(client, admin_token):
    headers = bearer(admin_token)
    # 用流程变更造两条日志：改名 + 改状态
    client.patch("/api/flows/1", json={"name": "物理机服务器资源申请（临）"}, headers=headers)
    client.patch("/api/flows/1", json={"status": "draft"}, headers=headers)

    logs = client.get("/api/change-logs", headers=headers).json()
    assert len(logs) == 2
    assert logs[0]["id"] > logs[1]["id"]  # 新的在前
    assert logs[0]["entity_type"] == "flow" and logs[0]["field"] == "status"
    assert logs[1]["field"] == "name"
    assert logs[1]["old_name"] == "物理机服务器资源申请"
    assert logs[1]["new_name"] == "物理机服务器资源申请（临）"

    page1 = client.get("/api/change-logs?limit=1&offset=0", headers=headers).json()
    page2 = client.get("/api/change-logs?limit=1&offset=1", headers=headers).json()
    assert len(page1) == len(page2) == 1
    assert page1[0]["id"] != page2[0]["id"]


def test_filter_by_entity(client, admin_token):
    headers = bearer(admin_token)
    client.patch("/api/flows/1", json={"name": "物理机服务器资源申请（筛）"}, headers=headers)
    client.post(
        "/api/persons",
        json={"name": "日志筛选人", "title": "测试"},
        headers=headers,
    )
    all_logs = client.get("/api/change-logs", headers=headers).json()
    flow_logs = client.get("/api/change-logs?entity_type=flow&entity_id=1", headers=headers).json()
    assert flow_logs
    assert all(log["entity_type"] == "flow" and log["entity_id"] == "1" for log in flow_logs)
    assert len(flow_logs) < len(all_logs) or any(log["entity_type"] != "flow" for log in all_logs)
