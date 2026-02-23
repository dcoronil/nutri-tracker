"""add auth profile and per-user goals/intakes

Revision ID: 20260223_0002
Revises: 20260223_0001
Create Date: 2026-02-23 00:30:00

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260223_0002"
down_revision = "20260223_0001"
branch_labels = None
depends_on = None

sex_enum = postgresql.ENUM("male", "female", "other", name="sex", create_type=False)
activity_level_enum = postgresql.ENUM(
    "sedentary",
    "light",
    "moderate",
    "active",
    "athlete",
    name="activitylevel",
    create_type=False,
)
goal_type_enum = postgresql.ENUM("lose", "maintain", "gain", name="goaltype", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()

    sex_enum.create(bind, checkfirst=True)
    activity_level_enum.create(bind, checkfirst=True)
    goal_type_enum.create(bind, checkfirst=True)

    op.create_table(
        "user_account",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email", name="uq_user_account_email"),
    )
    op.create_index("ix_user_account_email", "user_account", ["email"], unique=False)

    op.create_table(
        "user_profile",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), primary_key=True),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("age", sa.Integer(), nullable=False),
        sa.Column("sex", sex_enum, nullable=False),
        sa.Column("activity_level", activity_level_enum, nullable=False),
        sa.Column("goal_type", goal_type_enum, nullable=False),
        sa.Column("waist_cm", sa.Float(), nullable=True),
        sa.Column("neck_cm", sa.Float(), nullable=True),
        sa.Column("hip_cm", sa.Float(), nullable=True),
        sa.Column("chest_cm", sa.Float(), nullable=True),
        sa.Column("arm_cm", sa.Float(), nullable=True),
        sa.Column("thigh_cm", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "email_verification_code",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("code", sa.String(length=12), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_email_verification_code_user_id",
        "email_verification_code",
        ["user_id"],
        unique=False,
    )

    # Bootstrap user to preserve existing data.
    op.execute(
        sa.text(
            """
            INSERT INTO user_account (id, email, password_hash, is_verified, created_at)
            VALUES (1, 'legacy@nutri.local', 'legacy', TRUE, NOW())
            ON CONFLICT (id) DO NOTHING
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO user_profile (
                user_id, weight_kg, height_cm, age, sex, activity_level, goal_type,
                waist_cm, neck_cm, hip_cm, chest_cm, arm_cm, thigh_cm, updated_at
            )
            VALUES (
                1, 75, 175, 30, 'other', 'moderate', 'maintain',
                NULL, NULL, NULL, NULL, NULL, NULL, NOW()
            )
            ON CONFLICT (user_id) DO NOTHING
            """
        )
    )

    op.add_column("intake", sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute(sa.text("UPDATE intake SET user_id = 1 WHERE user_id IS NULL"))
    op.alter_column("intake", "user_id", nullable=False)
    op.create_foreign_key("fk_intake_user_id", "intake", "user_account", ["user_id"], ["id"])
    op.create_index("ix_intake_user_id", "intake", ["user_id"], unique=False)

    op.create_table(
        "dailygoal_new",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("kcal_goal", sa.Float(), nullable=False),
        sa.Column("protein_goal", sa.Float(), nullable=False),
        sa.Column("fat_goal", sa.Float(), nullable=False),
        sa.Column("carbs_goal", sa.Float(), nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_goal_user_date"),
    )
    op.create_index("ix_dailygoal_new_user_id", "dailygoal_new", ["user_id"], unique=False)
    op.create_index("ix_dailygoal_new_date", "dailygoal_new", ["date"], unique=False)

    op.execute(
        sa.text(
            """
            INSERT INTO dailygoal_new (user_id, date, kcal_goal, protein_goal, fat_goal, carbs_goal)
            SELECT 1, date, kcal_goal, protein_goal, fat_goal, carbs_goal FROM dailygoal
            """
        )
    )

    op.drop_table("dailygoal")
    op.rename_table("dailygoal_new", "dailygoal")
    op.create_index("ix_dailygoal_user_id", "dailygoal", ["user_id"], unique=False)
    op.create_index("ix_dailygoal_date", "dailygoal", ["date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_dailygoal_date", table_name="dailygoal")
    op.drop_index("ix_dailygoal_user_id", table_name="dailygoal")
    op.drop_table("dailygoal")

    op.create_table(
        "dailygoal",
        sa.Column("date", sa.Date(), primary_key=True, nullable=False),
        sa.Column("kcal_goal", sa.Float(), nullable=False),
        sa.Column("protein_goal", sa.Float(), nullable=False),
        sa.Column("fat_goal", sa.Float(), nullable=False),
        sa.Column("carbs_goal", sa.Float(), nullable=False),
    )

    op.drop_index("ix_intake_user_id", table_name="intake")
    op.drop_constraint("fk_intake_user_id", "intake", type_="foreignkey")
    op.drop_column("intake", "user_id")

    op.drop_index("ix_email_verification_code_user_id", table_name="email_verification_code")
    op.drop_table("email_verification_code")
    op.drop_table("user_profile")

    op.drop_index("ix_user_account_email", table_name="user_account")
    op.drop_table("user_account")

    goal_type_enum.drop(op.get_bind(), checkfirst=True)
    activity_level_enum.drop(op.get_bind(), checkfirst=True)
    sex_enum.drop(op.get_bind(), checkfirst=True)
