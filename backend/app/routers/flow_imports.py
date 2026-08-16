"""流程表格导入：下载模板、预览校验、确认写入 draft。"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.deps import get_db, require_admin
from app.flow_import import preview_or_commit, template_csv
from app.models import User
from app.schemas import FlowImportResult

router = APIRouter(tags=["flow-imports"])
MAX_BYTES = 2 * 1024 * 1024


@router.get("/flow-imports/template.csv")
def download_template(_: User = Depends(require_admin)):
    return Response(
        content=template_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="flow-import-template.csv"'},
    )


async def _read_upload(file: UploadFile) -> tuple[str, bytes]:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="上传文件为空")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=422, detail="文件过大，请控制在 2MB 以内")
    return file.filename or "import.csv", data


@router.post("/flow-imports/preview", response_model=FlowImportResult)
async def preview_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    filename, data = await _read_upload(file)
    return preview_or_commit(db, filename=filename, data=data, admin=admin, commit=False)


@router.post("/flow-imports/commit", response_model=FlowImportResult)
async def commit_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    filename, data = await _read_upload(file)
    return preview_or_commit(db, filename=filename, data=data, admin=admin, commit=True)
