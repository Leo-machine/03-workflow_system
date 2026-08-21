"""guide_items: add operator role

Revision ID: 0010
Revises: 0009
"""
from alembic import op
import sqlalchemy as sa


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 兼容已有流程：原“责任人”语义按“指定人员”保留，不改写任何历史数据。
    op.add_column(
        "guide_items",
        sa.Column(
            "operator_role",
            sa.String(length=30),
            nullable=False,
            server_default="designated_person",
        ),
    )


def downgrade() -> None:
    raise RuntimeError("0010 为保留数据的不可逆迁移；如需删除字段，请另行明确创建迁移")
