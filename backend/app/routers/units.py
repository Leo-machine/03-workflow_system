"""所属单位台账 CRUD：管理员维护；人员挂在单位下。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.deps import get_current_user, get_db, require_admin
from app.models import ChangeLog, GuideItem, Person, Unit, User
from app.schemas import UnitOut, UnitUpsertIn

router = APIRouter(tags=["units"])


def _get_unit(db: Session, unit_id: int) -> Unit:
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise HTTPException(status_code=404, detail="所属单位不存在")
    return unit


def _add_unit_log(
    db: Session, *, unit: Unit, field: str, admin: User,
    old_name: str | None = None, new_name: str | None = None,
) -> None:
    db.add(ChangeLog(
        entity_type="unit",
        entity_id=str(unit.id),
        field=field,
        old_value=None,
        new_value=None,
        old_name=old_name,
        new_name=new_name,
        changed_by=admin.username,
    ))


@router.get("/units", response_model=list[UnitOut])
def list_units(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.scalars(
        select(Unit).options(selectinload(Unit.leader)).order_by(Unit.order_index, Unit.id)
    ).all()


@router.post("/units", response_model=UnitOut)
def create_unit(
    body: UnitUpsertIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="单位名称不能为空")
    if db.scalar(select(Unit).where(Unit.name == name)) is not None:
        raise HTTPException(status_code=422, detail="单位名称已存在")

    if body.leader_person_id is not None:
        raise HTTPException(status_code=422, detail="请先创建团队、将人员归入该团队，再设置团队负责人")
    unit = Unit(name=name, order_index=body.order_index)
    db.add(unit)
    db.flush()
    _add_unit_log(db, unit=unit, field="create", admin=admin, new_name=unit.name)
    db.commit()
    db.refresh(unit)
    return db.scalar(select(Unit).where(Unit.id == unit.id).options(selectinload(Unit.leader)))


@router.put("/units/{unit_id}", response_model=UnitOut)
def update_unit(
    unit_id: int,
    body: UnitUpsertIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    unit = _get_unit(db, unit_id)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="单位名称不能为空")
    dup = db.scalar(select(Unit).where(Unit.name == name, Unit.id != unit_id))
    if dup is not None:
        raise HTTPException(status_code=422, detail="单位名称已存在")

    changed = False
    if name != unit.name:
        _add_unit_log(db, unit=unit, field="name", admin=admin, old_name=unit.name, new_name=name)
        unit.name = name
        changed = True
    if body.order_index != unit.order_index:
        unit.order_index = body.order_index
        changed = True
    if "leader_person_id" in body.model_fields_set and body.leader_person_id != unit.leader_person_id:
        if body.leader_person_id is not None:
            leader = db.get(Person, body.leader_person_id)
            if leader is None:
                raise HTTPException(status_code=422, detail="团队负责人不存在")
            if not leader.active:
                raise HTTPException(status_code=422, detail="停用人员不能设为团队负责人")
            if leader.unit_id != unit.id:
                raise HTTPException(status_code=422, detail="团队负责人必须是本团队成员")
            new_name = leader.name
        else:
            new_name = None
        old = db.get(Person, unit.leader_person_id) if unit.leader_person_id else None
        _add_unit_log(
            db, unit=unit, field="leader", admin=admin,
            old_name=old.name if old else None, new_name=new_name,
        )
        unit.leader_person_id = body.leader_person_id
        changed = True
    if changed:
        db.commit()
    return db.scalar(select(Unit).where(Unit.id == unit.id).options(selectinload(Unit.leader)))


@router.delete("/units/{unit_id}")
def delete_unit(
    unit_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    unit = _get_unit(db, unit_id)
    refs = db.scalar(select(func.count(Person.id)).where(Person.unit_id == unit_id))
    if refs:
        raise HTTPException(status_code=422, detail=f"该单位下仍有 {refs} 名人员，请先调整人员归属")
    guide_refs = db.scalar(select(func.count(GuideItem.id)).where(GuideItem.unit_id == unit_id))
    if guide_refs:
        raise HTTPException(
            status_code=422,
            detail=f"该单位仍被 {guide_refs} 条操作指引引用为责任团队，请先在指引中调整",
        )
    _add_unit_log(db, unit=unit, field="delete", admin=admin, old_name=unit.name)
    db.delete(unit)
    db.commit()
    return {"ok": True}
