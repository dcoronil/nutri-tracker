from __future__ import annotations

from datetime import UTC, datetime
from datetime import date as date_type
from enum import StrEnum

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class NutritionBasis(StrEnum):
    per_100g = "per_100g"
    per_100ml = "per_100ml"
    per_serving = "per_serving"


class IntakeMethod(StrEnum):
    grams = "grams"
    percent_pack = "percent_pack"
    units = "units"


class Sex(StrEnum):
    male = "male"
    female = "female"
    other = "other"


class ActivityLevel(StrEnum):
    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    athlete = "athlete"


class GoalType(StrEnum):
    lose = "lose"
    maintain = "maintain"
    gain = "gain"


class RecipeMealType(StrEnum):
    breakfast = "breakfast"
    brunch = "brunch"
    lunch = "lunch"
    snack = "snack"
    dinner = "dinner"


class SocialPostType(StrEnum):
    photo = "photo"
    recipe = "recipe"
    progress = "progress"


class SocialVisibility(StrEnum):
    public = "public"
    friends = "friends"
    private = "private"


class FriendRequestStatus(StrEnum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    cancelled = "cancelled"


class UserAccount(SQLModel, table=True):
    __tablename__ = "user_account"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    username: str = Field(unique=True, index=True, min_length=3, max_length=32)
    password_hash: str = Field(max_length=255)
    sex: Sex = Field(default=Sex.other)
    birth_date: date_type | None = None
    email_verified: bool = Field(default=False)
    onboarding_completed: bool = Field(default=False)
    ai_provider: str | None = Field(default=None, max_length=32)
    ai_api_key_encrypted: str | None = Field(default=None, max_length=4096)
    avatar_path: str | None = Field(default=None, max_length=1024)
    created_at: datetime = Field(default_factory=utcnow)


class EmailOTP(SQLModel, table=True):
    __tablename__ = "email_otp"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    code_hash: str = Field(max_length=255)
    expires_at: datetime
    attempts: int = Field(default=0)
    used_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class PendingRegistration(SQLModel, table=True):
    __tablename__ = "pending_registration"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    username: str = Field(unique=True, index=True, min_length=3, max_length=32)
    password_hash: str = Field(max_length=255)
    sex: Sex = Field(default=Sex.other)
    birth_date: date_type | None = None
    code_hash: str = Field(max_length=255)
    expires_at: datetime
    attempts: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)


class UserProfile(SQLModel, table=True):
    __tablename__ = "user_profile"

    user_id: int = Field(primary_key=True, foreign_key="user_account.id")
    weight_kg: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    age: int | None = Field(default=None, ge=13, le=120)
    sex: Sex = Field(default=Sex.other)
    activity_level: ActivityLevel = Field(default=ActivityLevel.moderate)
    goal_type: GoalType = Field(default=GoalType.maintain)
    weekly_weight_goal_kg: float | None = Field(default=None, gt=0, le=2)

    waist_cm: float | None = Field(default=None, gt=0)
    neck_cm: float | None = Field(default=None, gt=0)
    hip_cm: float | None = Field(default=None, gt=0)
    chest_cm: float | None = Field(default=None, gt=0)
    arm_cm: float | None = Field(default=None, gt=0)
    thigh_cm: float | None = Field(default=None, gt=0)

    bmi: float | None = Field(default=None, ge=0)
    body_fat_percent: float | None = Field(default=None, ge=0)
    updated_at: datetime = Field(default_factory=utcnow)


