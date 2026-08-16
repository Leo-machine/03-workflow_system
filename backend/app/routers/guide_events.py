"""办理事件：一个事项下组织多个“带我办理”流程实例。"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import BusinessDomain, Flow, GuideArchive, GuideEvent, Step, User
from app.schemas import (
    AvailableGuideFlowOut,
    GuideArchiveOut,
    GuideEventAddFlowIn,
    GuideEventCreateIn,
    GuideEventFlowOut,
    GuideEventOut,
    GuideEventPatchIn,
)

router = APIRouter(tags=["guide-events"])


def _owned_event(db: Session, event_id: int, user: User) -> GuideEvent:
    event = db.get(GuideEvent, event_id)
    if event is None or event.user_id != user.id:
        raise HTTPException(status_code=404, detail="办理事件不存在")
    return event


def _event_out(db: Session, event: GuideEvent) -> GuideEventOut:
    rows = db.execute(
        select(GuideArchive, Flow)
        .join(Flow, Flow.id == GuideArchive.flow_id)
        .where(GuideArchive.event_id == event.id)
        .order_by(GuideArchive.started_at, GuideArchive.id)
    ).all()
    flows = [
        GuideEventFlowOut(
            archive_id=a.id, flow_id=f.id, flow_name=f.name, status=a.status,
            step_id=a.step_id, guide_item_id=a.guide_item_id, updated_at=a.updated_at,
        )
        for a, f in rows
    ]
    status = "completed" if flows and all(item.status == "completed" for item in flows) else "in_progress"
    return GuideEventOut(
        id=event.id, event_key=event.event_key, title=event.title,
        external_ref=event.external_ref, status=status,
        created_at=event.created_at, updated_at=event.updated_at, flows=flows,
    )


def _start_archive(db: Session, *, event: GuideEvent, flow_id: int, user: User) -> GuideArchive:
    """校验流程并创建办理实例；由调用方统一提交，避免产生空事件。"""
    flow = db.scalar(select(Flow).where(Flow.id == flow_id, Flow.status == "published"))
    if flow is None and user.role == "admin":
        flow = db.get(Flow, flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="流程不存在或尚未发布")
    first_step = db.scalar(select(Step).where(Step.flow_id == flow.id).order_by(Step.order_index, Step.id))
    if first_step is None:
        raise HTTPException(status_code=422, detail="该流程尚无可办理环节")
    archive = GuideArchive(
        event_id=event.id,
        user_id=user.id,
        flow_id=flow.id,
        step_id=first_step.id,
        guide_item_id=None,
        status="in_progress",
    )
    db.add(archive)
    return archive


@router.get("/guide-events", response_model=list[GuideEventOut])
def list_events(
    q: str | None = Query(None, description="按事项名称、事件编号、工单号搜索"),
    status: str | None = Query(None, description="in_progress | completed"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if status is not None and status not in {"in_progress", "completed"}:
        raise HTTPException(status_code=422, detail="状态筛选无效")
    stmt = select(GuideEvent).where(GuideEvent.user_id == user.id)
    keyword = (q or "").strip()
    if keyword:
        like = f"%{keyword}%"
        stmt = stmt.where(
            or_(
                GuideEvent.title.ilike(like),
                GuideEvent.event_key.ilike(like),
                GuideEvent.external_ref.ilike(like),
            )
        )
    events = db.scalars(stmt.order_by(GuideEvent.updated_at.desc(), GuideEvent.id.desc())).all()
    results = [_event_out(db, event) for event in events]
    if status:
        results = [item for item in results if item.status == status]
    return results


@router.post("/guide-events", response_model=GuideEventOut, status_code=201)
def create_event(
    body: GuideEventCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="请填写事项名称")
    event = GuideEvent(
        event_key=f"EVT-{datetime.now():%Y%m%d}-{uuid4().hex[:6].upper()}",
        user_id=user.id,
        title=title[:120],
        external_ref=(body.external_ref or "").strip()[:100] or None,
    )
    db.add(event)
    db.flush()
    if body.flow_id is not None:
        _start_archive(db, event=event, flow_id=body.flow_id, user=user)
    db.commit()
    db.refresh(event)
    return _event_out(db, event)


@router.get("/guide-events/available-flows", response_model=list[AvailableGuideFlowOut])
def available_flows(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Flow, BusinessDomain).join(BusinessDomain, BusinessDomain.id == Flow.domain_id)
        .where(Flow.status == "published").order_by(BusinessDomain.order_index, Flow.order_index)
    ).all()
    return [AvailableGuideFlowOut(id=f.id, name=f.name, domain_name=d.name) for f, d in rows]


@router.get("/guide-events/{event_id}", response_model=GuideEventOut)
def get_event(event_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _event_out(db, _owned_event(db, event_id, user))


@router.patch("/guide-events/{event_id}", response_model=GuideEventOut)
def update_event(
    event_id: int,
    body: GuideEventPatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = _owned_event(db, event_id, user)
    if body.title is not None:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="存档名称不能为空")
        event.title = title[:120]
    if body.external_ref is not None:
        event.external_ref = body.external_ref.strip()[:100] or None
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return _event_out(db, event)


@router.delete("/guide-events/{event_id}")
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = _owned_event(db, event_id, user)
    db.execute(delete(GuideArchive).where(GuideArchive.event_id == event.id))
    db.delete(event)
    db.commit()
    return {"ok": True}


@router.post("/guide-events/{event_id}/flows", response_model=GuideArchiveOut, status_code=201)
def add_flow(
    event_id: int,
    body: GuideEventAddFlowIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = _owned_event(db, event_id, user)
    archive = _start_archive(db, event=event, flow_id=body.flow_id, user=user)
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(archive)
    return archive


@router.delete("/guide-events/{event_id}/flows/{archive_id}")
def remove_flow(
    event_id: int,
    archive_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = _owned_event(db, event_id, user)
    archive = db.get(GuideArchive, archive_id)
    if archive is None or archive.user_id != user.id or archive.event_id != event.id:
        raise HTTPException(status_code=404, detail="流程办理实例不存在")
    db.delete(archive)
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
