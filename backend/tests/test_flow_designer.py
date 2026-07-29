"""管理员流程设计器写接口：create / patch / definition / delete（person 模型）。"""
from tests.conftest import bearer


def test_viewer_cannot_mutate_flows(client, viewer_token):
    headers = bearer(viewer_token)
    assert client.post(
        "/api/flows",
        json={"domain_id": 6, "name": "x"},
        headers=headers,
    ).status_code == 403
    assert client.patch("/api/flows/1", json={"name": "x"}, headers=headers).status_code == 403
    assert client.put(
        "/api/flows/1/definition",
        json={"steps": []},
        headers=headers,
    ).status_code == 403
    assert client.delete("/api/flows/2", headers=headers).status_code == 403


def test_create_publish_definition_and_delete_draft(client, admin_token, ledger):
    headers = bearer(admin_token)
    p1, p2, _ = ledger["person_ids"]

    domains = client.get("/api/domains", headers=headers).json()
    delivery = next(d for d in domains if d["code"] == "it-resource-delivery")

    created = client.post(
        "/api/flows",
        json={"domain_id": delivery["id"], "name": "设计器测试流程", "description": "desc"},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    body = created.json()
    flow_id = body["flow"]["id"]
    assert body["flow"]["status"] == "draft"
    assert body["flow"]["domain_id"] == delivery["id"]
    assert body["flow"]["slug"]
    assert body["change_log_id"] is not None

    # definition: two steps, persons + guide
    saved = client.put(
        f"/api/flows/{flow_id}/definition",
        json={
            "steps": [
                {
                    "code": "A1",
                    "name": "申请",
                    "task": "发起申请",
                    "person_ids": [p1],
                    "guide": [
                        {
                            "system_name": "云盾",
                            "action_text": "登录并填单",
                            "url": "http://example.local",
                            "note": "注意工单号",
                        }
                    ],
                },
                {
                    "code": "A2",
                    "name": "并行交付",
                    "task": "两人并行",
                    "person_ids": [p1, p2],
                    "guide": [],
                },
            ]
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    detail = saved.json()["flow"]
    assert [s["code"] for s in detail["steps"]] == ["A1", "A2"]
    assert [s["order_index"] for s in detail["steps"]] == [0, 1]
    assert detail["steps"][0]["persons"][0]["name"] == "张三"
    assert detail["steps"][0]["guide"][0]["system_name"] == "云盾"
    assert len(detail["steps"][1]["persons"]) == 2

    # publish
    published = client.patch(
        f"/api/flows/{flow_id}",
        json={"status": "published"},
        headers=headers,
    )
    assert published.status_code == 200
    assert published.json()["flow"]["status"] == "published"

    domains_after = client.get("/api/domains", headers=headers).json()
    delivery_after = next(d for d in domains_after if d["id"] == delivery["id"])
    assert delivery_after["published_flow_count"] >= 2  # phys + this

    # cannot delete published
    assert client.delete(f"/api/flows/{flow_id}", headers=headers).status_code == 422

    # back to draft then delete
    client.patch(f"/api/flows/{flow_id}", json={"status": "draft"}, headers=headers)
    deleted = client.delete(f"/api/flows/{flow_id}", headers=headers)
    assert deleted.status_code == 200
    assert client.get(f"/api/flows/{flow_id}", headers=headers).status_code == 404


def test_definition_rejects_unknown_person(client, admin_token):
    headers = bearer(admin_token)
    r = client.put(
        "/api/flows/2/definition",
        json={"steps": [{"code": "X", "name": "x", "person_ids": [99999], "guide": []}]},
        headers=headers,
    )
    assert r.status_code == 422


def test_cannot_publish_empty_flow(client, admin_token):
    headers = bearer(admin_token)
    domains = client.get("/api/domains", headers=headers).json()
    delivery = next(d for d in domains if d["code"] == "it-resource-delivery")
    created = client.post(
        "/api/flows",
        json={"domain_id": delivery["id"], "name": "空流程不可发"},
        headers=headers,
    ).json()
    flow_id = created["flow"]["id"]
    r = client.patch(f"/api/flows/{flow_id}", json={"status": "published"}, headers=headers)
    assert r.status_code == 422
    assert "环节" in r.json()["detail"]
    client.delete(f"/api/flows/{flow_id}", headers=headers)


def test_published_flow_definition_frozen(client, admin_token):
    """已发布流程冻结定义：先回 draft 才能改。"""
    headers = bearer(admin_token)
    body = {"steps": [{"code": "X1", "name": "临时", "task": "", "person_ids": [], "guide": []}]}
    # flow 1 是 published：直接改定义 → 422
    assert client.put("/api/flows/1/definition", json=body, headers=headers).status_code == 422
    # 回 draft 后可改
    assert client.patch("/api/flows/1", json={"status": "draft"}, headers=headers).status_code == 200
    r = client.put("/api/flows/1/definition", json=body, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["changed"] is True


def test_definition_noop_skips_log(client, admin_token):
    """内容无变化：changed=false，不产生新日志。"""
    headers = bearer(admin_token)
    client.patch("/api/flows/1", json={"status": "draft"}, headers=headers)

    before = client.get("/api/flows/1", headers=headers).json()
    payload = {
        "steps": [
            {
                "code": s["code"],
                "name": s["name"],
                "task": s["task"],
                "person_ids": [p["id"] for p in s["persons"]],
                "guide": [
                    {
                        "system_name": g["system_name"],
                        "action_text": g["action_text"],
                        "url": g["url"],
                        "note": g["note"],
                    }
                    for g in s["guide"]
                ],
            }
            for s in before["steps"]
        ]
    }
    logs_before = len(client.get("/api/change-logs?limit=200", headers=headers).json())
    r = client.put("/api/flows/1/definition", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["changed"] is False
    assert r.json()["change_log_id"] is None
    logs_after = len(client.get("/api/change-logs?limit=200", headers=headers).json())
    assert logs_after == logs_before

    # 选人顺序不同（集合语义）也算 no-op
    for step in payload["steps"]:
        step["person_ids"] = list(reversed(step["person_ids"]))
    r2 = client.put("/api/flows/1/definition", json=payload, headers=headers)
    assert r2.json()["changed"] is False


def test_patch_name_writes_old_new_name_snapshot(client, admin_token):
    headers = bearer(admin_token)
    r = client.patch("/api/flows/1", json={"name": "物理机资源申请（新）"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["changed"] is True
    logs = client.get("/api/change-logs?limit=1", headers=headers).json()
    log = logs[0]
    assert log["entity_type"] == "flow" and log["field"] == "name"
    assert log["old_name"] == "物理机服务器资源申请"
    assert log["new_name"] == "物理机资源申请（新）"


def test_patch_long_description_truncated_not_crash(client, admin_token):
    """value 列 String(100)：超长说明截断写入，PG 上不会报错。"""
    headers = bearer(admin_token)
    long_desc = "长" * 300
    r = client.patch("/api/flows/1", json={"description": long_desc}, headers=headers)
    assert r.status_code == 200, r.text
    logs = client.get("/api/change-logs?limit=1", headers=headers).json()
    assert len(logs[0]["new_value"]) <= 100
