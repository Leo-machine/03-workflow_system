from tests.conftest import bearer


def test_event_can_atomically_start_with_first_flow(client, viewer_token):
    headers = bearer(viewer_token)
    created = client.post(
        "/api/guide-events",
        json={"title": "算力卡入库", "flow_id": 1},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    event = created.json()
    assert event["initiator_user_id"] > 0
    assert event["initiator_name"]
    assert len(created.json()["flows"]) == 1
    assert created.json()["flows"][0]["flow_id"] == 1
    reloaded = client.get(f"/api/guide-events/{event['id']}", headers=headers).json()
    assert reloaded["initiator_user_id"] == event["initiator_user_id"]
    assert reloaded["initiator_name"] == event["initiator_name"]

    before = len(client.get("/api/guide-events", headers=headers).json())
    rejected = client.post(
        "/api/guide-events",
        json={"title": "无效事项", "flow_id": 999999},
        headers=headers,
    )
    assert rejected.status_code == 404
    assert len(client.get("/api/guide-events", headers=headers).json()) == before


def test_event_can_group_multiple_instances_of_same_flow(client, viewer_token):
    headers = bearer(viewer_token)
    event = client.post(
        "/api/guide-events",
        json={"title": "服务器检修", "external_ref": "WO-2026-001"},
        headers=headers,
    )
    assert event.status_code == 201, event.text
    event_id = event.json()["id"]

    first = client.post(f"/api/guide-events/{event_id}/flows", json={"flow_id": 1}, headers=headers)
    second = client.post(f"/api/guide-events/{event_id}/flows", json={"flow_id": 1}, headers=headers)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]

    detail = client.get(f"/api/guide-events/{event_id}", headers=headers).json()
    assert detail["external_ref"] == "WO-2026-001"
    assert len(detail["flows"]) == 2

    renamed = client.patch(
        f"/api/guide-events/{event_id}",
        json={"title": "服务器A下线检修", "external_ref": "WO-2026-002"},
        headers=headers,
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "服务器A下线检修"
    assert renamed.json()["external_ref"] == "WO-2026-002"


def test_event_is_private_to_owner(client, viewer_token, admin_token):
    created = client.post("/api/guide-events", json={"title": "个人事项"}, headers=bearer(viewer_token)).json()
    assert client.get(f"/api/guide-events/{created['id']}", headers=bearer(admin_token)).status_code == 404


def test_event_can_be_searched_updated_and_deleted(client, viewer_token, admin_token):
    headers = bearer(viewer_token)
    first = client.post(
        "/api/guide-events",
        json={"title": "服务器A下线检修", "external_ref": "WO-2026-001"},
        headers=headers,
    ).json()
    second = client.post(
        "/api/guide-events",
        json={"title": "存储扩容", "external_ref": "WO-2026-088"},
        headers=headers,
    ).json()
    added = client.post(f"/api/guide-events/{first['id']}/flows", json={"flow_id": 1}, headers=headers)
    assert added.status_code == 201
    archive_id = added.json()["id"]

    by_title = client.get("/api/guide-events", params={"q": "下线"}, headers=headers)
    assert by_title.status_code == 200
    assert [item["id"] for item in by_title.json()] == [first["id"]]

    by_ref = client.get("/api/guide-events", params={"q": "WO-2026-088"}, headers=headers)
    assert [item["id"] for item in by_ref.json()] == [second["id"]]

    in_progress = client.get("/api/guide-events", params={"status": "in_progress"}, headers=headers)
    assert {item["id"] for item in in_progress.json()} == {first["id"], second["id"]}
    assert client.get("/api/guide-events", params={"status": "completed"}, headers=headers).json() == []
    assert client.get("/api/guide-events", params={"status": "unknown"}, headers=headers).status_code == 422

    patched = client.patch(
        f"/api/guide-events/{first['id']}",
        json={"title": "服务器A紧急下线", "external_ref": "WO-2026-009"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "服务器A紧急下线"
    assert patched.json()["external_ref"] == "WO-2026-009"

    removed = client.delete(f"/api/guide-events/{first['id']}/flows/{archive_id}", headers=headers)
    assert removed.status_code == 200
    assert client.get(f"/api/guide-archives/{archive_id}", headers=headers).status_code == 404
    assert client.get(f"/api/guide-events/{first['id']}", headers=headers).json()["flows"] == []

    assert client.delete(f"/api/guide-events/{first['id']}", headers=bearer(admin_token)).status_code == 404
    deleted = client.delete(f"/api/guide-events/{first['id']}", headers=headers)
    assert deleted.status_code == 200
    assert client.get(f"/api/guide-events/{first['id']}", headers=headers).status_code == 404
    remaining = client.get("/api/guide-events", headers=headers).json()
    assert [item["id"] for item in remaining] == [second["id"]]


def test_admin_can_disable_registered_user(client, admin_token):
    registered = client.post(
        "/api/auth/register",
        json={"username": "disabled_user", "password": "strong-pass", "display_name": "待停用"},
    ).json()
    user_id = registered["user"]["id"]
    response = client.patch(f"/api/users/{user_id}", json={"active": False}, headers=bearer(admin_token))
    assert response.status_code == 200
    assert response.json()["active"] is False
    assert client.post("/api/auth/login", json={"username": "disabled_user", "password": "strong-pass"}).status_code == 401
