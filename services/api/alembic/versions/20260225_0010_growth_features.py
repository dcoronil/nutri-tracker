"""add growth features tables and moderation fields

Revision ID: 20260225_0010
Revises: 20260224_0009
Create Date: 2026-02-25 11:50:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260225_0010"
down_revision = "20260224_0009"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not _has_table(inspector, table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _foreign_key_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not _has_table(inspector, table_name):
        return set()
    return {fk["name"] for fk in inspector.get_foreign_keys(table_name) if fk.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "user_profile") and not _has_column(inspector, "user_profile", "weekly_weight_goal_kg"):
        op.add_column("user_profile", sa.Column("weekly_weight_goal_kg", sa.Float(), nullable=True))

    if _has_table(inspector, "product") and not _has_column(inspector, "product", "status"):
        op.add_column("product", sa.Column("status", sa.String(length=32), nullable=False, server_default="approved"))
    if _has_table(inspector, "product") and not _has_column(inspector, "product", "is_hidden"):
        op.add_column("product", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))
    if _has_table(inspector, "product") and not _has_column(inspector, "product", "canonical_product_id"):
        op.add_column("product", sa.Column("canonical_product_id", sa.Integer(), nullable=True))

    inspector = sa.inspect(bind)
    fk_names = _foreign_key_names(inspector, "product")
    if _has_table(inspector, "product") and "fk_product_canonical_product_id_product" not in fk_names:
        op.create_foreign_key(
            "fk_product_canonical_product_id_product",
            "product",
            "product",
            ["canonical_product_id"],
            ["id"],
        )

    index_names = _index_names(inspector, "product")
    if _has_table(inspector, "product") and "ix_product_canonical_product_id" not in index_names:
        op.create_index("ix_product_canonical_product_id", "product", ["canonical_product_id"], unique=False)

    if not _has_table(inspector, "water_intake_log"):
        op.create_table(
            "water_intake_log",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
            sa.Column("ml", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_water_intake_log_user_id", "water_intake_log", ["user_id"], unique=False)
        op.create_index("ix_water_intake_log_created_at", "water_intake_log", ["created_at"], unique=False)

    if not _has_table(inspector, "user_favorite_product"):
        op.create_table(
            "user_favorite_product",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("product.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "product_id", name="uq_user_favorite_product"),
        )
        op.create_index("ix_user_favorite_product_user_id", "user_favorite_product", ["user_id"], unique=False)
        op.create_index("ix_user_favorite_product_product_id", "user_favorite_product", ["product_id"], unique=False)
        op.create_index("ix_user_favorite_product_created_at", "user_favorite_product", ["created_at"], unique=False)

    if not _has_table(inspector, "body_progress_photo"):
        op.create_table(
            "body_progress_photo",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
            sa.Column("image_url", sa.String(length=1024), nullable=False),
            sa.Column("note", sa.String(length=280), nullable=True),
            sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_body_progress_photo_user_id", "body_progress_photo", ["user_id"], unique=False)
        op.create_index("ix_body_progress_photo_created_at", "body_progress_photo", ["created_at"], unique=False)

    op.execute(sa.text("UPDATE product SET status = COALESCE(status, 'approved')"))
    op.execute(sa.text("UPDATE product SET is_hidden = COALESCE(is_hidden, FALSE)"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "body_progress_photo"):
        idx = _index_names(inspector, "body_progress_photo")
        if "ix_body_progress_photo_created_at" in idx:
            op.drop_index("ix_body_progress_photo_created_at", table_name="body_progress_photo")
        if "ix_body_progress_photo_user_id" in idx:
            op.drop_index("ix_body_progress_photo_user_id", table_name="body_progress_photo")
        op.drop_table("body_progress_photo")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "user_favorite_product"):
        idx = _index_names(inspector, "user_favorite_product")
        if "ix_user_favorite_product_created_at" in idx:
            op.drop_index("ix_user_favorite_product_created_at", table_name="user_favorite_product")
        if "ix_user_favorite_product_product_id" in idx:
            op.drop_index("ix_user_favorite_product_product_id", table_name="user_favorite_product")
        if "ix_user_favorite_product_user_id" in idx:
            op.drop_index("ix_user_favorite_product_user_id", table_name="user_favorite_product")
        op.drop_table("user_favorite_product")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "water_intake_log"):
        idx = _index_names(inspector, "water_intake_log")
        if "ix_water_intake_log_created_at" in idx:
            op.drop_index("ix_water_intake_log_created_at", table_name="water_intake_log")
        if "ix_water_intake_log_user_id" in idx:
            op.drop_index("ix_water_intake_log_user_id", table_name="water_intake_log")
        op.drop_table("water_intake_log")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "product"):
        idx = _index_names(inspector, "product")
        fks = _foreign_key_names(inspector, "product")
        if "ix_product_canonical_product_id" in idx:
            op.drop_index("ix_product_canonical_product_id", table_name="product")
        if "fk_product_canonical_product_id_product" in fks:
            op.drop_constraint("fk_product_canonical_product_id_product", "product", type_="foreignkey")
        if _has_column(inspector, "product", "canonical_product_id"):
            op.drop_column("product", "canonical_product_id")
        if _has_column(inspector, "product", "is_hidden"):
            op.drop_column("product", "is_hidden")
        if _has_column(inspector, "product", "status"):
            op.drop_column("product", "status")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "user_profile") and _has_column(inspector, "user_profile", "weekly_weight_goal_kg"):
        op.drop_column("user_profile", "weekly_weight_goal_kg")
