"""initial schema

Revision ID: 20260223_0001
Revises:
Create Date: 2026-02-23 00:00:00

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260223_0001"
down_revision = None
branch_labels = None
depends_on = None


nutrition_basis_enum = postgresql.ENUM(
    "per_100g",
    "per_100ml",
    "per_serving",
    name="nutritionbasis",
    create_type=False,
)
intake_method_enum = postgresql.ENUM(
    "grams",
    "percent_pack",
    "units",
    name="intakemethod",
    create_type=False,
)


def upgrade() -> None:
    nutrition_basis_enum.create(op.get_bind(), checkfirst=True)
    intake_method_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "product",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("barcode", sa.String(length=32), nullable=True),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("brand", sa.String(length=128), nullable=True),
        sa.Column("nutrition_basis", nutrition_basis_enum, nullable=False),
        sa.Column("serving_size_g", sa.Float(), nullable=True),
        sa.Column("net_weight_g", sa.Float(), nullable=True),
        sa.Column("kcal", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=False),
        sa.Column("fat_g", sa.Float(), nullable=False),
        sa.Column("sat_fat_g", sa.Float(), nullable=True),
        sa.Column("carbs_g", sa.Float(), nullable=False),
        sa.Column("sugars_g", sa.Float(), nullable=True),
        sa.Column("fiber_g", sa.Float(), nullable=True),
        sa.Column("salt_g", sa.Float(), nullable=True),
        sa.Column("data_confidence", sa.String(length=64), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("barcode", name="uq_product_barcode"),
    )
    op.create_index("ix_product_barcode", "product", ["barcode"], unique=False)

    op.create_table(
        "intake",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("product.id"), nullable=False),
        sa.Column("quantity_g", sa.Float(), nullable=True),
        sa.Column("quantity_units", sa.Float(), nullable=True),
        sa.Column("percent_pack", sa.Float(), nullable=True),
        sa.Column("method", intake_method_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_intake_created_at", "intake", ["created_at"], unique=False)
    op.create_index("ix_intake_product_id", "intake", ["product_id"], unique=False)

    op.create_table(
        "dailygoal",
        sa.Column("date", sa.Date(), primary_key=True, nullable=False),
        sa.Column("kcal_goal", sa.Float(), nullable=False),
        sa.Column("protein_goal", sa.Float(), nullable=False),
        sa.Column("fat_goal", sa.Float(), nullable=False),
        sa.Column("carbs_goal", sa.Float(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("dailygoal")
    op.drop_index("ix_intake_product_id", table_name="intake")
    op.drop_index("ix_intake_created_at", table_name="intake")
    op.drop_table("intake")
    op.drop_index("ix_product_barcode", table_name="product")
    op.drop_table("product")

    intake_method_enum.drop(op.get_bind(), checkfirst=True)
    nutrition_basis_enum.drop(op.get_bind(), checkfirst=True)
