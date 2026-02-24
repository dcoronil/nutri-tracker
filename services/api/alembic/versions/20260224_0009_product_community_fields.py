"""add community product fields

Revision ID: 20260224_0009
Revises: 20260223_0008
Create Date: 2026-02-24 11:40:00

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260224_0009"
down_revision = "20260223_0008"
branch_labels = None
depends_on = None


def _index_names(inspector: sa.Inspector, table: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("product")}

    if "created_by_user_id" not in columns:
        op.add_column("product", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_product_created_by_user_id_user_account",
            "product",
            "user_account",
            ["created_by_user_id"],
            ["id"],
        )

    if "is_public" not in columns:
        op.add_column("product", sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.true()))

    if "report_count" not in columns:
        op.add_column("product", sa.Column("report_count", sa.Integer(), nullable=False, server_default="0"))

    index_names = _index_names(inspector, "product")
    if "ix_product_created_by_user_id" not in index_names:
        op.create_index("ix_product_created_by_user_id", "product", ["created_by_user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("product")}
    index_names = _index_names(inspector, "product")

    if "ix_product_created_by_user_id" in index_names:
        op.drop_index("ix_product_created_by_user_id", table_name="product")

    if "report_count" in columns:
        op.drop_column("product", "report_count")

    if "is_public" in columns:
        op.drop_column("product", "is_public")

    if "created_by_user_id" in columns:
        op.drop_constraint("fk_product_created_by_user_id_user_account", "product", type_="foreignkey")
        op.drop_column("product", "created_by_user_id")
