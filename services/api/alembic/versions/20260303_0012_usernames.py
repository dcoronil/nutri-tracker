"""add username fields for user and pending registration

Revision ID: 20260303_0012
Revises: 20260302_0011
Create Date: 2026-03-03 12:10:00.000000
"""

from __future__ import annotations

import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260303_0012"
down_revision = "20260302_0011"
branch_labels = None
depends_on = None


USERNAME_MAX = 32
USERNAME_PATTERN = re.compile(r"^[a-z0-9._]{3,32}$")


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


def _unique_constraint_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not _has_table(inspector, table_name):
        return set()
    return {constraint["name"] for constraint in inspector.get_unique_constraints(table_name)}


def _normalize_username(raw: str | None) -> str:
    if not raw:
        return ""
    normalized = raw.strip().lower()
    if USERNAME_PATTERN.fullmatch(normalized):
        return normalized
    return ""


def _base_from_email(email: str | None) -> str:
    local = (email or "user").split("@")[0].strip().lower()
    local = re.sub(r"[^a-z0-9._]", "", local)
    if not local:
        local = "user"
    if len(local) < 3:
        local = f"{local}user"
    return local[:USERNAME_MAX]


def _dedupe_username(base: str, used: set[str]) -> str:
    candidate = base
    index = 1
    while candidate in used:
        suffix = f"_{index}"
        candidate = f"{base[: max(1, USERNAME_MAX - len(suffix))]}{suffix}"
        index += 1
    return candidate


def _backfill_usernames(bind: sa.Connection, table_name: str, used_seed: set[str] | None = None) -> set[str]:
    used = set(used_seed or set())
    rows = bind.execute(
        sa.text(f"SELECT id, email, username FROM {table_name} ORDER BY id")
    ).mappings()

    for row in rows:
        existing = _normalize_username(row.get("username"))
        base = existing or _base_from_email(row.get("email"))
        candidate = _dedupe_username(base, used)
        used.add(candidate)
        bind.execute(
            sa.text(f"UPDATE {table_name} SET username = :username WHERE id = :row_id"),
            {"username": candidate, "row_id": row["id"]},
        )

    return used


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "user_account") and not _has_column(inspector, "user_account", "username"):
        op.add_column("user_account", sa.Column("username", sa.String(length=32), nullable=True))

    if _has_table(inspector, "pending_registration") and not _has_column(inspector, "pending_registration", "username"):
        op.add_column("pending_registration", sa.Column("username", sa.String(length=32), nullable=True))

    # Refresh inspector after schema changes.
    inspector = sa.inspect(bind)

    used_usernames: set[str] = set()
    if _has_table(inspector, "user_account") and _has_column(inspector, "user_account", "username"):
        used_usernames = _backfill_usernames(bind, "user_account")
        op.alter_column("user_account", "username", existing_type=sa.String(length=32), nullable=False)

    if _has_table(inspector, "pending_registration") and _has_column(inspector, "pending_registration", "username"):
        _backfill_usernames(bind, "pending_registration", used_seed=used_usernames)
        op.alter_column("pending_registration", "username", existing_type=sa.String(length=32), nullable=False)

    inspector = sa.inspect(bind)

    user_idx = _index_names(inspector, "user_account")
    if "ix_user_account_username" not in user_idx:
        op.create_index("ix_user_account_username", "user_account", ["username"], unique=False)

    pending_idx = _index_names(inspector, "pending_registration")
    if "ix_pending_registration_username" not in pending_idx:
        op.create_index("ix_pending_registration_username", "pending_registration", ["username"], unique=False)

    user_uniques = _unique_constraint_names(inspector, "user_account")
    if "uq_user_account_username" not in user_uniques:
        op.create_unique_constraint("uq_user_account_username", "user_account", ["username"])

    pending_uniques = _unique_constraint_names(inspector, "pending_registration")
    if "uq_pending_registration_username" not in pending_uniques:
        op.create_unique_constraint("uq_pending_registration_username", "pending_registration", ["username"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    pending_uniques = _unique_constraint_names(inspector, "pending_registration")
    if "uq_pending_registration_username" in pending_uniques:
        op.drop_constraint("uq_pending_registration_username", "pending_registration", type_="unique")

    user_uniques = _unique_constraint_names(inspector, "user_account")
    if "uq_user_account_username" in user_uniques:
        op.drop_constraint("uq_user_account_username", "user_account", type_="unique")

    pending_idx = _index_names(inspector, "pending_registration")
    if "ix_pending_registration_username" in pending_idx:
        op.drop_index("ix_pending_registration_username", table_name="pending_registration")

    user_idx = _index_names(inspector, "user_account")
    if "ix_user_account_username" in user_idx:
        op.drop_index("ix_user_account_username", table_name="user_account")

    if _has_column(inspector, "pending_registration", "username"):
        op.drop_column("pending_registration", "username")

    if _has_column(inspector, "user_account", "username"):
        op.drop_column("user_account", "username")
