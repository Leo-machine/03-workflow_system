"""流程只读 + 管理员设计器写接口。"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.deps import get_current_user, get_db, require_admin
from app.models import (
    BusinessDomain,
    ChangeLog,
    Flow,
    GuideArchive,
    GuideItem,
    GuideItemPerson,
    Person,
    Step,
    StepPerson,
    Unit,
    User,
)
from app.routers.uploads import is_valid_media_path
from app.schemas import (
    FlowCreateIn,
    FlowDefinitionIn,
    FlowDetailOut,
    FlowMutationResult,
    FlowPatchIn,
    FlowSearchResultOut,
    GuideItemOut,
    PersonBrief,
    PersonOut,
    StepDefinitionIn,
    StepOut,
    UnitOut,
)

router = APIRouter(tags=["flows"])


def _step_eager_options():
    return [
        selectinload(Flow.steps).selectinload(Step.persons).selectinload(Person.unit).selectinload(Unit.leader),
        selectinload(Flow.steps)
        .selectinload(Step.guide_items)
        .selectinload(GuideItem.persons)
        .selectinload(Person.unit)
        .selectinload(Unit.leader),
        selectinload(Flow.steps).selectinload(Step.guide_items).selectinload(GuideItem.unit).selectinload(Unit.leader),
        selectinload(Flow.steps).selectinload(Step.guide_items).selectinload(GuideItem.escalation_person),
    ]


def _person_brief(person: Person | None) -> PersonBrief | None:
    return PersonBrief.model_validate(person) if person else None


def _resolved_direct_leader(guide: GuideItem) -> Person | None:
    if guide.escalation_person is not None:
        return guide.escalation_person
    if guide.unit is not None:
        return guide.unit.leader
    return None


def _guide_out(guide: GuideItem) -> GuideItemOut:
    return GuideItemOut(
        id=guide.id,
        order_index=guide.order_index,
        system_name=guide.system_name,
        url=guide.url,
        image_path=guide.image_path,
        action_text=guide.action_text,
        note=guide.note,
        unit=UnitOut.model_validate(guide.unit) if guide.unit else None,
        persons=[PersonOut.model_validate(p) for p in guide.persons],
        escalation=_person_brief(guide.escalation_person),
        direct_leader=_person_brief(_resolved_direct_leader(guide)),
    )


def _aggregated_step_persons(step: Step) -> list[Person]:
    """聚合新旧责任人；部分迁移期间也不能隐藏尚未迁入指引的人。"""
    seen: set[int] = set()
    result: list[Person] = []
    for guide in step.guide_items:
        for person in guide.persons:
            if person.id in seen:
                continue
            seen.add(person.id)
            result.append(person)
    for person in step.persons:
        if person.id in seen:
            continue
        seen.add(person.id)
        result.append(person)
    return result


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
                image_path=None,
                persons=[PersonOut.model_validate(p) for p in _aggregated_step_persons(step)],
                guide=[_guide_out(g) for g in step.guide_items],
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


@router.get("/flows/search", response_model=list[FlowSearchResultOut])
def search_flows(
    q: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """首页全局搜索：覆盖流程、环节及操作指引，只返回可办理的已发布流程。"""
    keyword = q.strip()
    if not keyword:
        return []
    like = f"%{keyword}%"
    rows = db.execute(
        select(Flow, BusinessDomain)
        .join(BusinessDomain, BusinessDomain.id == Flow.domain_id)
        .outerjoin(Step, Step.flow_id == Flow.id)
        .outerjoin(GuideItem, GuideItem.step_id == Step.id)
        .where(
            Flow.status == "published",
            or_(
                Flow.name.ilike(like),
                Flow.description.ilike(like),
                BusinessDomain.name.ilike(like),
                Step.name.ilike(like),
                Step.task.ilike(like),
                GuideItem.system_name.ilike(like),
                GuideItem.action_text.ilike(like),
                GuideItem.note.ilike(like),
            ),
        )
        .distinct()
        .order_by(BusinessDomain.order_index, Flow.order_index, Flow.id)
        .limit(20)
    ).all()
    return [
        FlowSearchResultOut(
            id=flow.id,
            name=flow.name,
            description=flow.description,
            domain_id=domain.id,
            domain_name=domain.name,
        )
        for flow, domain in rows
    ]


@router.get("/flows/{flow_id}", response_model=FlowDetailOut)
def get_flow(flow_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    flow = _load_flow(db, flow_id)
    # draft 默认仅 admin 可见；已有办理存档的用户仍可读，避免取消发布后中途办理 404
    if flow.status != "published" and user.role != "admin":
        owned = db.scalar(
            select(GuideArchive.id).where(
                GuideArchive.user_id == user.id, GuideArchive.flow_id == flow.id
            ).limit(1)
        )
        if owned is None:
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


def _norm_guide(
    system: str | None,
    action: str | None,
    url: str | None,
    image: str | None,
    note: str | None,
    unit_id: int | None,
    person_ids: list[int],
    escalation_person_id: int | None = None,
):
    return (
        (system or "").strip(),
        (action or "").strip(),
        (url or "").strip(),
        (image or "").strip(),
        (note or "").strip(),
        unit_id,
        tuple(sorted(person_ids)),
        escalation_person_id,
    )


def _norm_definition_step(
    code: str,
    name: str,
    task: str | None,
    guide: list[tuple],
):
    """规范化一个环节定义用于 no-op 对比：选人顺序无关（集合语义）。"""
    return (
        code.strip(),
        name.strip(),
        (task or "").strip(),
        tuple(guide),
    )


def _definition_person_ids(steps: list[StepDefinitionIn]) -> set[int]:
    ids: set[int] = set()
    for step in steps:
        for guide in step.guide:
            ids.update(guide.person_ids)
            if guide.escalation_person_id is not None:
                ids.add(guide.escalation_person_id)
    return ids


def _load_definition_persons(db: Session, steps: list[StepDefinitionIn]) -> dict[int, Person]:
    all_person_ids = _definition_person_ids(steps)
    persons_by_id: dict[int, Person] = {}
    if all_person_ids:
        found = db.scalars(
            select(Person).where(Person.id.in_(all_person_ids)).options(selectinload(Person.unit))
        ).all()
        persons_by_id = {p.id: p for p in found}
        missing = all_person_ids - persons_by_id.keys()
        if missing:
            raise HTTPException(status_code=422, detail=f"人员不存在: {sorted(missing)}")
    all_unit_ids = {g.unit_id for step in steps for g in step.guide if g.unit_id is not None}
    if all_unit_ids:
        found_units = set(db.scalars(select(Unit.id).where(Unit.id.in_(all_unit_ids))).all())
        missing_units = all_unit_ids - found_units
        if missing_units:
            raise HTTPException(status_code=422, detail=f"责任团队不存在: {sorted(missing_units)}")
    return persons_by_id


def _validate_definition_steps(steps: list[StepDefinitionIn], persons_by_id: dict[int, Person]) -> None:
    for step_in in steps:
        if not step_in.code.strip() or not step_in.name.strip():
            raise HTTPException(status_code=422, detail="环节编号与名称不能为空")
        for guide in step_in.guide:
            if not guide.system_name.strip() or not guide.action_text.strip():
                raise HTTPException(status_code=422, detail="指引系统名与动作不能为空")
            if guide.url and not (
                guide.url.startswith("http://") or guide.url.startswith("https://")
            ):
                raise HTTPException(status_code=422, detail="指引链接仅支持 http/https")
            if not is_valid_media_path(guide.image_path):
                raise HTTPException(status_code=422, detail="指引图示路径非法")
            if len(guide.person_ids) != len(set(guide.person_ids)):
                raise HTTPException(status_code=422, detail="同一指引责任人不能重复")
            if guide.person_ids and guide.unit_id is None:
                raise HTTPException(status_code=422, detail="请先选择责任团队再选择责任人")
            for pid in guide.person_ids:
                person = persons_by_id[pid]
                if person.unit_id != guide.unit_id:
                    raise HTTPException(
                        status_code=422,
                        detail=f"责任人「{person.name}」不属于所选责任团队",
                    )
            if guide.escalation_person_id is not None:
                if guide.unit_id is None:
                    raise HTTPException(status_code=422, detail="请先选择责任团队再选择直接领导")
                leader = persons_by_id[guide.escalation_person_id]
                if leader.unit_id != guide.unit_id:
                    raise HTTPException(
                        status_code=422,
                        detail=f"直接领导「{leader.name}」不属于所选责任团队",
                    )


def _insert_definition_steps(db: Session, flow: Flow, steps: list[StepDefinitionIn]) -> None:
    for order_index, step_in in enumerate(steps):
        step = Step(
            flow_id=flow.id,
            code=step_in.code.strip(),
            name=step_in.name.strip(),
            task=step_in.task,
            order_index=order_index,
            image_path=None,
        )
        db.add(step)
        db.flush()
        step_person_ids: list[int] = []
        for g_index, guide in enumerate(step_in.guide, start=1):
            item = GuideItem(
                step_id=step.id,
                order_index=g_index,
                system_name=guide.system_name.strip(),
                url=guide.url,
                image_path=guide.image_path or None,
                action_text=guide.action_text.strip(),
                note=guide.note,
                unit_id=guide.unit_id,
                escalation_person_id=guide.escalation_person_id,
            )
            db.add(item)
            db.flush()
            for person_id in guide.person_ids:
                db.add(GuideItemPerson(guide_item_id=item.id, person_id=person_id))
                if person_id not in step_person_ids:
                    step_person_ids.append(person_id)
        for person_id in step_person_ids:
            db.add(StepPerson(step_id=step.id, person_id=person_id))


def _replace_flow_steps(db: Session, flow: Flow, steps: list[StepDefinitionIn]) -> None:
    step_ids = [s.id for s in flow.steps]
    if step_ids:
        guide_ids = [g.id for s in flow.steps for g in s.guide_items]
        if guide_ids:
            db.execute(delete(GuideItemPerson).where(GuideItemPerson.guide_item_id.in_(guide_ids)))
        db.execute(delete(StepPerson).where(StepPerson.step_id.in_(step_ids)))
        db.execute(delete(GuideItem).where(GuideItem.step_id.in_(step_ids)))
        db.execute(delete(Step).where(Step.id.in_(step_ids)))
        db.flush()
        flow.steps.clear()
    _insert_definition_steps(db, flow, steps)
    db.flush()
    db.refresh(flow)


def _cloned_flow_name(db: Session, domain_id: int, source_name: str) -> str:
    existing = set(db.scalars(select(Flow.name).where(Flow.domain_id == domain_id)).all())
    suffix = "（副本）"
    base = source_name + suffix
    if len(base) > 100:
        base = source_name[: 100 - len(suffix)] + suffix
    if base not in existing:
        return base
    n = 2
    while n < 1000:
        extra = f"（副本{n}）"
        name = source_name + extra
        if len(name) > 100:
            name = source_name[: 100 - len(extra)] + extra
        if name not in existing:
            return name
        n += 1
    raise HTTPException(status_code=500, detail="无法生成副本名称")


def _copy_flow_structure(db: Session, source: Flow, dest: Flow) -> None:
    for step in source.steps:
        new_step = Step(
            flow_id=dest.id,
            code=step.code,
            name=step.name,
            task=step.task,
            order_index=step.order_index,
            image_path=step.image_path,
        )
        db.add(new_step)
        db.flush()
        step_person_ids: list[int] = []
        for guide in step.guide_items:
            item = GuideItem(
                step_id=new_step.id,
                order_index=guide.order_index,
                system_name=guide.system_name,
                url=guide.url,
                image_path=guide.image_path,
                action_text=guide.action_text,
                note=guide.note,
                unit_id=guide.unit_id,
                escalation_person_id=guide.escalation_person_id,
            )
            db.add(item)
            db.flush()
            for person in guide.persons:
                db.add(GuideItemPerson(guide_item_id=item.id, person_id=person.id))
                if person.id not in step_person_ids:
                    step_person_ids.append(person.id)
        for person_id in step_person_ids:
            db.add(StepPerson(step_id=new_step.id, person_id=person_id))


def _archive_snapshots(db: Session, flow_id: int) -> list[tuple[GuideArchive, str | None, int | None, int | None]]:
    """定义重建前记下存档对应的环节编号 / 顺序 / 指引序号，供映射到新 ID。"""
    rows = db.execute(
        select(GuideArchive, Step, GuideItem)
        .outerjoin(Step, Step.id == GuideArchive.step_id)
        .outerjoin(GuideItem, GuideItem.id == GuideArchive.guide_item_id)
        .where(GuideArchive.flow_id == flow_id)
    ).all()
    return [
        (
            archive,
            step.code if step else None,
            step.order_index if step else None,
            guide.order_index if guide else None,
        )
        for archive, step, guide in rows
    ]


def _remap_archives(
    snapshots: list[tuple[GuideArchive, str | None, int | None, int | None]],
    steps_by_code: dict[str, Step],
    steps_by_order: dict[int, Step],
    guides_by_key: dict[tuple[str, int], GuideItem],
) -> None:
    first = next(iter(steps_by_order.values()), None) if steps_by_order else None
    for archive, code, step_order, guide_order in snapshots:
        target = (steps_by_code.get(code) if code else None)
        if target is None and step_order is not None:
            target = steps_by_order.get(step_order)
        if target is None:
            target = first
        if target is None:
            archive.step_id = None
            archive.guide_item_id = None
            continue
        archive.step_id = target.id
        if guide_order is None:
            archive.guide_item_id = None
            continue
        guide = guides_by_key.get((target.code, guide_order))
        archive.guide_item_id = guide.id if guide else None


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

    persons_by_id = _load_definition_persons(db, body.steps)
    _validate_definition_steps(body.steps, persons_by_id)

    # no-op 判定：与现有定义规范化后对比，完全一致则不动库、不写日志
    current = [
        _norm_definition_step(
            step.code,
            step.name,
            step.task,
            [
                _norm_guide(
                    g.system_name,
                    g.action_text,
                    g.url,
                    g.image_path,
                    g.note,
                    g.unit_id,
                    [p.id for p in g.persons],
                    g.escalation_person_id,
                )
                for g in step.guide_items
            ],
        )
        for step in flow.steps
    ]
    incoming = [
        _norm_definition_step(
            step_in.code,
            step_in.name,
            step_in.task,
            [
                _norm_guide(
                    g.system_name,
                    g.action_text,
                    g.url,
                    g.image_path,
                    g.note,
                    g.unit_id,
                    g.person_ids,
                    g.escalation_person_id,
                )
                for g in step_in.guide
            ],
        )
        for step_in in body.steps
    ]
    if incoming == current:
        return FlowMutationResult(flow=_flow_detail(flow), change_log_id=None, changed=False)

    archive_snapshots = _archive_snapshots(db, flow.id)
    _replace_flow_steps(db, flow, body.steps)
    _remap_archives(
        archive_snapshots,
        {s.code: s for s in flow.steps},
        {s.order_index: s for s in flow.steps},
        {(s.code, g.order_index): g for s in flow.steps for g in s.guide_items},
    )

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


@router.post("/flows/{flow_id}/clone", response_model=FlowMutationResult)
def clone_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    source = _load_flow(db, flow_id)
    if source.domain_id is None:
        raise HTTPException(status_code=422, detail="流程未归属业务域，无法复制")

    dest = Flow(
        slug=_unique_slug(db),
        domain_id=source.domain_id,
        name=_cloned_flow_name(db, source.domain_id, source.name),
        description=source.description,
        status="draft",
        order_index=_next_order_index(db, source.domain_id),
        updated_by=admin.username,
    )
    db.add(dest)
    db.flush()
    _copy_flow_structure(db, source, dest)
    log = _add_flow_log(
        db, flow=dest, field="clone", old_value=str(source.id), new_value="draft",
        admin=admin, old_name=source.name, new_name=dest.name,
    )
    db.flush()
    db.commit()
    db.expire_all()
    return FlowMutationResult(
        flow=_flow_detail(_load_flow(db, dest.id)), change_log_id=log.id, changed=True
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
