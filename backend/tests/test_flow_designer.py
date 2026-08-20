"""管理员流程设计器写接口：create / patch / definition / delete（person 模型）。"""
from app.models import StepPerson
from tests.conftest import bearer


def test_home_search_matches_flow_step_and_guide_but_hides_drafts(client, viewer_token, admin_token):
    viewer = bearer(viewer_token)
    admin = bearer(admin_token)
    by_name = client.get("/api/flows/search", params={"q": "物理机"}, headers=viewer)
    assert by_name.status_code == 200
    assert any(item["id"] == 1 for item in by_name.json())

    by_action = client.get("/api/flows/search", params={"q": "登录"}, headers=viewer)
    assert by_action.status_code == 200
    assert by_action.json()

    draft = client.post(
        "/api/flows",
        json={"domain_id": 6, "name": "仅草稿可见关键词", "description": "首页不能搜到"},
        headers=admin,
    )
    assert draft.status_code == 200
    hidden = client.get("/api/flows/search", params={"q": "仅草稿可见关键词"}, headers=viewer)
    assert hidden.json() == []


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


def test_definition_rejects_direct_leader_outside_unit(client, admin_token, ledger):
    headers = bearer(admin_token)
    p1, _, p3 = ledger["person_ids"]  # 张三属平台运维组，王五属调度中心
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
                            "person_ids": [p1],
                            "escalation_person_id": p3,
                        }
                    ],
                }
            ]
        },
        headers=headers,
    )
    assert r.status_code == 422
    assert "直接领导" in r.json()["detail"]
    assert "不属于所选责任团队" in r.json()["detail"]


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


def _guide_payload(unit_id: int, person_id: int, action: str = "办理"):
    return {
        "system_name": "工单",
        "action_text": action,
        "unit_id": unit_id,
        "person_ids": [person_id],
    }


def test_definition_rebuild_remaps_in_progress_archives(client, admin_token, viewer_token, ledger):
    admin = bearer(admin_token)
    viewer = bearer(viewer_token)
    unit_id = ledger["unit_id"]
    person_id = ledger["person_ids"][0]
    domains = client.get("/api/domains", headers=admin).json()
    delivery = next(item for item in domains if item["code"] == "it-resource-delivery")
    flow_id = client.post(
        "/api/flows", json={"domain_id": delivery["id"], "name": "存档映射流程"}, headers=admin
    ).json()["flow"]["id"]

    def put_definition(steps: list[tuple[str, str, str]]):
        return client.put(
            f"/api/flows/{flow_id}/definition",
            json={
                "steps": [
                    {
                        "code": code,
                        "name": name,
                        "task": task,
                        "guide": [_guide_payload(unit_id, person_id, task)],
                    }
                    for code, name, task in steps
                ]
            },
            headers=admin,
        )

    assert put_definition([("A1", "申请", "发起"), ("A2", "审批", "审核")]).status_code == 200
    assert client.patch(f"/api/flows/{flow_id}", json={"status": "published"}, headers=admin).status_code == 200
    detail = client.get(f"/api/flows/{flow_id}", headers=viewer).json()
    a2 = next(step for step in detail["steps"] if step["code"] == "A2")
    old_a2_id = a2["id"]
    old_guide_id = a2["guide"][0]["id"]

    event = client.post("/api/guide-events", json={"title": "映射事项"}, headers=viewer).json()
    archive = client.post(
        f"/api/guide-events/{event['id']}/flows", json={"flow_id": flow_id}, headers=viewer
    ).json()
    saved = client.put(
        f"/api/guide-archives/{archive['id']}",
        json={"step_id": old_a2_id, "guide_item_id": old_guide_id, "status": "in_progress"},
        headers=viewer,
    )
    assert saved.status_code == 200, saved.text

    client.patch(f"/api/flows/{flow_id}", json={"status": "draft"}, headers=admin)
    rebuilt = put_definition([("A1", "申请", "发起（改）"), ("A2", "审批", "审核（改）")])
    assert rebuilt.status_code == 200, rebuilt.text
    new_a2 = next(step for step in rebuilt.json()["flow"]["steps"] if step["code"] == "A2")
    after = client.get(f"/api/guide-archives/{archive['id']}", headers=viewer).json()
    assert after["step_id"] == new_a2["id"]
    assert after["guide_item_id"] == new_a2["guide"][0]["id"]
    assert client.get(f"/api/flows/{flow_id}", headers=viewer).status_code == 200

    renamed = put_definition([("A1", "申请", "发起"), ("B2", "审批", "审核改码")])
    assert renamed.status_code == 200
    new_b2 = next(step for step in renamed.json()["flow"]["steps"] if step["code"] == "B2")
    after_rename = client.get(f"/api/guide-archives/{archive['id']}", headers=viewer).json()
    assert after_rename["step_id"] == new_b2["id"]

    dropped = put_definition([("A1", "申请", "仅保留申请")])
    assert dropped.status_code == 200
    new_a1 = dropped.json()["flow"]["steps"][0]
    after_drop = client.get(f"/api/guide-archives/{archive['id']}", headers=viewer).json()
    assert after_drop["step_id"] == new_a1["id"]
    assert new_a1["code"] == "A1"


def test_clone_flow_creates_draft_copy(client, admin_token, ledger):
    headers = bearer(admin_token)
    p1, p2, _ = ledger["person_ids"]
    unit_id = ledger["unit_id"]
    domains = client.get("/api/domains", headers=headers).json()
    delivery = next(d for d in domains if d["code"] == "it-resource-delivery")
    created = client.post(
        "/api/flows",
        json={"domain_id": delivery["id"], "name": "可复制流程", "description": "原说明"},
        headers=headers,
    ).json()
    flow_id = created["flow"]["id"]
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
                            "unit_id": unit_id,
                            "person_ids": [p1, p2],
                            "escalation_person_id": p2,
                        }
                    ],
                }
            ]
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    client.patch(f"/api/flows/{flow_id}", json={"status": "published"}, headers=headers)

    cloned = client.post(f"/api/flows/{flow_id}/clone", headers=headers)
    assert cloned.status_code == 200, cloned.text
    copy = cloned.json()["flow"]
    assert copy["id"] != flow_id
    assert copy["status"] == "draft"
    assert copy["name"] == "可复制流程（副本）"
    assert copy["description"] == "原说明"
    guide = copy["steps"][0]["guide"][0]
    assert {p["name"] for p in guide["persons"]} == {"张三", "李四"}
    assert guide["escalation"]["name"] == "李四"
    assert guide["url"] == "http://example.local"

    again = client.post(f"/api/flows/{flow_id}/clone", headers=headers).json()["flow"]
    assert again["name"] == "可复制流程（副本2）"


def test_viewer_cannot_clone_flow(client, viewer_token):
    assert client.post("/api/flows/1/clone", headers=bearer(viewer_token)).status_code == 403
