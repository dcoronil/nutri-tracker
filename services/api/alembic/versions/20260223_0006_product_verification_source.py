"""add product source and local verification fields

Revision ID: 20260223_0006
Revises: 20260223_0005
Create Date: 2026-02-23 21:00:00

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260223_0006"
down_revision = "20260223_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("product")}

    if "source" not in columns:
        op.add_column("product", sa.Column("source", sa.String(length=64), nullable=False, server_default="manual"))

    if "is_verified" not in columns:
        op.add_column("product", sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()))

    if "verified_at" not in columns:
        op.add_column("product", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))

    op.execute(sa.text("UPDATE product SET source = COALESCE(source, 'manual')"))
    op.execute(sa.text("UPDATE product SET is_verified = COALESCE(is_verified, FALSE)"))

    # Backfill source and verification from historical confidence tags.
    op.execute(
        sa.text(
            """
            UPDATE product
            SET
                source = CASE
                    WHEN data_confidence LIKE 'openfoodfacts%' THEN 'openfoodfacts'
                    WHEN data_confidence LIKE 'label_photo%' THEN 'local_verified'
                    ELSE source
                END,
                is_verified = CASE
                    WHEN data_confidence LIKE 'label_photo%' THEN TRUE
                    ELSE is_verified
                END,
                verified_at = CASE
                    WHEN data_confidence LIKE 'label_photo%' AND verified_at IS NULL THEN created_at
                    ELSE verified_at
                END
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("product")}

    if "verified_at" in columns:
        op.drop_column("product", "verified_at")

    if "is_verified" in columns:
        op.drop_column("product", "is_verified")

    if "source" in columns:
        op.drop_column("product", "source")
