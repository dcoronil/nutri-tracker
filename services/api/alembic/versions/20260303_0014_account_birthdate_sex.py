"""add birth date and sex to account and pending registration

Revision ID: 20260303_0014
Revises: 20260303_0013
Create Date: 2026-03-03 21:05:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260303_0014"
down_revision = "20260303_0013"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _sex_column() -> sa.Column:
    bind = op.get_bind()
    if bind and bind.dialect.name == "postgresql":
        return sa.Column(
            "sex",
            sa.Enum("male", "female", "other", name="sex", create_type=False),
            nullable=False,
            server_default="other",
        )
    return sa.Column("sex", sa.String(length=16), nullable=False, server_default="other")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "user_account"):
        if not _has_column(inspector, "user_account", "sex"):
            op.add_column("user_account", _sex_column())
        if not _has_column(inspector, "user_account", "birth_date"):
            op.add_column("user_account", sa.Column("birth_date", sa.Date(), nullable=True))

    if _has_table(inspector, "pending_registration"):
        if not _has_column(inspector, "pending_registration", "sex"):
            op.add_column("pending_registration", _sex_column())
        if not _has_column(inspector, "pending_registration", "birth_date"):
            op.add_column("pending_registration", sa.Column("birth_date", sa.Date(), nullable=True))

    inspector = sa.inspect(bind)
    if _has_column(inspector, "user_account", "sex"):
        op.execute("UPDATE user_account SET sex = 'other' WHERE sex IS NULL")
        op.alter_column("user_account", "sex", server_default=None)
    if _has_column(inspector, "pending_registration", "sex"):
        op.execute("UPDATE pending_registration SET sex = 'other' WHERE sex IS NULL")
        op.alter_column("pending_registration", "sex", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_column(inspector, "pending_registration", "birth_date"):
        op.drop_column("pending_registration", "birth_date")
    if _has_column(inspector, "pending_registration", "sex"):
        op.drop_column("pending_registration", "sex")

    if _has_column(inspector, "user_account", "birth_date"):
        op.drop_column("user_account", "birth_date")
    if _has_column(inspector, "user_account", "sex"):
        op.drop_column("user_account", "sex")
