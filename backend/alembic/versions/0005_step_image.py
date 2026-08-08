"""steps.image_path：每个操作环节可挂一张操作图示

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("steps", sa.Column("image_path", sa.String(length=300), nullable=True))


def downgrade() -> None:
    op.drop_column("steps", "image_path")
