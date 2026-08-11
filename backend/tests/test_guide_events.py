from tests.conftest import bearer


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
