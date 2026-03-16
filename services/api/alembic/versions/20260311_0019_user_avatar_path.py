"""add user avatar path

Revision ID: 20260311_0019
Revises: 20260311_0018
Create Date: 2026-03-11 12:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260311_0019"
down_revision: str | None = "20260311_0018"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_account", sa.Column("avatar_path", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    op.drop_column("user_account", "avatar_path")
