"""add intake estimate/source fields

Revision ID: 20260223_0007
Revises: 20260223_0006
Create Date: 2026-02-23 21:20:00

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260223_0007"
down_revision = "20260223_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("intake")}

    if "estimated" not in columns:
        op.add_column("intake", sa.Column("estimated", sa.Boolean(), nullable=False, server_default=sa.false()))

    if "estimate_confidence" not in columns:
        op.add_column("intake", sa.Column("estimate_confidence", sa.String(length=16), nullable=True))

    if "user_description" not in columns:
        op.add_column("intake", sa.Column("user_description", sa.String(length=1024), nullable=True))

    if "source_method" not in columns:
        op.add_column(
            "intake",
            sa.Column("source_method", sa.String(length=32), nullable=False, server_default="barcode"),
        )

    op.execute(sa.text("UPDATE intake SET estimated = COALESCE(estimated, FALSE)"))
    op.execute(sa.text("UPDATE intake SET source_method = COALESCE(source_method, 'barcode')"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("intake")}

    if "source_method" in columns:
        op.drop_column("intake", "source_method")

    if "user_description" in columns:
        op.drop_column("intake", "user_description")

    if "estimate_confidence" in columns:
        op.drop_column("intake", "estimate_confidence")

    if "estimated" in columns:
        op.drop_column("intake", "estimated")
