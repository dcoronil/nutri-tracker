"""expand social schema with posts, requests and friendships

Revision ID: 20260311_0018
Revises: 20260311_0017
Create Date: 2026-03-11 12:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260311_0018"
down_revision = "20260311_0017"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not _has_table(inspector, table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not _has_table(inspector, table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _create_friend_request_table(inspector: sa.Inspector) -> None:
    if _has_table(inspector, "friend_request"):
        return
    op.create_table(
        "friend_request",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("from_user_id", sa.Integer(), nullable=False),
        sa.Column("to_user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["from_user_id"], ["user_account.id"]),
        sa.ForeignKeyConstraint(["to_user_id"], ["user_account.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("from_user_id", "to_user_id", name="uq_friend_request_pair"),
    )


def _create_friendship_table(inspector: sa.Inspector) -> None:
    if _has_table(inspector, "friendship"):
        return
    op.create_table(
        "friendship",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("friend_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["friend_id"], ["user_account.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user_account.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "friend_id", name="uq_friendship_pair"),
    )


def _create_social_tables(inspector: sa.Inspector) -> None:
    if not _has_table(inspector, "social_post"):
        op.create_table(
            "social_post",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("type", sa.String(length=16), nullable=False),
            sa.Column("caption", sa.String(length=2800), nullable=True),
            sa.Column("visibility", sa.String(length=16), nullable=False, server_default="friends"),
            sa.Column("like_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("comment_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user_account.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _has_table(inspector, "social_post_media"):
        op.create_table(
            "social_post_media",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("post_id", sa.String(length=64), nullable=False),
            sa.Column("media_url", sa.String(length=1024), nullable=False),
            sa.Column("width", sa.Integer(), nullable=True),
            sa.Column("height", sa.Integer(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["post_id"], ["social_post.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("post_id", "order_index", name="uq_social_post_media_order"),
        )
    if not _has_table(inspector, "social_recipe"):
        op.create_table(
            "social_recipe",
            sa.Column("post_id", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=140), nullable=False),
            sa.Column("servings", sa.Integer(), nullable=True),
            sa.Column("prep_time_min", sa.Integer(), nullable=True),
            sa.Column("ingredients_json", sa.JSON(), nullable=False),
            sa.Column("steps_json", sa.JSON(), nullable=False),
            sa.Column("nutrition_kcal", sa.Float(), nullable=True),
            sa.Column("nutrition_protein_g", sa.Float(), nullable=True),
            sa.Column("nutrition_carbs_g", sa.Float(), nullable=True),
            sa.Column("nutrition_fat_g", sa.Float(), nullable=True),
            sa.Column("tags_json", sa.JSON(), nullable=False),
            sa.ForeignKeyConstraint(["post_id"], ["social_post.id"]),
            sa.PrimaryKeyConstraint("post_id"),
        )
    if not _has_table(inspector, "social_progress"):
        op.create_table(
            "social_progress",
            sa.Column("post_id", sa.String(length=64), nullable=False),
            sa.Column("weight_kg", sa.Float(), nullable=True),
            sa.Column("body_fat_pct", sa.Float(), nullable=True),
            sa.Column("bmi", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(length=1024), nullable=True),
            sa.Column("before_after_pair_json", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["post_id"], ["social_post.id"]),
            sa.PrimaryKeyConstraint("post_id"),
        )
    if not _has_table(inspector, "social_like"):
        op.create_table(
            "social_like",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("post_id", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["post_id"], ["social_post.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user_account.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "post_id", name="uq_social_like_user_post"),
        )
    if not _has_table(inspector, "social_comment"):
        op.create_table(
            "social_comment",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("post_id", sa.String(length=64), nullable=False),
            sa.Column("text", sa.String(length=1000), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["post_id"], ["social_post.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user_account.id"]),
            sa.PrimaryKeyConstraint("id"),
        )


def _create_indexes(inspector: sa.Inspector) -> None:
    friend_request_indexes = _index_names(inspector, "friend_request")
    if "ix_friend_request_from_user_id" not in friend_request_indexes:
        op.create_index("ix_friend_request_from_user_id", "friend_request", ["from_user_id"], unique=False)
    if "ix_friend_request_to_user_id" not in friend_request_indexes:
        op.create_index("ix_friend_request_to_user_id", "friend_request", ["to_user_id"], unique=False)
    if "ix_friend_request_created_at" not in friend_request_indexes:
        op.create_index("ix_friend_request_created_at", "friend_request", ["created_at"], unique=False)

    friendship_indexes = _index_names(inspector, "friendship")
    if "ix_friendship_user_id" not in friendship_indexes:
        op.create_index("ix_friendship_user_id", "friendship", ["user_id"], unique=False)
    if "ix_friendship_friend_id" not in friendship_indexes:
        op.create_index("ix_friendship_friend_id", "friendship", ["friend_id"], unique=False)
    if "ix_friendship_created_at" not in friendship_indexes:
        op.create_index("ix_friendship_created_at", "friendship", ["created_at"], unique=False)

    social_post_indexes = _index_names(inspector, "social_post")
    if "ix_social_post_user_id" not in social_post_indexes:
        op.create_index("ix_social_post_user_id", "social_post", ["user_id"], unique=False)
    if "ix_social_post_created_at" not in social_post_indexes:
        op.create_index("ix_social_post_created_at", "social_post", ["created_at"], unique=False)
    if "ix_social_post_updated_at" not in social_post_indexes:
        op.create_index("ix_social_post_updated_at", "social_post", ["updated_at"], unique=False)

    media_indexes = _index_names(inspector, "social_post_media")
    if "ix_social_post_media_post_id" not in media_indexes:
        op.create_index("ix_social_post_media_post_id", "social_post_media", ["post_id"], unique=False)
    if "ix_social_post_media_created_at" not in media_indexes:
        op.create_index("ix_social_post_media_created_at", "social_post_media", ["created_at"], unique=False)

    like_indexes = _index_names(inspector, "social_like")
    if "ix_social_like_user_id" not in like_indexes:
        op.create_index("ix_social_like_user_id", "social_like", ["user_id"], unique=False)
    if "ix_social_like_post_id" not in like_indexes:
        op.create_index("ix_social_like_post_id", "social_like", ["post_id"], unique=False)
    if "ix_social_like_created_at" not in like_indexes:
        op.create_index("ix_social_like_created_at", "social_like", ["created_at"], unique=False)

    comment_indexes = _index_names(inspector, "social_comment")
    if "ix_social_comment_user_id" not in comment_indexes:
        op.create_index("ix_social_comment_user_id", "social_comment", ["user_id"], unique=False)
    if "ix_social_comment_post_id" not in comment_indexes:
        op.create_index("ix_social_comment_post_id", "social_comment", ["post_id"], unique=False)
    if "ix_social_comment_created_at" not in comment_indexes:
        op.create_index("ix_social_comment_created_at", "social_comment", ["created_at"], unique=False)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "friendship") and {"requester_user_id", "addressee_user_id", "status"} <= _column_names(inspector, "friendship"):
        _create_friend_request_table(inspector)
        op.execute(
            sa.text(
                """
                INSERT INTO friend_request (from_user_id, to_user_id, status, created_at, responded_at)
                SELECT requester_user_id, addressee_user_id, status, created_at, responded_at
                FROM friendship
                """
            )
        )
        op.drop_table("friendship")
        inspector = sa.inspect(bind)

    _create_friend_request_table(inspector)
    inspector = sa.inspect(bind)
    _create_friendship_table(inspector)
    inspector = sa.inspect(bind)

    op.execute(
        sa.text(
            """
            INSERT INTO friendship (user_id, friend_id, created_at)
            SELECT fr.from_user_id, fr.to_user_id, COALESCE(fr.responded_at, fr.created_at)
            FROM friend_request fr
            WHERE fr.status = 'accepted'
              AND NOT EXISTS (
                SELECT 1 FROM friendship f
                WHERE f.user_id = fr.from_user_id AND f.friend_id = fr.to_user_id
              )
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO friendship (user_id, friend_id, created_at)
            SELECT fr.to_user_id, fr.from_user_id, COALESCE(fr.responded_at, fr.created_at)
            FROM friend_request fr
            WHERE fr.status = 'accepted'
              AND NOT EXISTS (
                SELECT 1 FROM friendship f
                WHERE f.user_id = fr.to_user_id AND f.friend_id = fr.from_user_id
              )
            """
        )
    )

    inspector = sa.inspect(bind)
    _create_social_tables(inspector)
    inspector = sa.inspect(bind)
    _create_indexes(inspector)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for index_name, table_name in [
        ("ix_social_comment_created_at", "social_comment"),
        ("ix_social_comment_post_id", "social_comment"),
        ("ix_social_comment_user_id", "social_comment"),
        ("ix_social_like_created_at", "social_like"),
        ("ix_social_like_post_id", "social_like"),
        ("ix_social_like_user_id", "social_like"),
        ("ix_social_post_media_created_at", "social_post_media"),
        ("ix_social_post_media_post_id", "social_post_media"),
        ("ix_social_post_updated_at", "social_post"),
        ("ix_social_post_created_at", "social_post"),
        ("ix_social_post_user_id", "social_post"),
        ("ix_friendship_created_at", "friendship"),
        ("ix_friendship_friend_id", "friendship"),
        ("ix_friendship_user_id", "friendship"),
        ("ix_friend_request_created_at", "friend_request"),
        ("ix_friend_request_to_user_id", "friend_request"),
        ("ix_friend_request_from_user_id", "friend_request"),
    ]:
        if index_name in _index_names(inspector, table_name):
            op.drop_index(index_name, table_name=table_name)
            inspector = sa.inspect(bind)

    for table_name in ["social_comment", "social_like", "social_progress", "social_recipe", "social_post_media", "social_post", "friendship", "friend_request"]:
        if _has_table(inspector, table_name):
            op.drop_table(table_name)
            inspector = sa.inspect(bind)
