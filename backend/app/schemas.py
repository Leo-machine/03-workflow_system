"""API 出入参模型（与前端 types.ts 对齐）。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ---------- auth ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    role: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- 台账：units / persons ----------
class UnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    order_index: int


class UnitUpsertIn(BaseModel):
    name: str
    order_index: int = 0


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
    code: str  # 业务键：小写字母/数字/连字符；更新时忽略（不可变）
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


class StepOut(BaseModel):
    id: int
    code: str
    name: str
    task: str
    order_index: int
    persons: list[PersonOut]  # 环节内嵌人员（多选 = 并行），实时解析台账
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


class StepDefinitionIn(BaseModel):
    code: str
    name: str
    task: str = ""
    person_ids: list[int] = []  # 环节选用的人员（台账 id）
    guide: list[GuideItemIn] = []


class FlowDefinitionIn(BaseModel):
    steps: list[StepDefinitionIn]


class FlowMutationResult(BaseModel):
    flow: FlowDetailOut
    change_log_id: int | None = None
    changed: bool = True  # False = no-op（内容无变化），未写日志


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
