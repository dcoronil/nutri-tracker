"""add friendships social feature

Revision ID: 20260311_0017
Revises: 20260305_0016
Create Date: 2026-03-11 10:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_0017"
down_revision = "20260305_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "friendship",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requester_user_id", sa.Integer(), nullable=False),
        sa.Column("addressee_user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["addressee_user_id"], ["user_account.id"]),
        sa.ForeignKeyConstraint(["requester_user_id"], ["user_account.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("requester_user_id", "addressee_user_id", name="uq_friendship_request_pair"),
    )
    op.create_index("ix_friendship_requester_user_id", "friendship", ["requester_user_id"], unique=False)
    op.create_index("ix_friendship_addressee_user_id", "friendship", ["addressee_user_id"], unique=False)
    op.create_index("ix_friendship_created_at", "friendship", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_friendship_created_at", table_name="friendship")
    op.drop_index("ix_friendship_addressee_user_id", table_name="friendship")
    op.drop_index("ix_friendship_requester_user_id", table_name="friendship")
    op.drop_table("friendship")
