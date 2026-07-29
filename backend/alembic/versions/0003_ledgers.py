"""ledgers: units + persons(unit) + step_persons；废弃 roles/assignments/step_roles

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-29

岗位模型调整为台账模型：
- 新增 units（所属单位台账）、persons（人员信息台账，挂单位）、
  step_persons（环节↔人员多对多，人员内嵌在环节中）
- 删除旧岗位模型的 roles / assignments / step_roles 及旧 persons 表
  （旧数据按需求方指示全部废弃，不做数据迁移）
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 先摘依赖：step_roles/assignments 引用 roles 与 persons
    op.drop_table("step_roles")
    op.drop_table("assignments")
    op.drop_index("ix_roles_code", table_name="roles")
    op.drop_table("roles")
    op.drop_table("persons")

    op.create_table(
        "units",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_units_name", "units", ["name"], unique=True)

    op.create_table(
        "persons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("contact", sa.String(length=100), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_persons_unit_id", "persons", ["unit_id"], unique=False)

    op.create_table(
        "step_persons",
        sa.Column("step_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"]),
        sa.ForeignKeyConstraint(["step_id"], ["steps.id"]),
        sa.PrimaryKeyConstraint("step_id", "person_id"),
    )


def downgrade() -> None:
    op.drop_table("step_persons")
    op.drop_index("ix_persons_unit_id", table_name="persons")
    op.drop_table("persons")
    op.drop_index("ix_units_name", table_name="units")
    op.drop_table("units")

    # 复原旧岗位模型（空表，不回填数据）
    op.create_table(
        "persons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("dept", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("contact", sa.String(length=100), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_roles_code", "roles", ["code"], unique=True)
    op.create_table(
        "assignments",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.String(length=50), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.PrimaryKeyConstraint("role_id"),
    )
    op.create_table(
        "step_roles",
        sa.Column("step_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.ForeignKeyConstraint(["step_id"], ["steps.id"]),
        sa.PrimaryKeyConstraint("step_id", "role_id"),
    )
