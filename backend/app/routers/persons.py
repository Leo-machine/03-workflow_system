"""人员信息台账 CRUD：管理员维护；环节展示实时解析本表，改一处处处生效。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.deps import get_current_user, get_db, require_admin
from app.models import BusinessDomain, ChangeLog, GuideItem, GuideItemPerson, Person, StepPerson, Unit, User
from app.schemas import (
    PersonBulkImportIn,
    PersonBulkImportResult,
    PersonBulkImportSkip,
    PersonOut,
    PersonUpsertIn,
)

router = APIRouter(tags=["persons"])


def _person_eager():
    return (
        selectinload(Person.unit).selectinload(Unit.leader),
        selectinload(Person.domains),
    )


def _get_person(db: Session, person_id: int) -> Person:
    person = db.scalar(
        select(Person)
        .where(Person.id == person_id)
        .options(*_person_eager())
    )
    if person is None:
        raise HTTPException(status_code=404, detail="人员不存在")
    return person


def _resolve_domains(db: Session, domain_ids: list[int]) -> list[BusinessDomain]:
    """校验并取出可服务业务域；有不存在的 id → 422。"""
    ids = set(domain_ids)
    if not ids:
        return []
    found = db.scalars(select(BusinessDomain).where(BusinessDomain.id.in_(ids))).all()
    missing = ids - {d.id for d in found}
    if missing:
        raise HTTPException(status_code=422, detail=f"业务域不存在: {sorted(missing)}")
    return list(found)


def _add_ledger_log(
    db: Session, *, person: Person, field: str, admin: User,
    old_value: str | None = None, new_value: str | None = None,
    old_name: str | None = None, new_name: str | None = None,
) -> None:
    db.add(ChangeLog(
        entity_type="person",
        entity_id=str(person.id),
        field=field,
        old_value=old_value[:100] if old_value else None,
        new_value=new_value[:100] if new_value else None,
        old_name=old_name,
        new_name=new_name,
        changed_by=admin.username,
    ))


@router.get("/persons", response_model=list[PersonOut])
def list_persons(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """人员台账（含单位与可服务业务域）：设计器环节内选人、办事地图展示共用。"""
    return db.scalars(
        select(Person)
        .options(*_person_eager())
        .order_by(Person.id)
    ).all()


@router.post("/persons", response_model=PersonOut)
def create_person(
    body: PersonUpsertIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="姓名不能为空")
    if body.unit_id is not None and db.get(Unit, body.unit_id) is None:
        raise HTTPException(status_code=422, detail="所属单位不存在")

    person = Person(
        name=name,
        unit_id=body.unit_id,
        title=body.title.strip(),
        contact=body.contact,
        active=body.active,
        domains=_resolve_domains(db, body.domain_ids),
    )
    db.add(person)
    db.flush()
    _add_ledger_log(db, person=person, field="create", admin=admin, new_name=person.name)
    db.commit()
    return _get_person(db, person.id)


@router.put("/persons/{person_id}", response_model=PersonOut)
def update_person(
    person_id: int,
    body: PersonUpsertIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    person = _get_person(db, person_id)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="姓名不能为空")
    if body.unit_id is not None and db.get(Unit, body.unit_id) is None:
        raise HTTPException(status_code=422, detail="所属单位不存在")

    changes: list[tuple[str, str | None, str | None]] = []
    if name != person.name:
        changes.append(("name", person.name, name))
    if body.unit_id != person.unit_id:
        led_unit = db.scalar(select(Unit).where(Unit.leader_person_id == person_id))
        if led_unit is not None:
            raise HTTPException(
                status_code=422,
                detail=f"该人员当前是「{led_unit.name}」团队负责人，请先为该团队更换负责人",
            )
        # 已挂在指引上的责任人：调单位不得破坏「人必须属于所选责任团队」
        bound = db.execute(
            select(GuideItem.id, GuideItem.unit_id, GuideItem.system_name)
            .join(GuideItemPerson, GuideItemPerson.guide_item_id == GuideItem.id)
            .where(GuideItemPerson.person_id == person_id)
        ).all()
        conflicts = [
            row for row in bound
            if row.unit_id is not None and row.unit_id != body.unit_id
        ]
        if conflicts:
            names = "、".join((row.system_name or f"#{row.id}") for row in conflicts[:3])
            more = f" 等 {len(conflicts)} 处" if len(conflicts) > 3 else ""
            raise HTTPException(
                status_code=422,
                detail=(
                    f"该人员仍被操作指引引用为责任人（{names}{more}），"
                    "请先在流程设计器中调整指引责任团队/人，再修改所属单位"
                ),
            )
        old_unit = person.unit.name if person.unit else None
        new_unit = db.get(Unit, body.unit_id).name if body.unit_id else None
        if old_unit != new_unit:
            changes.append(("unit", old_unit, new_unit))
    if body.title.strip() != person.title:
        changes.append(("title", person.title, body.title.strip()))
    if body.contact != person.contact:
        changes.append(("contact", person.contact, body.contact))
    if body.active != person.active:
        if not body.active:
            led_unit = db.scalar(select(Unit).where(Unit.leader_person_id == person_id))
            if led_unit is not None:
                raise HTTPException(
                    status_code=422,
                    detail=f"该人员当前是「{led_unit.name}」团队负责人，请先为该团队更换负责人",
                )
        changes.append(("active", str(person.active), str(body.active)))

    new_domains = _resolve_domains(db, body.domain_ids)
    old_domain_names = "、".join(d.name for d in person.domains)
    new_domain_names = "、".join(d.name for d in new_domains)
    if {d.id for d in new_domains} != {d.id for d in person.domains}:
        changes.append(("domains", old_domain_names or None, new_domain_names or None))

    if not changes:
        return person  # no-op：不写日志

    person.name = name
    person.unit_id = body.unit_id
    person.title = body.title.strip()
    person.contact = body.contact
    person.active = body.active
    person.domains = new_domains
    for field, old, new in changes:
        _add_ledger_log(
            db, person=person, field=field, admin=admin,
            old_value=old, new_value=new,
            old_name=old if field == "name" else None,
            new_name=new if field == "name" else person.name,
        )
    db.commit()
    return _get_person(db, person_id)


@router.delete("/persons/{person_id}")
def delete_person(
    person_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    person = _get_person(db, person_id)
    # 新模型会同时写 guide_item_persons 与回写的 step_persons；去重计数避免提示翻倍。
    # 旧数据可能只有 step_persons：此时仍按环节引用拦截。
    guide_refs = db.scalar(
        select(func.count(GuideItemPerson.guide_item_id)).where(
            GuideItemPerson.person_id == person_id
        )
    ) or 0
    if guide_refs:
        refs = guide_refs
        detail = f"该人员仍被 {refs} 条操作指引引用，请先在流程设计器中移除"
    else:
        step_refs = db.scalar(
            select(func.count(StepPerson.step_id)).where(StepPerson.person_id == person_id)
        ) or 0
        refs = step_refs
        detail = f"该人员仍被 {refs} 个环节引用，请先在流程设计器中移除"
    if refs:
        raise HTTPException(status_code=422, detail=detail)
    db.execute(update(Unit).where(Unit.leader_person_id == person_id).values(leader_person_id=None))
    db.execute(
        update(GuideItem).where(GuideItem.escalation_person_id == person_id).values(escalation_person_id=None)
    )
    _add_ledger_log(db, person=person, field="delete", admin=admin, old_name=person.name)
    db.delete(person)
    db.commit()
    return {"ok": True}


@router.post("/persons/bulk-import", response_model=PersonBulkImportResult)
def bulk_import_persons(
    body: PersonBulkImportIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """批量导入人员（Excel 粘贴场景）：

    - 团队按名字匹配，不存在则自动创建；
    - 「姓名+团队」与台账重复（或本批内重复）的行跳过并汇报；
    - 逐人逐团队写留痕（与单个新增一致）。
    """
    if not body.rows:
        raise HTTPException(status_code=422, detail="导入内容为空")
    if len(body.rows) > 500:
        raise HTTPException(status_code=422, detail="单次最多导入 500 行")

    existing_pairs = {
        (p.name, p.unit.name if p.unit else "")
        for p in db.scalars(select(Person).options(selectinload(Person.unit))).all()
    }
    units_by_name = {u.name: u for u in db.scalars(select(Unit)).all()}

    created_units: list[str] = []
    skipped: list[PersonBulkImportSkip] = []
    created = 0
    seen: set[tuple[str, str]] = set()

    for row in body.rows:
        name = row.name.strip()
        unit_name = (row.unit_name or "").strip()
        title = row.title.strip()
        if not name:
            skipped.append(PersonBulkImportSkip(name="(空行)", reason="姓名为空"))
            continue
        key = (name, unit_name)
        if key in seen:
            skipped.append(PersonBulkImportSkip(name=name, reason="导入内容内重复"))
            continue
        seen.add(key)
        if key in existing_pairs:
            skipped.append(PersonBulkImportSkip(name=name, reason="台账中已存在（同团队同名）"))
            continue

        unit: Unit | None = None
        if unit_name:
            unit = units_by_name.get(unit_name)
            if unit is None:
                unit = Unit(name=unit_name, order_index=len(units_by_name))
                db.add(unit)
                db.flush()
                units_by_name[unit_name] = unit
                created_units.append(unit_name)
                db.add(ChangeLog(
                    entity_type="unit", entity_id=str(unit.id), field="create",
                    old_value=None, new_value=None, old_name=None, new_name=unit.name,
                    changed_by=admin.username,
                ))

        person = Person(name=name, unit_id=unit.id if unit else None, title=title)
        db.add(person)
        db.flush()
        _add_ledger_log(db, person=person, field="create", admin=admin, new_name=person.name)
        existing_pairs.add(key)
        created += 1

    db.commit()
    return PersonBulkImportResult(
        created_persons=created, created_units=created_units, skipped=skipped
    )
