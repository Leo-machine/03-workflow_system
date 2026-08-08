"""图片上传接口。"""
from io import BytesIO

from tests.conftest import bearer


def _png_bytes() -> bytes:
    # 最小合法 PNG（1x1）
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f"
        b"\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def test_viewer_cannot_upload(client, viewer_token):
    r = client.post(
        "/api/uploads/images",
        files={"file": ("a.png", BytesIO(_png_bytes()), "image/png")},
        headers=bearer(viewer_token),
    )
    assert r.status_code == 403


def test_admin_upload_and_serve(client, admin_token):
    headers = bearer(admin_token)
    r = client.post(
        "/api/uploads/images",
        files={"file": ("shot.png", BytesIO(_png_bytes()), "image/png")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    path = r.json()["path"]
    assert path.startswith("/api/media/")
    assert path.endswith(".png")

    assert client.get(path).status_code == 401
    served = client.get(path, headers=headers)
    assert served.status_code == 200
    assert served.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_reject_non_image(client, admin_token):
    r = client.post(
        "/api/uploads/images",
        files={"file": ("a.txt", BytesIO(b"hello"), "text/plain")},
        headers=bearer(admin_token),
    )
    assert r.status_code == 422


def test_step_image_persisted_in_definition(client, admin_token, ledger):
    headers = bearer(admin_token)
    p1 = ledger["person_ids"][0]
    unit_id = ledger["unit_id"]
    up = client.post(
        "/api/uploads/images",
        files={"file": ("s.png", BytesIO(_png_bytes()), "image/png")},
        headers=headers,
    ).json()["path"]
    domains = client.get("/api/domains", headers=headers).json()
    delivery = next(d for d in domains if d["code"] == "it-resource-delivery")
    flow_id = client.post(
        "/api/flows",
        json={"domain_id": delivery["id"], "name": "图示流程"},
        headers=headers,
    ).json()["flow"]["id"]
    saved = client.put(
        f"/api/flows/{flow_id}/definition",
        json={
            "steps": [
                {
                    "code": "010",
                    "name": "申请",
                    "task": "发起",
                    "guide": [
                        {
                            "system_name": "云盾",
                            "action_text": "填单",
                            "url": "http://example.local",
                            "image_path": up,
                            "note": None,
                            "unit_id": unit_id,
                            "person_ids": [p1],
                        }
                    ],
                }
            ]
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    step = saved.json()["flow"]["steps"][0]
    assert step["guide"][0]["image_path"] == up
    assert step["guide"][0]["unit"]["id"] == unit_id
    assert step["guide"][0]["persons"][0]["id"] == p1
