"""办理事件：一个事项下组织多个“带我办理”流程实例。"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
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


@router.get("/guide-events", response_model=list[GuideEventOut])
def list_events(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    events = db.scalars(
        select(GuideEvent).where(GuideEvent.user_id == user.id)
        .order_by(GuideEvent.updated_at.desc(), GuideEvent.id.desc())
    ).all()
    return [_event_out(db, event) for event in events]


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


@router.post("/guide-events/{event_id}/flows", response_model=GuideArchiveOut, status_code=201)
def add_flow(
    event_id: int,
    body: GuideEventAddFlowIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = _owned_event(db, event_id, user)
    flow = db.scalar(select(Flow).where(Flow.id == body.flow_id, Flow.status == "published"))
    if flow is None and user.role != "admin":
        raise HTTPException(status_code=404, detail="流程不存在")
    if flow is None:
        flow = db.get(Flow, body.flow_id)
    first_step = db.scalar(select(Step).where(Step.flow_id == flow.id).order_by(Step.order_index)) if flow else None
    if flow is None or first_step is None:
        raise HTTPException(status_code=422, detail="该流程尚无可办理环节")
    archive = GuideArchive(
        event_id=event.id, user_id=user.id, flow_id=flow.id, step_id=first_step.id,
        guide_item_id=None, status="in_progress",
    )
    db.add(archive)
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(archive)
    return archive
