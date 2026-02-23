from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models import ActivityLevel, GoalType, IntakeMethod, NutritionBasis, Sex


class AuthUser(BaseModel):
    id: int
    email: str
    email_verified: bool
    onboarding_completed: bool


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterResponse(BaseModel):
    user_id: int
    email: str
    email_verified: bool
    onboarding_completed: bool
    message: str
    debug_verification_code: str | None = None


class VerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class ResendCodeRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class ProfileInput(BaseModel):
    weight_kg: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    age: int | None = Field(default=None, ge=13, le=120)
    sex: Sex = Sex.other
    activity_level: ActivityLevel = ActivityLevel.moderate
    goal_type: GoalType = GoalType.maintain

    waist_cm: float | None = Field(default=None, gt=0)
    neck_cm: float | None = Field(default=None, gt=0)
    hip_cm: float | None = Field(default=None, gt=0)
    chest_cm: float | None = Field(default=None, gt=0)
    arm_cm: float | None = Field(default=None, gt=0)
    thigh_cm: float | None = Field(default=None, gt=0)


class ProfileRead(ProfileInput):
    bmi: float | None
    bmi_category: str
    bmi_color: str
    body_fat_percent: float | None
    body_fat_category: str
    body_fat_color: str


class GoalFeedback(BaseModel):
    realistic: bool
    notes: list[str] = Field(default_factory=list)


class DailyGoalUpsert(BaseModel):
    kcal_goal: float = Field(gt=0)
    protein_goal: float = Field(gt=0)
    fat_goal: float = Field(gt=0)
    carbs_goal: float = Field(gt=0)


class DailyGoalResponse(DailyGoalUpsert):
    feedback: GoalFeedback


class MeResponse(BaseModel):
    user: AuthUser
    profile: ProfileRead | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: AuthUser
    profile: ProfileRead | None = None


class ProductPreference(BaseModel):
    method: IntakeMethod
    quantity_g: float | None = None
    quantity_units: float | None = None
    percent_pack: float | None = None


class ProductRead(BaseModel):
    id: int
    barcode: str | None
    name: str
    brand: str | None
    nutrition_basis: NutritionBasis
    serving_size_g: float | None
    net_weight_g: float | None
    kcal: float
    protein_g: float
    fat_g: float
    sat_fat_g: float | None
    carbs_g: float
    sugars_g: float | None
    fiber_g: float | None
    salt_g: float | None
    data_confidence: str

    model_config = {"from_attributes": True}


class ProductLookupResponse(BaseModel):
    source: Literal["local", "openfoodfacts_imported", "openfoodfacts_incomplete", "not_found"]
    product: ProductRead | None = None
    missing_fields: list[str] = Field(default_factory=list)
    message: str | None = None
    preferred_serving: ProductPreference | None = None


class NutritionExtract(BaseModel):
    kcal: float | None = None
    protein_g: float | None = None
    fat_g: float | None = None
    sat_fat_g: float | None = None
    carbs_g: float | None = None
    sugars_g: float | None = None
    fiber_g: float | None = None
    salt_g: float | None = None
    nutrition_basis: NutritionBasis | None = None
    serving_size_g: float | None = None


class LabelPhotoResponse(BaseModel):
    created: bool
    product: ProductRead | None = None
    extracted: NutritionExtract
    missing_fields: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


class IntakeCreate(BaseModel):
    product_id: int
    method: IntakeMethod
    quantity_g: float | None = Field(default=None, gt=0)
    quantity_units: float | None = Field(default=None, gt=0)
    percent_pack: float | None = Field(default=None, gt=0, le=100)
    created_at: datetime | None = None

    @model_validator(mode="after")
    def validate_quantity(self) -> IntakeCreate:
        if self.method == IntakeMethod.grams and self.quantity_g is None:
            raise ValueError("quantity_g is required when method=grams")
        if self.method == IntakeMethod.units and self.quantity_units is None:
            raise ValueError("quantity_units is required when method=units")
        if self.method == IntakeMethod.percent_pack and self.percent_pack is None:
            raise ValueError("percent_pack is required when method=percent_pack")
        return self


class IntakeNutrients(BaseModel):
    kcal: float
    protein_g: float
    fat_g: float
    sat_fat_g: float
    carbs_g: float
    sugars_g: float
    fiber_g: float
    salt_g: float


class IntakeRead(BaseModel):
    id: int
    product_id: int
    product_name: str | None
    method: IntakeMethod
    quantity_g: float | None
    quantity_units: float | None
    percent_pack: float | None
    created_at: datetime
    nutrients: IntakeNutrients


class DaySummary(BaseModel):
    date: date
    goal: DailyGoalUpsert | None = None
    consumed: IntakeNutrients
    remaining: IntakeNutrients | None = None
    intakes: list[IntakeRead]


class ProfileAnalysisResponse(BaseModel):
    profile: ProfileRead
    recommended_goal: DailyGoalUpsert
    goal_feedback_today: GoalFeedback | None = None


class CalendarDayEntry(BaseModel):
    date: date
    intake_count: int
    kcal: float


class CalendarMonthResponse(BaseModel):
    month: str
    days: list[CalendarDayEntry]
