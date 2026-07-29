"""person_domains: 人员↔可服务业务域多对多

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "person_domains",
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("domain_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["domain_id"], ["business_domains.id"]),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"]),
        sa.PrimaryKeyConstraint("person_id", "domain_id"),
    )


def downgrade() -> None:
    op.drop_table("person_domains")
