from tests.conftest import bearer


def test_guide_archive_is_saved_per_user_and_can_restart(client, admin_token, viewer_token):
    flow = client.get("/api/flows/1", headers=bearer(admin_token)).json()
    step = flow["steps"][0]
    guide = step["guide"][1]
    body = {
        "step_id": step["id"],
        "guide_item_id": guide["id"],
        "status": "in_progress",
    }

    saved = client.put("/api/flows/1/guide-archive", json=body, headers=bearer(admin_token))
    assert saved.status_code == 200, saved.text
    first_id = saved.json()["id"]
    assert saved.json()["guide_item_id"] == guide["id"]
    assert client.get("/api/flows/1/guide-archive", headers=bearer(viewer_token)).json() is None

    completed = client.put(
        "/api/flows/1/guide-archive",
        json={**body, "status": "completed"},
        headers=bearer(admin_token),
    )
    assert completed.json()["id"] == first_id
    assert completed.json()["completed_at"] is not None

    restarted = client.put(
        "/api/flows/1/guide-archive",
        json={**body, "restart": True},
        headers=bearer(admin_token),
    )
    assert restarted.status_code == 200
    assert restarted.json()["id"] != first_id
    assert restarted.json()["status"] == "in_progress"


def test_guide_archive_rejects_step_from_another_flow(client, admin_token):
    other = client.get("/api/flows/6", headers=bearer(admin_token)).json()
    assert other["steps"]
    response = client.put(
        "/api/flows/1/guide-archive",
        json={"step_id": other["steps"][0]["id"], "status": "in_progress"},
        headers=bearer(admin_token),
    )
    assert response.status_code == 422
