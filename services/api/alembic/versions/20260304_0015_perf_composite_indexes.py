"""add composite indexes for user+date heavy reads

Revision ID: 20260304_0015
Revises: 20260303_0014
Create Date: 2026-03-04 19:05:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260304_0015"
down_revision = "20260303_0014"
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

    intake_indexes = _index_names(inspector, "intake")
    if "ix_intake_user_created_at" not in intake_indexes:
        op.create_index("ix_intake_user_created_at", "intake", ["user_id", "created_at"], unique=False)

    weight_indexes = _index_names(inspector, "body_weight_log")
    if "ix_body_weight_log_user_created_at" not in weight_indexes:
        op.create_index(
            "ix_body_weight_log_user_created_at",
            "body_weight_log",
            ["user_id", "created_at"],
            unique=False,
        )

    measurement_indexes = _index_names(inspector, "body_measurement_log")
    if "ix_body_measurement_log_user_created_at" not in measurement_indexes:
        op.create_index(
            "ix_body_measurement_log_user_created_at",
            "body_measurement_log",
            ["user_id", "created_at"],
            unique=False,
        )

    water_indexes = _index_names(inspector, "water_intake_log")
    if "ix_water_intake_log_user_created_at" not in water_indexes:
        op.create_index(
            "ix_water_intake_log_user_created_at",
            "water_intake_log",
            ["user_id", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    intake_indexes = _index_names(inspector, "intake")
    if "ix_intake_user_created_at" in intake_indexes:
        op.drop_index("ix_intake_user_created_at", table_name="intake")

    weight_indexes = _index_names(inspector, "body_weight_log")
    if "ix_body_weight_log_user_created_at" in weight_indexes:
        op.drop_index("ix_body_weight_log_user_created_at", table_name="body_weight_log")

    measurement_indexes = _index_names(inspector, "body_measurement_log")
    if "ix_body_measurement_log_user_created_at" in measurement_indexes:
        op.drop_index("ix_body_measurement_log_user_created_at", table_name="body_measurement_log")

    water_indexes = _index_names(inspector, "water_intake_log")
    if "ix_water_intake_log_user_created_at" in water_indexes:
        op.drop_index("ix_water_intake_log_user_created_at", table_name="water_intake_log")
