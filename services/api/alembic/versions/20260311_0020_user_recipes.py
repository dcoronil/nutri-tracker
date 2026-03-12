"""add user recipes

Revision ID: 20260311_0020
Revises: 20260311_0019
Create Date: 2026-03-11 20:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260311_0020"
down_revision: str | None = "20260311_0019"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_recipe",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=140), nullable=False),
        sa.Column("meal_type", sa.String(length=24), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False),
        sa.Column("prep_time_min", sa.Integer(), nullable=True),
        sa.Column("ingredients_json", sa.JSON(), nullable=False),
        sa.Column("steps_json", sa.JSON(), nullable=False),
        sa.Column("tags_json", sa.JSON(), nullable=False),
        sa.Column("coach_feedback", sa.String(length=4000), nullable=True),
        sa.Column("assumptions_json", sa.JSON(), nullable=False),
        sa.Column("suggested_extras_json", sa.JSON(), nullable=False),
        sa.Column("generated_with_ai", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user_account.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", name="uq_user_recipe_product"),
        sa.UniqueConstraint("user_id", "title", name="uq_user_recipe_user_title"),
    )
    op.create_index(op.f("ix_user_recipe_user_id"), "user_recipe", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_recipe_product_id"), "user_recipe", ["product_id"], unique=False)
    op.create_index(op.f("ix_user_recipe_created_at"), "user_recipe", ["created_at"], unique=False)
    op.create_index(op.f("ix_user_recipe_updated_at"), "user_recipe", ["updated_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_recipe_updated_at"), table_name="user_recipe")
    op.drop_index(op.f("ix_user_recipe_created_at"), table_name="user_recipe")
    op.drop_index(op.f("ix_user_recipe_product_id"), table_name="user_recipe")
    op.drop_index(op.f("ix_user_recipe_user_id"), table_name="user_recipe")
    op.drop_table("user_recipe")
