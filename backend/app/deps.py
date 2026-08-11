"""FastAPI 公共依赖：会话、当前用户、管理员门槛。

TODO(4A/SSO)：接内网 4A/SSO 时，只需替换 get_current_user 的实现
（改为校验 SSO 票据/网关注入头），各路由的依赖声明不用动。
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未登录或登录已过期",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise unauthorized
    try:
        payload = decode_access_token(creds.credentials)
        username = payload["sub"]
    except (PyJWTError, KeyError):
        raise unauthorized
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.active:
        raise unauthorized
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return user


__all__ = ["get_db", "get_current_user", "require_admin"]
