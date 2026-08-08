"""guide_items: unit_id + guide_item_persons（责任归指引条目）

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "guide_items",
        sa.Column("unit_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_guide_items_unit_id_units",
        "guide_items",
        "units",
        ["unit_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_guide_items_unit_id", "guide_items", ["unit_id"])

    op.create_table(
        "guide_item_persons",
        sa.Column("guide_item_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["guide_item_id"], ["guide_items.id"]),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"]),
        sa.PrimaryKeyConstraint("guide_item_id", "person_id"),
    )


def downgrade() -> None:
    op.drop_table("guide_item_persons")
    op.drop_index("ix_guide_items_unit_id", table_name="guide_items")
    op.drop_constraint("fk_guide_items_unit_id_units", "guide_items", type_="foreignkey")
    op.drop_column("guide_items", "unit_id")
