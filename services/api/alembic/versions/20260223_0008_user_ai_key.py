"""add user ai provider and encrypted key fields

Revision ID: 20260223_0008
Revises: 20260223_0007
Create Date: 2026-02-24 09:10:00

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260223_0008"
down_revision = "20260223_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("user_account")}

    if "ai_provider" not in columns:
        op.add_column("user_account", sa.Column("ai_provider", sa.String(length=32), nullable=True))

    if "ai_api_key_encrypted" not in columns:
        op.add_column("user_account", sa.Column("ai_api_key_encrypted", sa.String(length=4096), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("user_account")}

    if "ai_api_key_encrypted" in columns:
        op.drop_column("user_account", "ai_api_key_encrypted")

    if "ai_provider" in columns:
        op.drop_column("user_account", "ai_provider")
