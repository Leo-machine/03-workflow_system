"""种子数据：以 docs/prototype.jsx 的物理机资源申请流程为准灌库。

迁移只管 schema，数据一律走本脚本；业务域和流程按稳定业务键幂等同步。
人员/单位台账一律不灌（需求方要求线上台账为真实数据，由管理员在设计器内维护）。
"""
from sqlalchemy import func, select
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
    ("guided-experience", "协同办公体验区", "用于体验“带我办理”的逐步业务指引。", "network"),
]

DEMO_FLOW_SLUG = "video-meeting-support-demo"
DEMO_STEPS = [
    ("010", "确认会议需求", "先确认会议时间、参会范围和会议形式，避免后续重复调整。", [
        ("会议组织平台", None, "核对会议主题、开始时间、预计时长以及主会场信息。", "跨单位会议建议至少提前 1 个工作日准备。"),
        ("通讯录", None, "确认主持人、会议联系人及重要参会单位。", None),
    ]),
    ("020", "创建线上会议", "在视频会议系统中创建会议，并按参会范围选择合适的会议权限。", [
        ("视频会议系统", None, "新建会议，填写主题与时间；涉及外部人员时启用等候室。", "会议主题请避免使用简称，方便参会人员识别。"),
        ("视频会议系统", None, "设置主持人和联席主持人，并检查入会静音策略。", None),
    ]),
    ("030", "发送会议通知", "将准确的会议时间、入会方式和注意事项发送给参会人员。", [
        ("协同办公系统", None, "选择参会人员并发送会议通知，正文包含会议主题、时间和入会方式。", None),
        ("即时通讯", None, "对主持人及关键参会人进行单独提醒。", "不要在无关群聊中转发内部会议链接。"),
    ]),
    ("040", "会前联调检查", "会前检查声音、画面、共享和网络，重要会议建议安排双方联调。", [
        ("视频会议系统", None, "进入测试会议，依次检查麦克风、扬声器、摄像头和屏幕共享。", None),
        ("网络监测平台", None, "确认主会场网络稳定，无明显丢包或高时延告警。", "发现异常时优先切换有线网络，并联系网络值班人员。"),
    ]),
    ("050", "会议开始前确认", "提前进入会议室，准备共享材料，并确认主持人与参会人员可以正常入会。", [
        ("视频会议系统", None, "提前 10 分钟入会，打开等候室并确认主持权限。", None),
        ("本地文件", None, "打开需要共享的材料，关闭无关窗口和消息提醒。", "涉及敏感信息的文件不得通过会议共享。"),
    ]),
]

