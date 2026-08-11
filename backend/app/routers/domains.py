"""业务域：全员只读 + 管理员增改删（应对业务变化）。"""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db, require_admin
from app.models import BusinessDomain, ChangeLog, Flow, PersonDomain, User
from app.schemas import DomainDetailOut, DomainFlowOut, DomainOut, DomainUpsertIn

router = APIRouter(tags=["domains"])

def _published_count():
    return (
        select(func.count(Flow.id))
        .where(Flow.domain_id == BusinessDomain.id, Flow.status == "published")
        .correlate(BusinessDomain)
        .scalar_subquery()
    )


def _new_domain_code(db: Session) -> str:
    """生成不可变业务键；不使用名称，避免改名、重名和中文转写带来的不稳定。"""
    for _ in range(8):
        code = f"domain-{uuid4().hex[:12]}"
        if db.scalar(select(BusinessDomain.id).where(BusinessDomain.code == code)) is None:
            return code
    raise HTTPException(status_code=500, detail="无法生成唯一业务键")


def _domain_out(domain: BusinessDomain, published_flow_count: int) -> DomainOut:
    return DomainOut(
        id=domain.id,
        code=domain.code,
        name=domain.name,
        description=domain.description,
        icon=domain.icon,
        order_index=domain.order_index,
        published_flow_count=published_flow_count,
    )


@router.get("/domains", response_model=list[DomainOut])
def list_domains(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    count = _published_count().label("published_flow_count")
    rows = db.execute(
        select(BusinessDomain, count).order_by(BusinessDomain.order_index, BusinessDomain.id)
    ).all()
    return [_domain_out(domain, published_flow_count) for domain, published_flow_count in rows]


@router.get("/domains/{domain_id}", response_model=DomainDetailOut)
def get_domain(
    domain_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = _published_count().label("published_flow_count")
    row = db.execute(
        select(BusinessDomain, count).where(BusinessDomain.id == domain_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="业务域不存在")

    domain, published_flow_count = row
    stmt = select(Flow).where(Flow.domain_id == domain.id)
    # draft 仅 admin 可见；普通用户只看到已发布流程
    if user.role != "admin":
        stmt = stmt.where(Flow.status == "published")
    flows = db.scalars(stmt.order_by(Flow.order_index, Flow.id)).all()
    base = _domain_out(domain, published_flow_count)
    return DomainDetailOut(
        **base.model_dump(),
        flows=[
            DomainFlowOut(
                id=flow.id,
                slug=flow.slug,
                name=flow.name,
                description=flow.description,
                status=flow.status,
            )
            for flow in flows
        ],
    )


def _add_domain_log(
    db: Session, *, domain: BusinessDomain, field: str, admin: User,
    old_name: str | None = None, new_name: str | None = None,
) -> None:
    db.add(ChangeLog(
        entity_type="domain",
        entity_id=str(domain.id),
        field=field,
        old_value=None,
        new_value=None,
        old_name=old_name,
        new_name=new_name,
        changed_by=admin.username,
    ))


@router.post("/domains", response_model=DomainOut)
def create_domain(
    body: DomainUpsertIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="业务域名称不能为空")

    order_index = body.order_index
    if order_index is None:
        order_index = (db.scalar(select(func.max(BusinessDomain.order_index))) or 0) + 1

    domain = BusinessDomain(
        code=_new_domain_code(db),
        name=name,
        description=body.description,
        icon=body.icon,
        order_index=order_index,
    )
    db.add(domain)
    db.flush()
    _add_domain_log(db, domain=domain, field="create", admin=admin, new_name=domain.name)
    db.commit()
    return _domain_out(domain, 0)


@router.put("/domains/{domain_id}", response_model=DomainOut)
def update_domain(
    domain_id: int,
    body: DomainUpsertIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    domain = db.get(BusinessDomain, domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="业务域不存在")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="业务域名称不能为空")

    # code 是业务键，不允许改（seed 幂等同步、外部引用都靠它）
    if name != domain.name:
        _add_domain_log(db, domain=domain, field="name", admin=admin,
                        old_name=domain.name, new_name=name)
        domain.name = name
    domain.description = body.description
    domain.icon = body.icon
    if body.order_index is not None:
        domain.order_index = body.order_index
    db.commit()
    count = db.scalar(
        select(func.count(Flow.id)).where(
            Flow.domain_id == domain.id, Flow.status == "published"
        )
    )
    return _domain_out(domain, count or 0)


@router.delete("/domains/{domain_id}")
def delete_domain(
    domain_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    domain = db.get(BusinessDomain, domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="业务域不存在")
    flow_count = db.scalar(select(func.count(Flow.id)).where(Flow.domain_id == domain_id))
    if flow_count:
        raise HTTPException(
            status_code=422,
            detail=f"该业务域下仍有 {flow_count} 条流程，请先删除或迁移流程",
        )
    person_count = db.scalar(
        select(func.count()).select_from(PersonDomain).where(PersonDomain.domain_id == domain_id)
    )
    if person_count:
        raise HTTPException(
            status_code=422,
            detail=f"仍有 {person_count} 名人员绑定该业务域，请先在台账中解绑",
        )
    _add_domain_log(db, domain=domain, field="delete", admin=admin, old_name=domain.name)
    db.delete(domain)
    db.commit()
    return {"ok": True}
