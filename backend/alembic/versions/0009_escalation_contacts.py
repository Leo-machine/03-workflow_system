"""units.leader_person_id + guide_items.escalation_person_id

Revision ID: 0009
Revises: 0008
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("units", sa.Column("leader_person_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_units_leader_person_id_persons",
        "units",
        "persons",
        ["leader_person_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_units_leader_person_id", "units", ["leader_person_id"])

    op.add_column("guide_items", sa.Column("escalation_person_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_guide_items_escalation_person_id_persons",
        "guide_items",
        "persons",
        ["escalation_person_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_guide_items_escalation_person_id", "guide_items", ["escalation_person_id"])


def downgrade() -> None:
    op.drop_index("ix_guide_items_escalation_person_id", table_name="guide_items")
    op.drop_constraint("fk_guide_items_escalation_person_id_persons", "guide_items", type_="foreignkey")
    op.drop_column("guide_items", "escalation_person_id")
    op.drop_index("ix_units_leader_person_id", table_name="units")
    op.drop_constraint("fk_units_leader_person_id_persons", "units", type_="foreignkey")
    op.drop_column("units", "leader_person_id")
