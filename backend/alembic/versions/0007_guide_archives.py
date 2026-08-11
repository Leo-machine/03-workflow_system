"""add per-user guide archives

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "guide_archives",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("flow_id", sa.Integer(), nullable=False),
        sa.Column("step_id", sa.Integer(), nullable=True),
        sa.Column("guide_item_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="in_progress"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["flow_id"], ["flows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["step_id"], ["steps.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["guide_item_id"], ["guide_items.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_guide_archives_user_id", "guide_archives", ["user_id"])
    op.create_index("ix_guide_archives_flow_id", "guide_archives", ["flow_id"])
    op.create_index("ix_guide_archives_user_flow_updated", "guide_archives", ["user_id", "flow_id", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_guide_archives_user_flow_updated", table_name="guide_archives")
    op.drop_index("ix_guide_archives_flow_id", table_name="guide_archives")
    op.drop_index("ix_guide_archives_user_id", table_name="guide_archives")
    op.drop_table("guide_archives")
