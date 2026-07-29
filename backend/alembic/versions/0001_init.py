"""init: 流程办事地图 M1 全部 9 张表

Revision ID: 0001
Revises:
Create Date: 2026-07-26

迁移只管 schema；种子数据走 app/seed.py（幂等）。
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
        "flows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("updated_by", sa.String(length=50), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "change_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.String(length=50), nullable=False),
        sa.Column("field", sa.String(length=50), nullable=False),
        sa.Column("old_value", sa.String(length=100), nullable=True),
        sa.Column("new_value", sa.String(length=100), nullable=True),
        sa.Column("old_name", sa.String(length=100), nullable=True),
        sa.Column("new_name", sa.String(length=100), nullable=True),
        sa.Column("changed_by", sa.String(length=50), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_change_logs_entity_type", "change_logs", ["entity_type"], unique=False)
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_table(
        "assignments",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.String(length=50), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"]),
        sa.PrimaryKeyConstraint("role_id"),
    )
    op.create_table(
        "steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("flow_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["flow_id"], ["flows.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_steps_flow_id", "steps", ["flow_id"], unique=False)
    op.create_table(
        "step_roles",
        sa.Column("step_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.ForeignKeyConstraint(["step_id"], ["steps.id"]),
        sa.PrimaryKeyConstraint("step_id", "role_id"),
    )
    op.create_table(
        "guide_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("step_id", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("system_name", sa.String(length=100), nullable=False),
        sa.Column("url", sa.String(length=300), nullable=True),
        sa.Column("image_path", sa.String(length=300), nullable=True),
        sa.Column("action_text", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["step_id"], ["steps.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_guide_items_step_id", "guide_items", ["step_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_guide_items_step_id", table_name="guide_items")
    op.drop_table("guide_items")
    op.drop_table("step_roles")
    op.drop_index("ix_steps_flow_id", table_name="steps")
    op.drop_table("steps")
    op.drop_table("assignments")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_change_logs_entity_type", table_name="change_logs")
    op.drop_table("change_logs")
    op.drop_table("flows")
    op.drop_index("ix_roles_code", table_name="roles")
    op.drop_table("roles")
    op.drop_table("persons")
