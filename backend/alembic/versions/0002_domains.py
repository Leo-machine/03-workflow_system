"""add business domains and flow business keys

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "business_domains",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("icon", sa.String(length=50), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_business_domains_code", "business_domains", ["code"], unique=True)
    op.add_column("flows", sa.Column("slug", sa.String(length=100), nullable=True))
    op.add_column("flows", sa.Column("domain_id", sa.Integer(), nullable=True))
    op.add_column(
        "flows",
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_flows_slug", "flows", ["slug"], unique=True)
    op.create_index("ix_flows_domain_id", "flows", ["domain_id"], unique=False)
    op.create_foreign_key(
        "fk_flows_domain_id_business_domains",
        "flows",
        "business_domains",
        ["domain_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_flows_domain_id_business_domains", "flows", type_="foreignkey")
    op.drop_index("ix_flows_domain_id", table_name="flows")
    op.drop_index("ix_flows_slug", table_name="flows")
    op.drop_column("flows", "order_index")
    op.drop_column("flows", "domain_id")
    op.drop_column("flows", "slug")
    op.drop_index("ix_business_domains_code", table_name="business_domains")
    op.drop_table("business_domains")
