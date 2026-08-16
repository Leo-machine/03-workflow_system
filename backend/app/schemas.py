"""API 出入参模型（与前端 types.ts 对齐）。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ---------- auth ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    display_name: str = ""
    active: bool = True


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""


class UserAdminPatchIn(BaseModel):
    role: str | None = None
    active: bool | None = None
    display_name: str | None = None
    new_password: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- 台账：units / persons ----------
class PersonBrief(BaseModel):
    """精简人员：给团队负责人 / 直接领导用，避免和 UnitOut 循环嵌套。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    title: str = ""
    contact: str | None = None
    active: bool = True


class UnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    order_index: int
    leader: PersonBrief | None = None


class UnitUpsertIn(BaseModel):
    name: str
    order_index: int = 0
    leader_person_id: int | None = None


class DomainRefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    unit: UnitOut | None
    title: str
    contact: str | None
    source: str
    active: bool
    domains: list[DomainRefOut] = []  # 可服务业务域（可多选）


class PersonUpsertIn(BaseModel):
    name: str
    unit_id: int | None = None
    title: str = ""
    contact: str | None = None
    active: bool = True
    domain_ids: list[int] = []  # 可服务业务域 id 集合


class PersonBulkImportRow(BaseModel):
    name: str
    unit_name: str | None = None  # 团队按名字匹配；不存在则自动创建
    title: str = ""


class PersonBulkImportIn(BaseModel):
    rows: list[PersonBulkImportRow]


class PersonBulkImportSkip(BaseModel):
    name: str
    reason: str


class PersonBulkImportResult(BaseModel):
    created_persons: int
    created_units: list[str]
    skipped: list[PersonBulkImportSkip]


# ---------- business domains ----------
class DomainOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: str
    icon: str
    order_index: int
    published_flow_count: int


class DomainFlowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str | None
    name: str
    description: str
    status: str


class DomainDetailOut(DomainOut):
    flows: list[DomainFlowOut]


class DomainUpsertIn(BaseModel):
    code: str | None = None  # 兼容旧客户端；创建时由服务端自动生成，更新时忽略
    name: str
    description: str = ""
    icon: str = "server"
    order_index: int | None = None  # 缺省排最后


# ---------- flows ----------
class GuideItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    system_name: str
    url: str | None
    image_path: str | None
    action_text: str
    note: str | None
    unit: UnitOut | None = None  # 责任团队（台账）
    persons: list[PersonOut] = []  # 责任人（受团队约束，可多选）
    escalation: PersonBrief | None = None  # 本条指定的直接领导；空则用团队负责人
    direct_leader: PersonBrief | None = None  # 解析后的直接领导（指定或默认）


class StepOut(BaseModel):
    id: int
    code: str
    name: str
    task: str
    order_index: int
    image_path: str | None = None  # 兼容旧字段；新 UI 不再维护
    persons: list[PersonOut] = []  # 由各指引责任人聚合，供流程条并行角标
    guide: list[GuideItemOut]


class FlowDetailOut(BaseModel):
    id: int
    name: str
    description: str
    status: str
    steps: list[StepOut]
    slug: str | None = None
    domain_id: int | None = None


class FlowCreateIn(BaseModel):
    domain_id: int
    name: str
    description: str = ""


class FlowPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None  # draft | published


class GuideItemIn(BaseModel):
    system_name: str
    action_text: str
    url: str | None = None
    image_path: str | None = None
    note: str | None = None
    unit_id: int | None = None  # 责任团队
    person_ids: list[int] = []  # 责任人（须属于所选团队）
    escalation_person_id: int | None = None  # 直接领导；空则用责任团队负责人


class StepDefinitionIn(BaseModel):
    code: str
    name: str
    task: str = ""
    guide: list[GuideItemIn] = []
    # 以下字段兼容旧客户端，服务端忽略，责任与图示以 guide 为准
    image_path: str | None = None
    person_ids: list[int] = []


class FlowDefinitionIn(BaseModel):
    steps: list[StepDefinitionIn]


class FlowMutationResult(BaseModel):
    flow: FlowDetailOut
    change_log_id: int | None = None
    changed: bool = True  # False = no-op（内容无变化），未写日志


# ---------- 带我办理存档 ----------
class GuideArchiveSaveIn(BaseModel):
    step_id: int
    guide_item_id: int | None = None
    status: str = "in_progress"  # in_progress | completed
    restart: bool = False


class GuideArchiveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int | None
    flow_id: int
    step_id: int | None
    guide_item_id: int | None
    status: str
    started_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class GuideResumeOut(BaseModel):
    """同一流程下当前用户可继续的办理实例。"""

    archive_id: int
    event_id: int | None
    event_title: str | None
    event_key: str | None
    external_ref: str | None
    status: str
    updated_at: datetime


class GuideEventCreateIn(BaseModel):
    title: str
    external_ref: str | None = None
    flow_id: int | None = None


class GuideEventPatchIn(BaseModel):
    title: str | None = None
    external_ref: str | None = None


class GuideEventAddFlowIn(BaseModel):
    flow_id: int


class GuideEventFlowOut(BaseModel):
    archive_id: int
    flow_id: int
    flow_name: str
    status: str
    step_id: int | None
    guide_item_id: int | None
    updated_at: datetime


class GuideEventOut(BaseModel):
    id: int
    event_key: str
    title: str
    external_ref: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    flows: list[GuideEventFlowOut] = []


class AvailableGuideFlowOut(BaseModel):
    id: int
    name: str
    domain_name: str


# ---------- change logs ----------
class ChangeLogOut(BaseModel):
    id: int
    entity_type: str
    entity_id: str
    field: str
    old_value: str | None
    new_value: str | None
    old_name: str | None  # 名称快照：对象改名/删除后日志仍可读
    new_name: str | None
    role_name: str | None  # entity_type=assignment（历史遗留）时 join roles.name
    changed_by: str
    changed_at: datetime


class FlowImportIssue(BaseModel):
    row: int
    message: str


class FlowImportFlowPlan(BaseModel):
    domain_name: str
    flow_name: str
    step_count: int
    guide_count: int


class FlowImportResult(BaseModel):
    ok: bool
    committed: bool
    issues: list[FlowImportIssue] = []
    flows: list[FlowImportFlowPlan] = []
    created_flow_ids: list[int] = []
