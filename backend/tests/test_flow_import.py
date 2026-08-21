"""流程表格导入：只新建 draft，不覆盖已有流程。"""
import csv
import io

from openpyxl import Workbook

from app.flow_import import HEADERS
from tests.conftest import bearer


def _csv(rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(HEADERS)
    writer.writerows(rows)
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def _xlsx(rows: list[list[str]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(HEADERS)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _row(
    *,
    domain="IT资源交付",
    flow="表格导入草稿甲",
    desc="说明",
    code="010",
    step="申请",
    task="发起",
    system="云盾",
    action="填单",
    url="http://example.local",
    note="注意工单号",
    operator="指定人员",
    unit="平台运维组",
    persons="张三",
    escalation="",
) -> list[str]:
    return [domain, flow, desc, code, step, task, system, action, url, note, operator, unit, persons, escalation]


def test_viewer_cannot_import(client, viewer_token):
    headers = bearer(viewer_token)
    assert client.get("/api/flow-imports/template.csv", headers=headers).status_code == 403
    files = {"file": ("a.csv", _csv([_row()]), "text/csv")}
    assert client.post("/api/flow-imports/preview", files=files, headers=headers).status_code == 403


def test_template_download(client, admin_token):
    r = client.get("/api/flow-imports/template.csv", headers=bearer(admin_token))
    assert r.status_code == 200
    text = r.content.decode("utf-8-sig")
    assert text.splitlines()[0].startswith("业务域,")
    assert "操作主体" in text.splitlines()[0]


def test_import_keeps_legacy_template_compatible(client, admin_token, ledger):
    headers = [
        "业务域", "流程名称", "流程说明", "环节编号", "环节名称", "环节任务",
        "系统名", "动作说明", "系统链接", "依据注意", "责任团队", "责任人", "直接领导",
    ]
    row = _row(flow="旧模板兼容流程")
    row.pop(10)  # 旧模板没有“操作主体”列
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerow(row)
    response = client.post(
        "/api/flow-imports/preview",
        files={"file": ("legacy.csv", ("\ufeff" + buf.getvalue()).encode("utf-8"), "text/csv")},
        headers=bearer(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_import_preview_and_commit_csv(client, admin_token, ledger):
    headers = bearer(admin_token)
    rows = [
        _row(operator="流程发起人"),
        _row(code="010", step="申请", system="工单", action="并行处理", persons="张三、李四", escalation="李四"),
        _row(code="020", step="交付", task="两人处理", system="监控", action="核对", unit="调度中心", persons="王五"),
    ]
    preview = client.post(
        "/api/flow-imports/preview",
        files={"file": ("flows.csv", _csv(rows), "text/csv")},
        headers=headers,
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["ok"] is True
    assert body["committed"] is False
    assert body["created_flow_ids"] == []
    assert body["flows"][0]["step_count"] == 2
    assert body["flows"][0]["guide_count"] == 3

    committed = client.post(
        "/api/flow-imports/commit",
        files={"file": ("flows.csv", _csv(rows), "text/csv")},
        headers=headers,
    )
    assert committed.status_code == 200, committed.text
    result = committed.json()
    assert result["ok"] is True and result["committed"] is True
    flow_id = result["created_flow_ids"][0]
    detail = client.get(f"/api/flows/{flow_id}", headers=headers).json()
    assert detail["status"] == "draft"
    assert detail["name"] == "表格导入草稿甲"
    assert [s["code"] for s in detail["steps"]] == ["010", "020"]
    first_guides = detail["steps"][0]["guide"]
    assert {p["name"] for p in first_guides[1]["persons"]} == {"张三", "李四"}
    assert first_guides[0]["operator_role"] == "process_initiator"
    assert first_guides[1]["escalation"]["name"] == "李四"
    assert detail["steps"][1]["guide"][0]["unit"]["name"] == "调度中心"


def test_import_rejects_existing_flow_name(client, admin_token, ledger):
    headers = bearer(admin_token)
    existing = client.get("/api/domains", headers=headers).json()
    delivery = next(d for d in existing if d["code"] == "it-resource-delivery")
    domain = client.get(f"/api/domains/{delivery['id']}", headers=headers).json()
    published_name = next(f["name"] for f in domain["flows"] if f["status"] == "published")
    rows = [_row(flow=published_name)]
    r = client.post(
        "/api/flow-imports/preview",
        files={"file": ("flows.csv", _csv(rows), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert any("不覆盖" in issue["message"] for issue in body["issues"])


def test_import_rejects_unknown_person_and_does_not_create(client, admin_token, ledger):
    headers = bearer(admin_token)
    rows = [_row(flow="不会被创建的流程", persons="不存在的人")]
    r = client.post(
        "/api/flow-imports/commit",
        files={"file": ("flows.csv", _csv(rows), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False and body["committed"] is False
    assert body["created_flow_ids"] == []
    assert any("不在人员台账" in issue["message"] for issue in body["issues"])
    domains = client.get("/api/domains", headers=headers).json()
    delivery = next(d for d in domains if d["code"] == "it-resource-delivery")
    names = [f["name"] for f in client.get(f"/api/domains/{delivery['id']}", headers=headers).json()["flows"]]
    assert "不会被创建的流程" not in names


def test_import_rejects_direct_leader_outside_unit(client, admin_token, ledger):
    headers = bearer(admin_token)
    rows = [_row(flow="领导团队不匹配", unit="平台运维组", persons="张三", escalation="王五")]
    r = client.post(
        "/api/flow-imports/preview",
        files={"file": ("flows.csv", _csv(rows), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert any("协调升级联系人" in issue["message"] and "支撑团队" in issue["message"] for issue in body["issues"])


def test_import_xlsx_roundtrip(client, admin_token, ledger):
    headers = bearer(admin_token)
    rows = [_row(flow="xlsx 导入流程", persons="张三")]
    r = client.post(
        "/api/flow-imports/commit",
        files={"file": ("flows.xlsx", _xlsx(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True and body["committed"] is True
    flow_id = body["created_flow_ids"][0]
    detail = client.get(f"/api/flows/{flow_id}", headers=headers).json()
    assert detail["name"] == "xlsx 导入流程"
    assert detail["steps"][0]["guide"][0]["persons"][0]["name"] == "张三"
