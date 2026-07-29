"""流程只读 + 管理员设计器写接口。"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.deps import get_current_user, get_db, require_admin
from app.models import (
    BusinessDomain,
    ChangeLog,
    Flow,
    GuideItem,
    Person,
    Step,
    StepPerson,
    User,
)
from app.schemas import (
    FlowCreateIn,
    FlowDefinitionIn,
    FlowDetailOut,
    FlowMutationResult,
    FlowPatchIn,
    GuideItemOut,
    PersonOut,
    StepOut,
)

router = APIRouter(tags=["flows"])


def _step_eager_options():
    return [
        selectinload(Flow.steps).selectinload(Step.persons).selectinload(Person.unit),
        selectinload(Flow.steps).selectinload(Step.guide_items),
    ]


def _flow_detail(flow: Flow) -> FlowDetailOut:
    return FlowDetailOut(
        id=flow.id,
        name=flow.name,
        description=flow.description,
        status=flow.status,
        slug=flow.slug,
        domain_id=flow.domain_id,
        steps=[
            StepOut(
                id=step.id,
                code=step.code,
                name=step.name,
                task=step.task,
                order_index=step.order_index,
                persons=[PersonOut.model_validate(p) for p in step.persons],
                guide=[GuideItemOut.model_validate(g) for g in step.guide_items],
            )
            for step in flow.steps
        ],
    )


def _load_flow(db: Session, flow_id: int) -> Flow:
    flow = db.scalar(select(Flow).where(Flow.id == flow_id).options(*_step_eager_options()))
    if flow is None:
        raise HTTPException(status_code=404, detail="流程不存在")
    return flow


def _unique_slug(db: Session, prefix: str = "flow") -> str:
    for _ in range(8):
        slug = f"{prefix}-{uuid4().hex[:10]}"
        if db.scalar(select(Flow.id).where(Flow.slug == slug)) is None:
            return slug
    raise HTTPException(status_code=500, detail="无法生成唯一 slug")


def _next_order_index(db: Session, domain_id: int) -> int:
    current = db.scalar(
        select(func.max(Flow.order_index)).where(Flow.domain_id == domain_id)
    )
    return (current or 0) + 1


def _clip(value: str | None, limit: int = 100) -> str | None:
    """value 列是 String(100)：超长截断，防 PG 写入报错（SQLite 不校验长度，单测不会暴露）。"""
    if value is None:
        return None
    return value if len(value) <= limit else value[: limit - 1] + "…"


def _add_flow_log(
    db: Session,
    *,
    flow: Flow,
    field: str,
    old_value: str | None,
    new_value: str | None,
    admin: User,
    old_name: str | None = None,
    new_name: str | None = None,
) -> ChangeLog:
    """flow 类变更留痕。名称快照语义：
    改名时 old_name=旧名、new_name=新名（看得出"从谁改成谁"）；
    其余场景 new_name=流程当前名（标识"哪条流程"）。
    """
    log = ChangeLog(
        entity_type="flow",
        entity_id=str(flow.id),
        field=field,
        old_value=_clip(old_value),
        new_value=_clip(new_value),
        old_name=old_name,
        new_name=new_name,
        changed_by=admin.username,
    )
    db.add(log)
    return log


@router.get("/flows/{flow_id}", response_model=FlowDetailOut)
def get_flow(flow_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    flow = _load_flow(db, flow_id)
    # draft 仅 admin 可见；viewer 返回 404（不暴露存在性）
    if flow.status != "published" and user.role != "admin":
        raise HTTPException(status_code=404, detail="流程不存在")
    return _flow_detail(flow)


@router.post("/flows", response_model=FlowMutationResult)
def create_flow(
    body: FlowCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    domain = db.get(BusinessDomain, body.domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="业务域不存在")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="流程名称不能为空")

    flow = Flow(
        slug=_unique_slug(db),
        domain_id=domain.id,
        name=name,
        description=body.description,
        status="draft",
        order_index=_next_order_index(db, domain.id),
        updated_by=admin.username,
    )
    db.add(flow)
    db.flush()
    log = _add_flow_log(
        db, flow=flow, field="create", old_value=None, new_value="draft",
        admin=admin, new_name=flow.name,
    )
    db.flush()
    db.commit()
    db.expire_all()
    return FlowMutationResult(
        flow=_flow_detail(_load_flow(db, flow.id)), change_log_id=log.id, changed=True
    )


@router.patch("/flows/{flow_id}", response_model=FlowMutationResult)
def patch_flow(
    flow_id: int,
    body: FlowPatchIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    flow = db.get(Flow, flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="流程不存在")

    log: ChangeLog | None = None
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="流程名称不能为空")
        if name != flow.name:
            old = flow.name
            flow.name = name
            log = _add_flow_log(
                db, flow=flow, field="name", old_value=old, new_value=name,
                admin=admin, old_name=old, new_name=name,
            )
    if body.description is not None and body.description != flow.description:
        old = flow.description
        flow.description = body.description
        log = _add_flow_log(
            db, flow=flow, field="description", old_value=old, new_value=body.description,
            admin=admin, new_name=flow.name,
        )
    if body.status is not None:
        if body.status not in ("draft", "published"):
            raise HTTPException(status_code=422, detail="status 仅支持 draft 或 published")
        if body.status != flow.status:
            if body.status == "published":
                step_count = db.scalar(
                    select(func.count()).select_from(Step).where(Step.flow_id == flow.id)
                )
                if not step_count:
                    raise HTTPException(status_code=422, detail="至少需要一个环节才能发布")
            old = flow.status
            flow.status = body.status
            log = _add_flow_log(
                db, flow=flow, field="status", old_value=old, new_value=body.status,
                admin=admin, new_name=flow.name,
            )

    flow.updated_by = admin.username
    flow.updated_at = datetime.now(timezone.utc)
    db.flush()
    change_log_id = log.id if log is not None else None
    db.commit()
    db.expire_all()
    return FlowMutationResult(
        flow=_flow_detail(_load_flow(db, flow_id)),
        change_log_id=change_log_id,
        changed=log is not None,
    )


def _norm_definition_step(
    code: str,
    name: str,
    task: str | None,
    person_ids: list[int],
    guide: list[tuple[str | None, str | None, str | None, str | None, str | None]],
):
    """规范化一个环节定义用于 no-op 对比：选人顺序无关（集合语义）。"""
    return (
        code.strip(),
        name.strip(),
        (task or "").strip(),
        tuple(sorted(person_ids)),
        tuple(
            (
                (system or "").strip(),
                (action or "").strip(),
                (url or "").strip(),
                (image or "").strip(),
                (note or "").strip(),
            )
            for system, action, url, image, note in guide
        ),
    )


@router.put("/flows/{flow_id}/definition", response_model=FlowMutationResult)
def put_flow_definition(
    flow_id: int,
    body: FlowDefinitionIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    flow = _load_flow(db, flow_id)

    # 已发布流程冻结定义：先回 draft 再改，避免线上内容被静默改写
    if flow.status != "draft":
        raise HTTPException(status_code=422, detail="已发布流程请先回 draft 再修改定义")

    person_ids = {pid for step in body.steps for pid in step.person_ids}
    if person_ids:
        found = set(db.scalars(select(Person.id).where(Person.id.in_(person_ids))).all())
        missing = person_ids - found
        if missing:
            raise HTTPException(status_code=422, detail=f"人员不存在: {sorted(missing)}")

    # 先整体预校验，再动库（避免先删后建中途报错）
    for step_in in body.steps:
        if not step_in.code.strip() or not step_in.name.strip():
            raise HTTPException(status_code=422, detail="环节编号与名称不能为空")
        if len(step_in.person_ids) != len(set(step_in.person_ids)):
            raise HTTPException(status_code=422, detail="同一环节人员不能重复")
        for guide in step_in.guide:
            if not guide.system_name.strip() or not guide.action_text.strip():
                raise HTTPException(status_code=422, detail="指引系统名与动作不能为空")
            if guide.url and not (
                guide.url.startswith("http://") or guide.url.startswith("https://")
            ):
                raise HTTPException(status_code=422, detail="指引链接仅支持 http/https")

    # no-op 判定：与现有定义规范化后对比，完全一致则不动库、不写日志
    current = [
        _norm_definition_step(
            step.code,
            step.name,
            step.task,
            [person.id for person in step.persons],
            [(g.system_name, g.action_text, g.url, g.image_path, g.note) for g in step.guide_items],
        )
        for step in flow.steps
    ]
    incoming = [
        _norm_definition_step(
            step_in.code,
            step_in.name,
            step_in.task,
            step_in.person_ids,
            [(g.system_name, g.action_text, g.url, g.image_path, g.note) for g in step_in.guide],
        )
        for step_in in body.steps
    ]
    if incoming == current:
        return FlowMutationResult(flow=_flow_detail(flow), change_log_id=None, changed=False)

    # 清空旧环节与关联（避免 secondary 表残留）
    step_ids = [s.id for s in flow.steps]
    if step_ids:
        db.execute(delete(StepPerson).where(StepPerson.step_id.in_(step_ids)))
        db.execute(delete(GuideItem).where(GuideItem.step_id.in_(step_ids)))
        db.execute(delete(Step).where(Step.id.in_(step_ids)))
        db.flush()
        flow.steps.clear()

    for order_index, step_in in enumerate(body.steps):
        step = Step(
            flow_id=flow.id,
            code=step_in.code.strip(),
            name=step_in.name.strip(),
            task=step_in.task,
            order_index=order_index,
        )
        db.add(step)
        db.flush()
        for person_id in step_in.person_ids:
            db.add(StepPerson(step_id=step.id, person_id=person_id))
        for g_index, guide in enumerate(step_in.guide, start=1):
            db.add(GuideItem(
                step_id=step.id,
                order_index=g_index,
                system_name=guide.system_name.strip(),
                url=guide.url,
                image_path=guide.image_path,
                action_text=guide.action_text.strip(),
                note=guide.note,
            ))

    flow.updated_by = admin.username
    flow.updated_at = datetime.now(timezone.utc)
    log = _add_flow_log(
        db, flow=flow, field="definition", old_value=None,
        new_value=str(len(body.steps)), admin=admin, new_name=flow.name,
    )
    db.flush()
    change_log_id = log.id
    db.commit()
    db.expire_all()
    return FlowMutationResult(
        flow=_flow_detail(_load_flow(db, flow_id)), change_log_id=change_log_id, changed=True
    )


@router.delete("/flows/{flow_id}")
def delete_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    flow = db.get(Flow, flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="流程不存在")
    if flow.status != "draft":
        raise HTTPException(status_code=422, detail="仅允许删除 draft 流程")

    _add_flow_log(
        db, flow=flow, field="delete", old_value="draft", new_value=None,
        admin=admin, old_name=flow.name,
    )
    db.delete(flow)
    db.commit()
    return {"ok": True}
