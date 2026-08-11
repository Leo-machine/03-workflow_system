import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import User
from app.schemas import LoginRequest, LoginResponse, RegisterRequest, UserOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    token = create_access_token(username=user.username, role=user.role)
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/auth/register", response_model=LoginResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    username = body.username.strip()
    display_name = body.display_name.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{3,50}", username) is None:
        raise HTTPException(status_code=422, detail="账号须为 3–50 位字母、数字、下划线或短横线")
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="密码至少需要 8 位")
    if db.scalar(select(User.id).where(User.username == username)) is not None:
        raise HTTPException(status_code=409, detail="该账号已存在")
    user = User(
        username=username,
        display_name=display_name[:50],
        password_hash=hash_password(body.password),
        role="viewer",
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(username=user.username, role=user.role)
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)
