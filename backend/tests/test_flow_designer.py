"""管理员流程设计器写接口：create / patch / definition / delete（person 模型）。"""
from app.models import StepPerson
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
    unit_id = ledger["unit_id"]

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

    # definition: two steps；责任团队/人挂在指引上
    saved = client.put(
        f"/api/flows/{flow_id}/definition",
        json={
            "steps": [
                {
                    "code": "A1",
                    "name": "申请",
                    "task": "发起申请",
                    "guide": [
                        {
                            "system_name": "云盾",
                            "action_text": "登录并填单",
                            "url": "http://example.local",
                            "note": "注意工单号",
                            "unit_id": unit_id,
                            "person_ids": [p1],
                        }
                    ],
                },
                {
                    "code": "A2",
                    "name": "并行交付",
                    "task": "两人并行",
                    "guide": [
                        {
                            "system_name": "工单",
                            "action_text": "并行处理",
                            "unit_id": unit_id,
                            "person_ids": [p1, p2],
                        }
                    ],
                },
            ]
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    detail = saved.json()["flow"]
    assert [s["code"] for s in detail["steps"]] == ["A1", "A2"]
    assert [s["order_index"] for s in detail["steps"]] == [0, 1]
    assert detail["steps"][0]["guide"][0]["persons"][0]["name"] == "张三"
    assert detail["steps"][0]["guide"][0]["unit"]["id"] == unit_id
    assert detail["steps"][0]["guide"][0]["system_name"] == "云盾"
    assert len(detail["steps"][1]["persons"]) == 2  # 聚合到环节供流程条

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


def test_legacy_step_persons_survive_definition_when_migrated_into_guides(
    client, admin_token, ledger
):
    """旧 step_persons 经「迁入指引」再保存后，责任人不被静默清空。"""
    headers = bearer(admin_token)
    p1 = ledger["person_ids"][0]
    unit_id = ledger["unit_id"]
    # flow 1 种子环节有指引但无指引责任人；ledger 把张三挂在 step 1（010）
    client.patch("/api/flows/1", json={"status": "draft"}, headers=headers)
    before = client.get("/api/flows/1", headers=headers).json()
    assert any(p["id"] == p1 for s in before["steps"] for p in s["persons"])

    # 模拟设计器 fromFlow 迁移：把环节旧责任人写入对应指引后保存
    payload = {
        "steps": [
            {
                "code": s["code"],
                "name": s["name"],
                "task": s["task"] + (" " if s["order_index"] == 0 else ""),  # 强制有变化
                "guide": [
                    {
                        "system_name": g["system_name"],
                        "action_text": g["action_text"],
                        "url": g["url"],
                        "note": g["note"],
                        "image_path": g["image_path"],
                        "unit_id": (
                            unit_id
                            if s["order_index"] == 0 and gi == 0
                            else (g["unit"]["id"] if g.get("unit") else None)
                        ),
                        "person_ids": (
                            [p1]
                            if s["order_index"] == 0 and gi == 0
                            else [p["id"] for p in (g.get("persons") or [])]
                        ),
                    }
                    for gi, g in enumerate(s["guide"])
                ],
            }
            for s in before["steps"]
        ]
    }
    # 去掉仅为触发变化加的空格 task 副作用：明确改第一条 task
    payload["steps"][0]["task"] = (before["steps"][0]["task"] or "") + "（迁移）"
    r = client.put("/api/flows/1/definition", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    after = r.json()["flow"]
    first = after["steps"][0]
    assert any(p["id"] == p1 for p in first["persons"])
    assert any(p["id"] == p1 for g in first["guide"] for p in g["persons"])
    client.patch("/api/flows/1", json={"status": "published"}, headers=headers)


def test_partial_guide_migration_still_exposes_unmigrated_step_people(
    client, admin_token, ledger, session_factory
):
    """部分指引已有责任人时，API 仍须返回 step_persons 中剩余的旧责任人。"""
    headers = bearer(admin_token)
    p1, p2, _ = ledger["person_ids"]
    unit_id = ledger["unit_id"]
    client.patch("/api/flows/1", json={"status": "draft"}, headers=headers)
    before = client.get("/api/flows/1", headers=headers).json()
    payload = {
        "steps": [
            {
                "code": step["code"],
                "name": step["name"],
                "task": step["task"],
                "guide": [
                    {
                        "system_name": guide["system_name"],
                        "action_text": guide["action_text"],
                        "url": guide["url"],
                        "image_path": guide["image_path"],
                        "note": guide["note"],
                        "unit_id": unit_id if step["order_index"] == 0 and i == 0 else None,
                        "person_ids": [p1] if step["order_index"] == 0 and i == 0 else [],
                    }
                    for i, guide in enumerate(step["guide"])
                ],
            }
            for step in before["steps"]
        ]
    }
    saved = client.put("/api/flows/1/definition", json=payload, headers=headers)
    assert saved.status_code == 200, saved.text
    step_id = saved.json()["flow"]["steps"][0]["id"]
    with session_factory() as session:
        session.add(StepPerson(step_id=step_id, person_id=p2))
        session.commit()

    detail = client.get("/api/flows/1", headers=headers).json()
    assert {person["id"] for person in detail["steps"][0]["persons"]} == {p1, p2}


def test_definition_rejects_unknown_person(client, admin_token, ledger):
    headers = bearer(admin_token)
    r = client.put(
        "/api/flows/2/definition",
        json={
            "steps": [
                {
                    "code": "X",
                    "name": "x",
                    "guide": [
                        {
                            "system_name": "系统",
                            "action_text": "操作",
                            "unit_id": ledger["unit_id"],
                            "person_ids": [99999],
                        }
                    ],
                }
            ]
        },
        headers=headers,
    )
    assert r.status_code == 422


def test_definition_rejects_person_outside_unit(client, admin_token, ledger):
    headers = bearer(admin_token)
    p3 = ledger["person_ids"][2]  # 王五属于调度中心
    r = client.put(
        "/api/flows/2/definition",
        json={
            "steps": [
                {
                    "code": "X",
                    "name": "x",
                    "guide": [
                        {
                            "system_name": "系统",
                            "action_text": "操作",
                            "unit_id": ledger["unit_id"],  # 平台运维组
                            "person_ids": [p3],
                        }
                    ],
                }
            ]
        },
        headers=headers,
    )
    assert r.status_code == 422
    assert "责任团队" in r.json()["detail"]


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
    body = {"steps": [{"code": "X1", "name": "临时", "task": "", "guide": []}]}
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
                "guide": [
                    {
                        "system_name": g["system_name"],
                        "action_text": g["action_text"],
                        "url": g["url"],
                        "note": g["note"],
                        "image_path": g["image_path"],
                        "unit_id": g["unit"]["id"] if g.get("unit") else None,
                        "person_ids": [p["id"] for p in g.get("persons") or []],
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

    # 指引内选人顺序不同（集合语义）也算 no-op
    for step in payload["steps"]:
        for guide in step["guide"]:
            guide["person_ids"] = list(reversed(guide["person_ids"]))
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
