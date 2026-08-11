"""guide events and managed users

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(50), nullable=False, server_default=""))
    op.add_column("users", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table(
        "guide_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_key", sa.String(40), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("external_ref", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="in_progress"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("event_key"),
    )
    op.create_index("ix_guide_events_event_key", "guide_events", ["event_key"], unique=True)
    op.create_index("ix_guide_events_user_id", "guide_events", ["user_id"])
    op.add_column("guide_archives", sa.Column("event_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_guide_archives_event_id", "guide_archives", "guide_events", ["event_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_guide_archives_event_id", "guide_archives", ["event_id"])

    # 每条旧流程存档迁成一个独立历史事件，避免升级时丢失位置与完成状态。
    op.execute(sa.text("""
        INSERT INTO guide_events (event_key, user_id, title, status, created_at, updated_at)
        SELECT 'LEGACY-' || ga.id, ga.user_id, f.name || '（历史存档）', ga.status,
               ga.started_at, ga.updated_at
        FROM guide_archives ga JOIN flows f ON f.id = ga.flow_id
    """))
    op.execute(sa.text("""
        UPDATE guide_archives ga SET event_id = ge.id
        FROM guide_events ge WHERE ge.event_key = 'LEGACY-' || ga.id
    """))


def downgrade() -> None:
    op.drop_index("ix_guide_archives_event_id", table_name="guide_archives")
    op.drop_constraint("fk_guide_archives_event_id", "guide_archives", type_="foreignkey")
    op.drop_column("guide_archives", "event_id")
    op.drop_index("ix_guide_events_user_id", table_name="guide_events")
    op.drop_index("ix_guide_events_event_key", table_name="guide_events")
    op.drop_table("guide_events")
    op.drop_column("users", "active")
    op.drop_column("users", "display_name")
