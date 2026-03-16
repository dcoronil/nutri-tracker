"""add pending_registration table for pre-verification signups

Revision ID: 20260302_0011
Revises: 20260225_0010
Create Date: 2026-03-02 13:45:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260302_0011"
down_revision = "20260225_0010"
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

    if not _has_table(inspector, "pending_registration"):
        op.create_table(
            "pending_registration",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("code_hash", sa.String(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("email", name="uq_pending_registration_email"),
        )
        op.create_index("ix_pending_registration_email", "pending_registration", ["email"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "pending_registration"):
        idx = _index_names(inspector, "pending_registration")
        if "ix_pending_registration_email" in idx:
            op.drop_index("ix_pending_registration_email", table_name="pending_registration")
        op.drop_table("pending_registration")
