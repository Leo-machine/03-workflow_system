"""管理员用户管理。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_admin
from app.models import User
from app.schemas import UserAdminPatchIn, UserOut
from app.security import hash_password

router = APIRouter(tags=["users"])


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return list(db.scalars(select(User).order_by(User.id)))


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserAdminPatchIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if body.role is not None:
        if body.role not in {"viewer", "admin"}:
            raise HTTPException(status_code=422, detail="用户角色无效")
        if target.id == admin.id and body.role != "admin":
            raise HTTPException(status_code=422, detail="不能取消自己的管理员权限")
        target.role = body.role
    if body.active is not None:
        if target.id == admin.id and not body.active:
            raise HTTPException(status_code=422, detail="不能停用当前登录账号")
        target.active = body.active
    if body.display_name is not None:
        target.display_name = body.display_name.strip()[:50]
    if body.new_password is not None:
        if len(body.new_password) < 8:
            raise HTTPException(status_code=422, detail="新密码至少需要 8 位")
        target.password_hash = hash_password(body.new_password)
    db.commit()
    db.refresh(target)
    return target
