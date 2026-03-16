"""add body tracking logs

Revision ID: 20260223_0005
Revises: 20260223_0004
Create Date: 2026-02-23 15:10:00

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260223_0005"
down_revision = "20260223_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    table_names = set(inspector.get_table_names())

    if "body_weight_log" not in table_names:
        op.create_table(
            "body_weight_log",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
            sa.Column("weight_kg", sa.Float(), nullable=False),
            sa.Column("note", sa.String(length=280), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_body_weight_log_user_id", "body_weight_log", ["user_id"], unique=False)
        op.create_index("ix_body_weight_log_created_at", "body_weight_log", ["created_at"], unique=False)

    if "body_measurement_log" not in table_names:
        op.create_table(
            "body_measurement_log",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
            sa.Column("waist_cm", sa.Float(), nullable=True),
            sa.Column("neck_cm", sa.Float(), nullable=True),
            sa.Column("hip_cm", sa.Float(), nullable=True),
            sa.Column("chest_cm", sa.Float(), nullable=True),
            sa.Column("arm_cm", sa.Float(), nullable=True),
            sa.Column("thigh_cm", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            "ix_body_measurement_log_user_id",
            "body_measurement_log",
            ["user_id"],
            unique=False,
        )
        op.create_index(
            "ix_body_measurement_log_created_at",
            "body_measurement_log",
            ["created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    table_names = set(inspector.get_table_names())

    if "body_measurement_log" in table_names:
        op.drop_index("ix_body_measurement_log_created_at", table_name="body_measurement_log")
        op.drop_index("ix_body_measurement_log_user_id", table_name="body_measurement_log")
        op.drop_table("body_measurement_log")

    if "body_weight_log" in table_names:
        op.drop_index("ix_body_weight_log_created_at", table_name="body_weight_log")
        op.drop_index("ix_body_weight_log_user_id", table_name="body_weight_log")
        op.drop_table("body_weight_log")
