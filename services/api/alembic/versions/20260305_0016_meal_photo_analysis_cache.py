"""add meal photo analysis cache table

Revision ID: 20260305_0016
Revises: 20260304_0015
Create Date: 2026-03-05 11:20:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260305_0016"
down_revision = "20260304_0015"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not _has_table(inspector, table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "meal_photo_analysis"):
        op.create_table(
            "meal_photo_analysis",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("image_meta_json", sa.String(length=8192), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user_account.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    indexes = _index_names(inspector, "meal_photo_analysis")
    if "ix_meal_photo_analysis_user_id" not in indexes:
        op.create_index("ix_meal_photo_analysis_user_id", "meal_photo_analysis", ["user_id"], unique=False)
    if "ix_meal_photo_analysis_expires_at" not in indexes:
        op.create_index("ix_meal_photo_analysis_expires_at", "meal_photo_analysis", ["expires_at"], unique=False)
    if "ix_meal_photo_analysis_created_at" not in indexes:
        op.create_index("ix_meal_photo_analysis_created_at", "meal_photo_analysis", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    indexes = _index_names(inspector, "meal_photo_analysis")
    if "ix_meal_photo_analysis_created_at" in indexes:
        op.drop_index("ix_meal_photo_analysis_created_at", table_name="meal_photo_analysis")
    if "ix_meal_photo_analysis_expires_at" in indexes:
        op.drop_index("ix_meal_photo_analysis_expires_at", table_name="meal_photo_analysis")
    if "ix_meal_photo_analysis_user_id" in indexes:
        op.drop_index("ix_meal_photo_analysis_user_id", table_name="meal_photo_analysis")

    if _has_table(inspector, "meal_photo_analysis"):
        op.drop_table("meal_photo_analysis")
