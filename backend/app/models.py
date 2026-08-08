"""数据模型（台账 + 流程定义 + 审计 + 账号）。

台账层（管理员随时维护，因为人会变动）：
- units：所属单位台账
- persons：人员信息台账（挂在单位下）

流程定义层：
- business_domains / flows / steps / guide_items
- step_persons：环节↔人员多对多（人员内嵌在环节中；多选即并行）

环节展示时实时解析人员与单位：台账里改名/调单位，所有环节自动跟着变。

注意：字段类型只用可移植类型（String/Integer/Boolean/DateTime/Text），
保证 SQLite 单测与真实 PG 行为一致；PG 独有行为由 testcontainers 集成测试覆盖。
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Unit(Base):
    """所属单位台账。"""

    __tablename__ = "units"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    persons: Mapped[list["Person"]] = relationship(back_populates="unit")


class Person(Base):
    """人员信息台账：挂所属单位，可被任意环节选用（不限定死）。"""

    __tablename__ = "persons"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("units.id", ondelete="RESTRICT"), index=True
    )
    title: Mapped[str] = mapped_column(String(100), default="")  # 职务/岗位描述，自由文本
    contact: Mapped[str | None] = mapped_column(String(100))  # 以后接内网通讯录
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual/directory
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    unit: Mapped["Unit | None"] = relationship(back_populates="persons")
    domains: Mapped[list["BusinessDomain"]] = relationship(
        secondary="person_domains", order_by="BusinessDomain.order_index"
    )


class PersonDomain(Base):
    """人员↔可服务业务域多对多：一人可服务多个域，不限于一个。"""

    __tablename__ = "person_domains"

    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id"), primary_key=True)
    domain_id: Mapped[int] = mapped_column(ForeignKey("business_domains.id"), primary_key=True)


class StepPerson(Base):
    """环节↔人员多对多（兼容旧数据；新定义以 guide_item_persons 为准，保存时回写聚合）。"""

    __tablename__ = "step_persons"

    step_id: Mapped[int] = mapped_column(ForeignKey("steps.id"), primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id"), primary_key=True)


class GuideItemPerson(Base):
    """指引条目↔责任人：先选团队再选人，人选受团队约束。"""

    __tablename__ = "guide_item_persons"

    guide_item_id: Mapped[int] = mapped_column(ForeignKey("guide_items.id"), primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id"), primary_key=True)


class BusinessDomain(Base):
    """平台组业务域（全部已投运，均可进入维护流程）。"""

    __tablename__ = "business_domains"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(50))
    order_index: Mapped[int] = mapped_column(Integer)

    flows: Mapped[list["Flow"]] = relationship(
        back_populates="domain", order_by="Flow.order_index"
    )


class Flow(Base):
    __tablename__ = "flows"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    domain_id: Mapped[int | None] = mapped_column(
        ForeignKey("business_domains.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft/published
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    updated_by: Mapped[str] = mapped_column(String(50), default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    steps: Mapped[list["Step"]] = relationship(
        back_populates="flow", order_by="Step.order_index", cascade="all, delete-orphan"
    )
    domain: Mapped["BusinessDomain | None"] = relationship(back_populates="flows")


class Step(Base):
    __tablename__ = "steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    flow_id: Mapped[int] = mapped_column(ForeignKey("flows.id"), index=True)
    code: Mapped[str] = mapped_column(String(20))  # 展示编号，如 010/0100/011
    name: Mapped[str] = mapped_column(String(100))
    task: Mapped[str] = mapped_column(Text, default="")
    order_index: Mapped[int] = mapped_column(Integer)
    image_path: Mapped[str | None] = mapped_column(String(300))  # 环节操作图示，库里只记路径

    flow: Mapped[Flow] = relationship(back_populates="steps")
    persons: Mapped[list[Person]] = relationship(
        secondary=StepPerson.__table__, order_by=Person.id
    )
    guide_items: Mapped[list["GuideItem"]] = relationship(
        back_populates="step", order_by="GuideItem.order_index", cascade="all, delete-orphan"
    )


class GuideItem(Base):
    __tablename__ = "guide_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    step_id: Mapped[int] = mapped_column(ForeignKey("steps.id"), index=True)
    order_index: Mapped[int] = mapped_column(Integer)
    system_name: Mapped[str] = mapped_column(String(100))
    url: Mapped[str | None] = mapped_column(String(300))
    image_path: Mapped[str | None] = mapped_column(String(300))  # 图示存磁盘，库里只记路径
    action_text: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)  # 依据/注意
    unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("units.id", ondelete="RESTRICT"), index=True
    )  # 责任团队（台账 units）

    step: Mapped[Step] = relationship(back_populates="guide_items")
    unit: Mapped["Unit | None"] = relationship()
    persons: Mapped[list[Person]] = relationship(
        secondary=GuideItemPerson.__table__, order_by=Person.id
    )

class ChangeLog(Base):
    """append-only 变更留痕：只插不改不删。

    old_value/new_value 存实体 id（保留链接能力）；
    old_name/new_name 存当时的名称快照 —— 对象改名/删除后回看日志仍对得上事实。
    entity_type：assignment（历史遗留）/ flow / person / unit。
    """

    __tablename__ = "change_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    entity_id: Mapped[str] = mapped_column(String(50))
    field: Mapped[str] = mapped_column(String(50))
    old_value: Mapped[str | None] = mapped_column(String(100))
    new_value: Mapped[str | None] = mapped_column(String(100))
    old_name: Mapped[str | None] = mapped_column(String(100))
    new_name: Mapped[str | None] = mapped_column(String(100))
    changed_by: Mapped[str] = mapped_column(String(50))  # username 快照，不建外键
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))  # viewer/admin