PART_LIFECYCLE_FLOW_SLUG = "compute-card-lifecycle-guide"
PART_SYSTEM_URL = "http://127.0.0.1:5173"
PART_LIFECYCLE_STEPS = [
    ("010", "算力卡到货入库", "按到货资料逐件登记算力卡，建立唯一资产身份并落下第一条入库履历。", [
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/inbound?category=算力卡", "登录系统，从左侧『出入库与流转 → 分类入库』进入，选择『算力卡』。", None),
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/inbound?category=算力卡", "来源选择『独立合同采购』，选择入库库位、运维部门、供应商，填写合同号、所属项目、产权单位、到货验收日期和维保到期时间。", "如果供应商或算力卡型号不在下拉列表中，请先联系领导维护『供应商管理』和『型号管理』。"),
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/inbound?category=算力卡", "选择算力卡型号，核对显存、封装和架构规格；填写固定资产编号、设备序列号、采购金额、可调配标记及备注，点击提交完成入库。", "固定资产编号与序列号用于逐件溯源，提交前务必与到货单和实物铭牌核对。"),
    ]),
    ("020", "将算力卡装入服务器", "从配件详情发起装机，把算力卡由库位转为在用，并建立当前安装关系。", [
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/", "进入『配件列表』，按固定资产编号或序列号找到刚入库的算力卡，打开配件详情并点击『装机』。", "只有当前状态为『在库』的配件才会显示装机入口。"),
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/servers", "在装机页面选择目标服务器，按现场安装位置填写槽位（可选），点击『确认装机』。", "系统将写入『装机』履历并建立配件↔服务器关系；优先选择『未投运』服务器，投运服务器装机后无法直接拆下。"),
    ]),
    ("030", "检修前停运服务器", "服务器下线检修前，先把运行状态切换为未投运，解除投运锁拆保护。", [
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/servers", "进入『服务器管理』，按服务器资产编号找到算力卡所在服务器，打开编辑并将运行状态由『投运』切换为『未投运』。", "配件运行状态由所在服务器实时派生。请先在实际业务侧完成停机或迁移确认，本系统只记录服务器状态。"),
    ]),
    ("040", "拆下算力卡并回库", "选择回库库位，将算力卡从服务器拆下，状态由在用恢复为在库。", [
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/", "回到『配件列表』，打开目标算力卡详情并点击『拆下』。", "若服务器仍为『投运』，系统会直接拦截并提示先到服务器页切换为『未投运』。"),
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/locations", "选择实际回库库位；正常件不要勾选『坏件拆下』，点击『确认拆下』。", "勾选坏件拆下后配件将进入『损坏』状态，后续只能走报废审批。"),
    ]),
    ("050", "发起算力卡借出申请", "为兄弟单位选择借出目的地、归还期限和三级审批人，提交借出审批。", [
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/", "在『配件列表』打开目标算力卡详情，确认当前状态为『在库』，点击『借出』。", "借出申请人取当前登录用户；同一配件存在审批中单据时，不能重复发起。"),
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/approvals", "选择外单位，填写预期归还日，依次选择三名互不相同且不包含申请人的领导作为审批人，点击『提交审批』。", "预期归还日不得早于申请日。审批未全部通过前，配件状态和正式履历不会发生变化。"),
    ]),
    ("060", "完成三级审批与调出", "三名审批人依次处理借出申请；全部通过后系统才将算力卡正式置为借出。", [
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/approvals", "审批人分别登录系统，进入『审批中心 → 待我审批』，核对配件、外单位和预期归还日后选择『通过』或『驳回』。", "当前级审批人必须与登录用户一致；任一级驳回即结束，需重新发起。"),
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/approvals", "三级全部通过后，系统再次确认配件仍在库，随后写入借出履历并将当前位置更新为外单位。", "审批期间若配件状态已变化，最终审批不会强行借出；请按系统提示重新核实。"),
    ]),
    ("070", "归还算力卡入库", "兄弟单位用毕后办理收货确认，选择实际回库库位，将借出件恢复为在库。", [
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/", "在『配件列表』找到状态为『借出』的算力卡；如超过预期归还日，列表会显示超期提醒。打开详情并点击『归还』。", None),
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/locations", "核对归还实物，选择实际回库库位，点击『确认归还入库』。", "归还仅适用于当前状态为『借出』的配件，提交后系统写入归还履历并更新为在库。"),
    ]),
    ("080", "查看全生命周期履历", "通过履历时间线核验入库、装机、拆下、借出和归还的完整资产轨迹。", [
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/", "进入『配件列表』，按固定资产编号找到算力卡，打开详情后点击『查看履历』或『全部履历』。", None),
        ("服务器配件资产管理系统", f"{PART_SYSTEM_URL}/", "按时间线核对每次事件的时间、操作人、状态前后、位置前后、预期归还日期、关联审批和备注。", "履历只增不改不删。页面如提示『缓存不一致』，说明当前状态与履历重放结果不一致，应停止后续操作并联系管理员核查。"),
    ]),
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


def _add_demo_steps(db: Session, *, flow: Flow) -> None:
    for order_index, (code, name, task, guide) in enumerate(DEMO_STEPS):
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


def _add_part_lifecycle_steps(db: Session, *, flow: Flow) -> None:
    for order_index, (code, name, task, guide) in enumerate(PART_LIFECYCLE_STEPS):
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
    # 历史库可能已有账号但缺少物理机流程；账号也必须按用户名幂等创建。
    if db.scalar(select(User.id).where(User.username == admin_username)) is None:
        db.add(User(username=admin_username, password_hash=hash_password(admin_password), role="admin"))
    if db.scalar(select(User.id).where(User.username == viewer_username)) is None:
        db.add(User(username=viewer_username, password_hash=hash_password(viewer_password), role="viewer"))
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
    demo = db.scalar(select(Flow).where(Flow.slug == DEMO_FLOW_SLUG))
    if demo is None:
        demo = Flow(
            slug=DEMO_FLOW_SLUG,
            domain_id=domains["guided-experience"].id,
            name="线上会议保障",
            description="从需求确认、会议创建到会前检查的完整引导体验。",
            status="published",
            order_index=0,
            updated_by="seed",
        )
        db.add(demo)
        db.flush()
        _add_demo_steps(db, flow=demo)
        changed = True
    else:
        changed |= _sync(demo, domain_id=domains["guided-experience"].id, order_index=0)

    # 优先复用管理员已经建立的「配件管理」业务域；新库没有时再创建稳定种子域。
    parts_domain = db.scalar(select(BusinessDomain).where(BusinessDomain.name == "配件管理"))
    if parts_domain is None:
        parts_domain = db.scalar(
            select(BusinessDomain).where(BusinessDomain.code == "parts-management")
        )
    if parts_domain is None:
        next_order = (db.scalar(select(func.max(BusinessDomain.order_index))) or 0) + 1
        parts_domain = BusinessDomain(
            code="parts-management",
            name="配件管理",
            description="服务器核心配件的入库、装机、流转与全生命周期溯源。",
            icon="chip",
            order_index=next_order,
        )
        db.add(parts_domain)
        db.flush()
        changed = True

    lifecycle = db.scalar(select(Flow).where(Flow.slug == PART_LIFECYCLE_FLOW_SLUG))
    if lifecycle is None:
        lifecycle = Flow(
            slug=PART_LIFECYCLE_FLOW_SLUG,
            domain_id=parts_domain.id,
            name="算力卡全生命周期溯源",
            description="指导完成算力卡入库、装机、检修拆下、借出审批、归还及履历核验。",
            status="published",
            order_index=0,
            updated_by="seed",
        )
        db.add(lifecycle)
        db.flush()
        _add_part_lifecycle_steps(db, flow=lifecycle)
        changed = True
    else:
        changed |= _sync(lifecycle, domain_id=parts_domain.id, order_index=0)
    db.flush()
    return changed


def initialize_database(
    db: Session,
    *,
    admin_username: str,
    admin_password: str,
    viewer_username: str,
    viewer_password: str,
) -> bool:
    """仅初始化全新数据库；已有任意账号时绝不再同步业务数据。"""
    if db.scalar(select(User.id).limit(1)) is not None:
        return False
    return seed_data(
        db,
        admin_username=admin_username,
        admin_password=admin_password,
        viewer_username=viewer_username,
        viewer_password=viewer_password,
    )


def main() -> None:
    with SessionLocal() as db:
        # 种子只负责全新数据库的首次初始化。只要已有账号，就说明系统已初始化；
        # 此后业务域和流程完全以管理员操作为准，启动时不得恢复已删除数据。
        initialized = db.scalar(select(User.id).limit(1)) is not None
        if initialized:
            print("[seed] 数据库已初始化，跳过业务种子（尊重管理员增删改）")
            return
        created = initialize_database(
            db,
            admin_username=settings.admin_username,
            admin_password=settings.admin_password,
            viewer_username=settings.viewer_username,
            viewer_password=settings.viewer_password,
        )
        db.commit()
    print("[seed] 全新数据库首次初始化完成" if created else "[seed] 无需初始化")


if __name__ == "__main__":
    main()
