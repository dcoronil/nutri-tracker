from __future__ import annotations

from datetime import UTC, datetime
from datetime import date as date_type
from enum import StrEnum

from sqlalchemy import UniqueConstraint
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


class UserAccount(SQLModel, table=True):
    __tablename__ = "user_account"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    password_hash: str = Field(max_length=255)
    email_verified: bool = Field(default=False)
    onboarding_completed: bool = Field(default=False)
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


class UserProfile(SQLModel, table=True):
    __tablename__ = "user_profile"

    user_id: int = Field(primary_key=True, foreign_key="user_account.id")
    weight_kg: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    age: int | None = Field(default=None, ge=13, le=120)
    sex: Sex = Field(default=Sex.other)
    activity_level: ActivityLevel = Field(default=ActivityLevel.moderate)
    goal_type: GoalType = Field(default=GoalType.maintain)

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
    data_confidence: str = Field(default="manual", max_length=64)
    created_at: datetime = Field(default_factory=utcnow)


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
