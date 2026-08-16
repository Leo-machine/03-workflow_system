"""“带我办理”账号级阅读存档。"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import Flow, GuideArchive, GuideEvent, GuideItem, Step, User
from app.schemas import GuideArchiveOut, GuideArchiveSaveIn, GuideResumeOut

router = APIRouter(tags=["guide-archives"])


def _owned_archive(db: Session, archive_id: int, user: User) -> GuideArchive:
    archive = db.get(GuideArchive, archive_id)
    if archive is None or archive.user_id != user.id:
        raise HTTPException(status_code=404, detail="流程办理实例不存在")
    return archive


@router.get("/guide-archives/{archive_id}", response_model=GuideArchiveOut)
def get_archive_instance(archive_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _owned_archive(db, archive_id, user)


@router.delete("/guide-archives/{archive_id}")
def delete_archive_instance(
    archive_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    archive = _owned_archive(db, archive_id, user)
    event_id = archive.event_id
    db.delete(archive)
    if event_id:
        event = db.get(GuideEvent, event_id)
        if event:
            event.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.put("/guide-archives/{archive_id}", response_model=GuideArchiveOut)
def save_archive_instance(
    archive_id: int,
    body: GuideArchiveSaveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    archive = _owned_archive(db, archive_id, user)
    if body.status not in {"in_progress", "completed"}:
        raise HTTPException(status_code=422, detail="存档状态无效")
    step = db.get(Step, body.step_id)
    if step is None or step.flow_id != archive.flow_id:
        raise HTTPException(status_code=422, detail="环节不属于当前流程")
    if body.guide_item_id is not None:
        guide = db.get(GuideItem, body.guide_item_id)
        if guide is None or guide.step_id != step.id:
            raise HTTPException(status_code=422, detail="操作指引不属于当前环节")
    now = datetime.now(timezone.utc)
    archive.step_id = step.id
    archive.guide_item_id = body.guide_item_id
    archive.status = body.status
    archive.updated_at = now
    archive.completed_at = now if body.status == "completed" else None
    if archive.event_id:
        event = db.get(GuideEvent, archive.event_id)
        if event:
            event.updated_at = now
    db.commit()
    db.refresh(archive)
    return archive


def _latest(db: Session, user_id: int, flow_id: int) -> GuideArchive | None:
    return db.scalar(
        select(GuideArchive)
        .where(GuideArchive.user_id == user_id, GuideArchive.flow_id == flow_id)
        .order_by(GuideArchive.updated_at.desc(), GuideArchive.id.desc())
        .limit(1)
    )


@router.get("/flows/{flow_id}/guide-resumes", response_model=list[GuideResumeOut])
def list_resumes(
    flow_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(GuideArchive, GuideEvent)
        .outerjoin(GuideEvent, GuideEvent.id == GuideArchive.event_id)
        .where(GuideArchive.user_id == user.id, GuideArchive.flow_id == flow_id)
        .order_by(GuideArchive.updated_at.desc(), GuideArchive.id.desc())
    ).all()
    return [
        GuideResumeOut(
            archive_id=archive.id,
            event_id=event.id if event else archive.event_id,
            event_title=event.title if event else None,
            event_key=event.event_key if event else None,
            external_ref=event.external_ref if event else None,
            status=archive.status,
            updated_at=archive.updated_at,
        )
        for archive, event in rows
    ]


@router.get("/flows/{flow_id}/guide-archive", response_model=GuideArchiveOut | None)
def get_archive(
    flow_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _latest(db, user.id, flow_id)


@router.put("/flows/{flow_id}/guide-archive", response_model=GuideArchiveOut)
def save_archive(
    flow_id: int,
    body: GuideArchiveSaveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.status not in {"in_progress", "completed"}:
        raise HTTPException(status_code=422, detail="存档状态无效")
    if db.get(Flow, flow_id) is None:
        raise HTTPException(status_code=404, detail="流程不存在")
    step = db.get(Step, body.step_id)
    if step is None or step.flow_id != flow_id:
        raise HTTPException(status_code=422, detail="环节不属于当前流程")
    if body.guide_item_id is not None:
        guide = db.get(GuideItem, body.guide_item_id)
        if guide is None or guide.step_id != step.id:
            raise HTTPException(status_code=422, detail="操作指引不属于当前环节")

    archive = _latest(db, user.id, flow_id)
    if archive is None or body.restart or archive.status == "completed" and body.status == "in_progress":
        archive = GuideArchive(user_id=user.id, flow_id=flow_id)
        db.add(archive)

    now = datetime.now(timezone.utc)
    archive.step_id = body.step_id
    archive.guide_item_id = body.guide_item_id
    archive.status = body.status
    archive.updated_at = now
    archive.completed_at = now if body.status == "completed" else None
    db.commit()
    db.refresh(archive)
    return archive
