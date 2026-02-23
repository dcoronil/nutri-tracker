"""align auth/onboarding schema with otp/profile requirements

Revision ID: 20260223_0003
Revises: 20260223_0002
Create Date: 2026-02-23 12:30:00

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260223_0003"
down_revision = "20260223_0002"
branch_labels = None
depends_on = None

intake_method_enum = postgresql.ENUM(
    "grams",
    "percent_pack",
    "units",
    name="intakemethod",
    create_type=False,
)


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # user_account: is_verified -> email_verified + onboarding_completed
    if _has_column(inspector, "user_account", "is_verified") and not _has_column(
        inspector, "user_account", "email_verified"
    ):
        op.alter_column("user_account", "is_verified", new_column_name="email_verified")

    inspector = inspect(bind)

    if not _has_column(inspector, "user_account", "email_verified"):
        op.add_column(
            "user_account",
            sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    if not _has_column(inspector, "user_account", "onboarding_completed"):
        op.add_column(
            "user_account",
            sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    op.execute(sa.text("UPDATE user_account SET email_verified = COALESCE(email_verified, FALSE)"))
    op.execute(sa.text("UPDATE user_account SET onboarding_completed = COALESCE(onboarding_completed, FALSE)"))

    # user_profile: optional age + computed metrics
    inspector = inspect(bind)
    if _has_column(inspector, "user_profile", "age"):
        op.alter_column("user_profile", "age", existing_type=sa.Integer(), nullable=True)

    if not _has_column(inspector, "user_profile", "bmi"):
        op.add_column("user_profile", sa.Column("bmi", sa.Float(), nullable=True))

    if not _has_column(inspector, "user_profile", "body_fat_percent"):
        op.add_column("user_profile", sa.Column("body_fat_percent", sa.Float(), nullable=True))

    # replace old verification table with hashed OTP table
    inspector = inspect(bind)
    if _has_table(inspector, "email_verification_code") and not _has_table(inspector, "email_otp"):
        op.create_table(
            "email_otp",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
            sa.Column("code_hash", sa.String(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_email_otp_user_id", "email_otp", ["user_id"], unique=False)

        # Invalidate legacy plain-text codes for security; new codes are generated on resend/register.
        op.drop_index("ix_email_verification_code_user_id", table_name="email_verification_code")
        op.drop_table("email_verification_code")

    inspector = inspect(bind)
    if not _has_table(inspector, "email_otp"):
        op.create_table(
            "email_otp",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
            sa.Column("code_hash", sa.String(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    inspector = inspect(bind)
    if not _has_index(inspector, "email_otp", "ix_email_otp_user_id"):
        op.create_index("ix_email_otp_user_id", "email_otp", ["user_id"], unique=False)

    # per-user preferred serving for products
    inspector = inspect(bind)
    if not _has_table(inspector, "user_product_preference"):
        intake_method_enum.create(bind, checkfirst=True)
        op.create_table(
            "user_product_preference",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("product.id"), nullable=False),
            sa.Column("method", intake_method_enum, nullable=False),
            sa.Column("quantity_g", sa.Float(), nullable=True),
            sa.Column("quantity_units", sa.Float(), nullable=True),
            sa.Column("percent_pack", sa.Float(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "product_id", name="uq_user_product_pref"),
        )
        op.create_index("ix_user_product_preference_user_id", "user_product_preference", ["user_id"], unique=False)
        op.create_index(
            "ix_user_product_preference_product_id",
            "user_product_preference",
            ["product_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _has_table(inspector, "user_product_preference"):
        if _has_index(inspector, "user_product_preference", "ix_user_product_preference_product_id"):
            op.drop_index("ix_user_product_preference_product_id", table_name="user_product_preference")
        if _has_index(inspector, "user_product_preference", "ix_user_product_preference_user_id"):
            op.drop_index("ix_user_product_preference_user_id", table_name="user_product_preference")
        op.drop_table("user_product_preference")

    inspector = inspect(bind)
    if _has_table(inspector, "email_otp"):
        if _has_index(inspector, "email_otp", "ix_email_otp_user_id"):
            op.drop_index("ix_email_otp_user_id", table_name="email_otp")
        op.drop_table("email_otp")

    inspector = inspect(bind)
    if _has_column(inspector, "user_profile", "body_fat_percent"):
        op.drop_column("user_profile", "body_fat_percent")
    if _has_column(inspector, "user_profile", "bmi"):
        op.drop_column("user_profile", "bmi")

    inspector = inspect(bind)
    if _has_column(inspector, "user_account", "onboarding_completed"):
        op.drop_column("user_account", "onboarding_completed")

    inspector = inspect(bind)
    if _has_column(inspector, "user_account", "email_verified") and not _has_column(
        inspector, "user_account", "is_verified"
    ):
        op.alter_column("user_account", "email_verified", new_column_name="is_verified")
