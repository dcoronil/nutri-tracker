"""add product image url

Revision ID: 20260223_0004
Revises: 20260223_0003
Create Date: 2026-02-23 13:10:00

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260223_0004"
down_revision = "20260223_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("product")}

    if "image_url" not in columns:
        op.add_column("product", sa.Column("image_url", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("product")}

    if "image_url" in columns:
        op.drop_column("product", "image_url")