class Product(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    barcode: str | None = Field(default=None, unique=True, index=True, max_length=32)
    created_by_user_id: int | None = Field(default=None, foreign_key="user_account.id", index=True)
    is_public: bool = Field(default=True)
    report_count: int = Field(default=0, ge=0)
    name: str = Field(max_length=256)
    brand: str | None = Field(default=None, max_length=128)
    image_url: str | None = Field(default=None, max_length=1024)
    nutrition_basis: NutritionBasis = Field(default=NutritionBasis.per_100g)
    serving_size_g: float | None = Field(default=None, ge=0)
    net_weight_g: float | None = Field(default=None, ge=0)

    kcal: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    sat_fat_g: float | None = Field(default=None, ge=0)
    carbs_g: float = Field(ge=0)
    sugars_g: float | None = Field(default=None, ge=0)
    fiber_g: float | None = Field(default=None, ge=0)
    salt_g: float | None = Field(default=None, ge=0)

    source: str = Field(default="manual", max_length=64)
    is_verified: bool = Field(default=False)
    verified_at: datetime | None = None
    status: str = Field(default="approved", max_length=32)
    is_hidden: bool = Field(default=False)
    canonical_product_id: int | None = Field(default=None, foreign_key="product.id", index=True)
    data_confidence: str = Field(default="manual", max_length=64)
    created_at: datetime = Field(default_factory=utcnow)


class UserRecipe(SQLModel, table=True):
    __tablename__ = "user_recipe"
    __table_args__ = (
        UniqueConstraint("user_id", "title", name="uq_user_recipe_user_title"),
        UniqueConstraint("product_id", name="uq_user_recipe_product"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    title: str = Field(max_length=140)
    meal_type: RecipeMealType = Field(max_length=24)
    servings: int = Field(default=1, ge=1, le=100)
    prep_time_min: int | None = Field(default=None, ge=0, le=1440)
    ingredients_json: list[dict[str, object]] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    steps_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    coach_feedback: str | None = Field(default=None, max_length=4000)
    assumptions_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    suggested_extras_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    generated_with_ai: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class UserProductPreference(SQLModel, table=True):
    __tablename__ = "user_product_preference"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_user_product_pref"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    method: IntakeMethod = Field(default=IntakeMethod.grams)
    quantity_g: float | None = Field(default=None, ge=0)
    quantity_units: float | None = Field(default=None, ge=0)
    percent_pack: float | None = Field(default=None, ge=0, le=100)
    updated_at: datetime = Field(default_factory=utcnow)


class Intake(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    quantity_g: float | None = Field(default=None, ge=0)
    quantity_units: float | None = Field(default=None, ge=0)
    percent_pack: float | None = Field(default=None, ge=0, le=100)
    method: IntakeMethod = Field(default=IntakeMethod.grams)
    estimated: bool = Field(default=False)
    estimate_confidence: str | None = Field(default=None, max_length=16)
    user_description: str | None = Field(default=None, max_length=1024)
    source_method: str = Field(default="barcode", max_length=32)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class MealPhotoAnalysis(SQLModel, table=True):
    __tablename__ = "meal_photo_analysis"

    id: str = Field(primary_key=True, max_length=64)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    image_meta_json: str = Field(max_length=8192)
    expires_at: datetime = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class DailyGoal(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_daily_goal_user_date"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    date: date_type = Field(index=True)
    kcal_goal: float = Field(ge=0)
    protein_goal: float = Field(ge=0)
    fat_goal: float = Field(ge=0)
    carbs_goal: float = Field(ge=0)


class BodyWeightLog(SQLModel, table=True):
    __tablename__ = "body_weight_log"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    weight_kg: float = Field(gt=0)
    note: str | None = Field(default=None, max_length=280)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class BodyMeasurementLog(SQLModel, table=True):
    __tablename__ = "body_measurement_log"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    waist_cm: float | None = Field(default=None, gt=0)
    neck_cm: float | None = Field(default=None, gt=0)
    hip_cm: float | None = Field(default=None, gt=0)
    chest_cm: float | None = Field(default=None, gt=0)
    arm_cm: float | None = Field(default=None, gt=0)
    thigh_cm: float | None = Field(default=None, gt=0)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class WaterIntakeLog(SQLModel, table=True):
    __tablename__ = "water_intake_log"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    ml: int = Field(gt=0, le=5000)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class UserFavoriteProduct(SQLModel, table=True):
    __tablename__ = "user_favorite_product"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_user_favorite_product"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class BodyProgressPhoto(SQLModel, table=True):
    __tablename__ = "body_progress_photo"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    image_url: str = Field(max_length=1024)
    note: str | None = Field(default=None, max_length=280)
    is_private: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class FriendRequest(SQLModel, table=True):
    __tablename__ = "friend_request"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="uq_friend_request_pair"),)

    id: int | None = Field(default=None, primary_key=True)
    from_user_id: int = Field(foreign_key="user_account.id", index=True)
    to_user_id: int = Field(foreign_key="user_account.id", index=True)
    status: FriendRequestStatus = Field(default=FriendRequestStatus.pending, max_length=16)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    responded_at: datetime | None = None


class Friendship(SQLModel, table=True):
    __tablename__ = "friendship"
    __table_args__ = (UniqueConstraint("user_id", "friend_id", name="uq_friendship_pair"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    friend_id: int = Field(foreign_key="user_account.id", index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class SocialPost(SQLModel, table=True):
    __tablename__ = "social_post"

    id: str = Field(primary_key=True, max_length=64)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    type: SocialPostType = Field(max_length=16)
    caption: str | None = Field(default=None, max_length=2800)
    visibility: SocialVisibility = Field(default=SocialVisibility.friends, max_length=16)
    like_count: int = Field(default=0, ge=0)
    comment_count: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class SocialPostMedia(SQLModel, table=True):
    __tablename__ = "social_post_media"
    __table_args__ = (UniqueConstraint("post_id", "order_index", name="uq_social_post_media_order"),)

    id: int | None = Field(default=None, primary_key=True)
    post_id: str = Field(foreign_key="social_post.id", index=True, max_length=64)
    media_url: str = Field(max_length=1024)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    order_index: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class SocialRecipe(SQLModel, table=True):
    __tablename__ = "social_recipe"

    post_id: str = Field(primary_key=True, foreign_key="social_post.id", max_length=64)
    title: str = Field(max_length=140)
    servings: int | None = Field(default=None, ge=1, le=100)
    prep_time_min: int | None = Field(default=None, ge=0, le=1440)
    ingredients_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    steps_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    nutrition_kcal: float | None = Field(default=None, ge=0)
    nutrition_protein_g: float | None = Field(default=None, ge=0)
    nutrition_carbs_g: float | None = Field(default=None, ge=0)
    nutrition_fat_g: float | None = Field(default=None, ge=0)
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))


class SocialProgress(SQLModel, table=True):
    __tablename__ = "social_progress"

    post_id: str = Field(primary_key=True, foreign_key="social_post.id", max_length=64)
    weight_kg: float | None = Field(default=None, gt=0)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    bmi: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=1024)
    before_after_pair_json: dict[str, str] | None = Field(default=None, sa_column=Column(JSON, nullable=True))


class SocialLike(SQLModel, table=True):
    __tablename__ = "social_like"
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_social_like_user_post"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    post_id: str = Field(foreign_key="social_post.id", index=True, max_length=64)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class SocialComment(SQLModel, table=True):
    __tablename__ = "social_comment"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True)
    post_id: str = Field(foreign_key="social_post.id", index=True, max_length=64)
    text: str = Field(min_length=1, max_length=1000)
    created_at: datetime = Field(default_factory=utcnow, index=True)
