from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_admin
from app.models import ChangeLog, User
from app.schemas import ChangeLogOut

router = APIRouter(tags=["change-logs"])


@router.get("/change-logs", response_model=list[ChangeLogOut])
def list_change_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    entity_type: str | None = Query(None),
    entity_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """变更留痕列表（仅 admin），倒序 + 分页。

    名称直接用日志里的快照（old_name/new_name），不依赖对象现状——
    对象改名/删除后回看日志仍对得上事实。
    可选按 entity_type / entity_id 过滤（如流程页只看本流程）。
    """
    stmt = select(ChangeLog)
    if entity_type:
        stmt = stmt.where(ChangeLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(ChangeLog.entity_id == entity_id)
    logs = db.scalars(stmt.order_by(ChangeLog.id.desc()).limit(limit).offset(offset)).all()

    return [
        ChangeLogOut(
            id=log.id,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            field=log.field,
            old_value=log.old_value,
            new_value=log.new_value,
            old_name=log.old_name,
            new_name=log.new_name,
            role_name=None,  # roles 表已废弃；历史 assignment 日志以快照为准
            changed_by=log.changed_by,
            changed_at=log.changed_at,
        )
        for log in logs
    ]
