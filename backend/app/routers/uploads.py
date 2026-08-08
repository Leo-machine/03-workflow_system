"""guide / 环节图示上传：文件落盘，库里只记 /api/media/... 路径。"""
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.deps import get_current_user, require_admin
from app.models import User

router = APIRouter(tags=["uploads"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_BYTES = 5 * 1024 * 1024  # 5MB
MEDIA_PATH_RE = re.compile(r"^/api/media/[0-9a-f]{32}\.(jpg|png|webp|gif)$")


class UploadOut(BaseModel):
    path: str  # 例如 /api/media/….png，前端可直接作 img/src / 打开链接


def media_dir() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def is_valid_media_path(value: str | None) -> bool:
    if value is None or value == "":
        return True
    return bool(MEDIA_PATH_RE.match(value))


@router.get("/media/{filename}", response_class=FileResponse)
def get_image(filename: str, _: User = Depends(get_current_user)):
    """图片可能包含内网操作信息，因此读取也必须登录。"""
    if not MEDIA_PATH_RE.match(f"/api/media/{filename}"):
        raise HTTPException(status_code=404, detail="图片不存在")
    path = media_dir() / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(path)


@router.post("/uploads/images", response_model=UploadOut)
async def upload_image(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
):
    content_type = (file.content_type or "").lower()
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if not ext:
        raise HTTPException(status_code=422, detail="仅支持 JPG / PNG / WEBP / GIF 图片")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="空文件")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=422, detail="图片不能超过 5MB")

    filename = f"{uuid.uuid4().hex}{ext}"
    dest = media_dir() / filename
    dest.write_bytes(data)
    return UploadOut(path=f"/api/media/{filename}")
