"""种子数据：以 docs/prototype.jsx 的物理机资源申请流程为准灌库。

迁移只管 schema，数据一律走本脚本；业务域和流程按稳定业务键幂等同步。
人员/单位台账一律不灌（需求方要求线上台账为真实数据，由管理员在设计器内维护）。
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import (
    BusinessDomain,
    Flow,
    GuideItem,
    Step,
    User,
)
from app.security import hash_password

# 「提交资源申请」环节的系统操作指引（附件一 15 步的忠实压缩，含真实链接与依据）
APPLY_GUIDE = [
    ("云盾平台2.0", "http://10.100.186.75:8082/front/login",
     "登录后进入『综合支持 → 资源管理 → 资源套餐』。", None),
    ("云盾平台2.0", None,
     "在『资源申请基本信息』中关联信息系统的『并网准备阶段』工单号。",
     "办数字〔2026〕48号：未通过并网准备阶段审查，不得分配 IT 资源，不得实施部署。"),
    ("云盾平台2.0", None,
     "到『工单中心 → 工单查询 → 并网审查』查到已通过的并网工单号，完成关联。", None),
    ("云盾平台2.0", None,
     "新建工单，标题按『【云计算资源】XX系统XX功能资源申请』；资源类型选『南网云平台资源』。",
     "系统名称须与云盾平台记录一一对应，审批发现不一致直接回退。"),
    ("计算资源申请系统", "https://10.100.197.153:50010/",
     "进入『日常资源申请 → 申请填报 → 计算资源』，勾选所需资源；新增服务器须同时勾选 IP、堡垒机HAC、监控资源。",
     "Q/CSG31112001-2025：单台虚拟机最大 CPU 32 核、内存 64GB。"),
    ("计算资源申请系统", None,
     "按模板填写申请理由：业务背景 / 为何需要新资源 / 规模及测算依据 / 是否已纳入运行方式。",
     "『为何需要新资源』是评审最看重的一栏；扩容类需附监测数据。"),
    ("计算资源申请系统", None,
     "添加资源清单后点『导出』，下载报表。", None),
    ("云盾平台2.0", None,
     "将导出报表作为附件提交，选择直属经理审批，完成资源申请。", None),
]

IP_DELIVERY_GUIDE = [
    ("计算资源申请系统", "https://10.100.197.153:50010/",
     "无法访问请联系艾洲开通终端访问策略；登录 4A 账号找韦立演获取。", None),
]

# 环节（附件二泳道；人员由管理员在设计器中按台账选用，种子不指定）
STEPS = [
    ("010", "提交资源申请", "在云盾平台发起物理机/云资源申请。", APPLY_GUIDE),
    ("020", "报送并网计划", "每月 25 日前报送下月并网计划。", []),
    ("030", "信息系统并网审核", "由安运调度团队完成并网审核。", []),
    ("040", "物理机需求审核", "平台运维团队经理审核资源需求合理性。", []),
    ("050", "资源 IP 交付", "交付资源与 IP。", IP_DELIVERY_GUIDE),
    ("060", "录入云盾系统", "将交付结果录入云盾系统。", []),
    ("070", "上架·网络·初始化", "服务器上架、网络联通配置、资源初始化。", []),
    ("0100", "堡垒机 HAC 绑定", "运维堡垒机 HAC 绑定。", []),
    ("011", "资源交付（并行三路）", "平台软件、技术中台、监控资源三路并行交付，完成后汇合。", []),
    ("014", "特权账号录入", "账号密码录入特权账号系统。", []),
]

FLOW_NAME = "物理机服务器资源申请"
FLOW_DESC = "归谁办 · 做什么、交什么 · 在哪些系统怎么操作（附带链接）。"
PHYSICAL_FLOW_SLUG = "phys-server-apply"

DOMAINS = [
    ("host-operations", "主机运维", "主机与服务器运行维护。", "server"),
    ("storage-operations", "存储运维", "存储资源运行维护。", "storage"),
    ("backup-operations", "备份设备运维", "备份设备运行维护。", "backup"),
    ("cloud-platform-operations", "云平台运维", "云平台运行维护。", "cloud"),
    ("platform-software-operations", "平台软件运维", "平台软件运行维护。", "software"),
    ("it-resource-delivery", "IT资源交付", "IT 资源申请、交付与扩容。", "resource-delivery"),
]

DRAFT_FLOWS = [
    ("virtual-machine-apply", "虚拟机申请", "虚拟机资源申请流程建设中。"),
    ("platform-software-apply", "平台软件申请(操作系统/数据库/中间件/消息队列)", "平台软件资源申请流程建设中。"),
    ("backup-resource-apply", "备份资源申请", "备份资源申请流程建设中。"),
    ("resource-scale-up", "资源扩容", "资源扩容流程建设中。"),
]


def _sync(instance: object, **values: object) -> bool:
    changed = False
    for field, value in values.items():
        if getattr(instance, field) != value:
            setattr(instance, field, value)
            changed = True
    return changed


def _add_physical_steps(db: Session, *, flow: Flow) -> None:
    for order_index, (code, name, task, guide) in enumerate(STEPS):
        step = Step(flow_id=flow.id, code=code, name=name, task=task, order_index=order_index)
        db.add(step)
        db.flush()
        for guide_index, (system_name, url, action_text, note) in enumerate(guide, start=1):
            db.add(GuideItem(
                step_id=step.id,
                order_index=guide_index,
                system_name=system_name,
                url=url,
                action_text=action_text,
                note=note,
            ))


def _create_m1_foundation(
    db: Session,
    *,
    domain: BusinessDomain,
    admin_username: str,
    admin_password: str,
    viewer_username: str,
    viewer_password: str,
) -> Flow:
    flow = Flow(
        slug=PHYSICAL_FLOW_SLUG,
        domain_id=domain.id,
        name=FLOW_NAME,
        description=FLOW_DESC,
        status="published",
        order_index=0,
        updated_by="seed",
    )
    db.add(flow)
    db.flush()
    _add_physical_steps(db, flow=flow)
    db.add_all([
        User(username=admin_username, password_hash=hash_password(admin_password), role="admin"),
        User(username=viewer_username, password_hash=hash_password(viewer_password), role="viewer"),
    ])
    return flow


def seed_data(
    db: Session,
    *,
    admin_username: str,
    admin_password: str,
    viewer_username: str,
    viewer_password: str,
) -> bool:
    """按稳定业务键同步种子；返回本次是否产生新增或更新。"""
    changed = False
    domains: dict[str, BusinessDomain] = {}
    for order_index, (code, name, description, icon) in enumerate(DOMAINS):
        domain = db.scalar(select(BusinessDomain).where(BusinessDomain.code == code))
        if domain is None:
            domain = BusinessDomain(
                code=code,
                name=name,
                description=description,
                icon=icon,
                order_index=order_index,
            )
            db.add(domain)
            changed = True
        else:
            changed |= _sync(
                domain,
                name=name,
                description=description,
                icon=icon,
                order_index=order_index,
            )
        domains[code] = domain
    db.flush()

    delivery_domain = domains["it-resource-delivery"]
    physical = db.scalar(select(Flow).where(Flow.slug == PHYSICAL_FLOW_SLUG))
    if physical is None:
        flows_with_steps = db.scalars(select(Flow).join(Step).distinct()).all()
        if len(flows_with_steps) == 1:
            physical = flows_with_steps[0]
            changed |= _sync(
                physical,
                slug=PHYSICAL_FLOW_SLUG,
                domain_id=delivery_domain.id,
                status="published",
                order_index=0,
            )
        elif len(flows_with_steps) == 0:
            physical = _create_m1_foundation(
                db,
                domain=delivery_domain,
                admin_username=admin_username,
                admin_password=admin_password,
                viewer_username=viewer_username,
                viewer_password=viewer_password,
            )
            changed = True
        else:
            raise RuntimeError(
                "未找到 phys-server-apply，且存在多条带环节流程；拒绝猜测历史物理机流程。"
            )
    else:
        # 已有 slug：只回填归属与排序，绝不覆盖环节内容或管理员改过的名称/状态
        changed |= _sync(
            physical,
            domain_id=delivery_domain.id,
            order_index=0,
        )

    for order_index, (slug, name, description) in enumerate(DRAFT_FLOWS, start=1):
        flow = db.scalar(select(Flow).where(Flow.slug == slug))
        if flow is None:
            db.add(Flow(
                slug=slug,
                domain_id=delivery_domain.id,
                name=name,
                description=description,
                status="draft",
                order_index=order_index,
                updated_by="seed",
            ))
            changed = True
        else:
            # 已有占位流程：不覆盖名称/描述/状态/环节（设计器可能已改过）
            changed |= _sync(
                flow,
                domain_id=delivery_domain.id,
                order_index=order_index,
            )
    db.flush()
    return changed


def main() -> None:
    with SessionLocal() as db:
        created = seed_data(
            db,
            admin_username=settings.admin_username,
            admin_password=settings.admin_password,
            viewer_username=settings.viewer_username,
            viewer_password=settings.viewer_password,
        )
        db.commit()
    if created:
        print("[seed] 业务域与流程种子已同步")
    else:
        print("[seed] 业务域与流程种子已是最新（幂等）")


if __name__ == "__main__":
    main()
