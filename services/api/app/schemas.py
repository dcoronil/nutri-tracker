from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models import ActivityLevel, GoalType, IntakeMethod, NutritionBasis, RecipeMealType, Sex


class AuthUser(BaseModel):
    id: int
    email: str
    username: str
    avatar_url: str | None = None
    sex: Sex
    birth_date: date | None = None
    email_verified: bool
    onboarding_completed: bool


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    sex: Sex
    birth_date: date


class RegisterResponse(BaseModel):
    user_id: int
    email: str
    username: str
    email_verified: bool
    onboarding_completed: bool
    message: str
    debug_verification_code: str | None = None


class UsernameAvailabilityResponse(BaseModel):
    username: str
    available: bool
    reason: str | None = None


class VerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class ResendCodeRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=32, max_length=4096)
    username: str | None = Field(default=None, min_length=3, max_length=32)
    sex: Sex | None = None
    birth_date: date | None = None


class ProfileInput(BaseModel):
    weight_kg: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    age: int | None = Field(default=None, ge=13, le=120)
    sex: Sex = Sex.other
    activity_level: ActivityLevel = ActivityLevel.moderate
    goal_type: GoalType = GoalType.maintain
    weekly_weight_goal_kg: float | None = Field(default=None, gt=0, le=2)

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


class BodyWeightLogCreate(BaseModel):
    weight_kg: float = Field(gt=0)
    note: str | None = Field(default=None, max_length=280)
    created_at: datetime | None = None


class BodyWeightLogRead(BaseModel):
    id: int
    weight_kg: float
    note: str | None = None
    created_at: datetime


class BodyMeasurementLogCreate(BaseModel):
    waist_cm: float | None = Field(default=None, gt=0)
    neck_cm: float | None = Field(default=None, gt=0)
    hip_cm: float | None = Field(default=None, gt=0)
    chest_cm: float | None = Field(default=None, gt=0)
    arm_cm: float | None = Field(default=None, gt=0)
    thigh_cm: float | None = Field(default=None, gt=0)
    created_at: datetime | None = None


class BodyMeasurementLogRead(BaseModel):
    id: int
    waist_cm: float | None = None
    neck_cm: float | None = None
    hip_cm: float | None = None
    chest_cm: float | None = None
    arm_cm: float | None = None
    thigh_cm: float | None = None
    created_at: datetime


class BodyTrendPoint(BaseModel):
    date: date
    weight_kg: float


class BodySummaryResponse(BaseModel):
    latest_weight_kg: float | None = None
    weekly_change_kg: float | None = None
    bmi: float | None = None
    bmi_category: str = "unknown"
    body_fat_percent: float | None = None
    body_fat_category: str = "unknown"
    goal_type: GoalType | None = None
    weekly_weight_goal_kg: float | None = None
    needs_weight_checkin: bool
    trend_points: list[BodyTrendPoint] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)


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


class UserAIKeyUpsertRequest(BaseModel):
    provider: Literal["openai", "gemini"] = "openai"
    api_key: str = Field(min_length=16, max_length=4096)


class UserAIKeyDeleteResponse(BaseModel):
    deleted: bool


class UserAIKeyStatusResponse(BaseModel):
    configured: bool
    provider: Literal["openai", "gemini"] | None = None
    key_hint: str | None = None


class UserAIKeyTestRequest(BaseModel):
    provider: Literal["openai", "gemini"] | None = None
    api_key: str | None = Field(default=None, min_length=16, max_length=4096)


class UserAIKeyTestResponse(BaseModel):
    ok: bool
    provider: Literal["openai", "gemini"]
    message: str


class SocialUserRead(BaseModel):
    id: int
    username: str
    email: str
    avatar_url: str | None = None


class SocialSearchItem(SocialUserRead):
    friendship_status: Literal["none", "incoming_pending", "outgoing_pending", "friends"] = "none"
    friendship_id: int | None = None


class SocialUserSearchResponse(BaseModel):
    items: list[SocialSearchItem] = Field(default_factory=list)


class FriendRequestCreate(BaseModel):
    to_user_identifier: str = Field(min_length=3, max_length=255)


class FriendRequestRead(BaseModel):
    id: int
    status: Literal["pending", "accepted", "rejected", "cancelled"]
    created_at: datetime
    responded_at: datetime | None = None
    user: SocialUserRead


class FriendshipOverviewResponse(BaseModel):
    friends: list[SocialUserRead] = Field(default_factory=list)
    incoming_requests: list[FriendRequestRead] = Field(default_factory=list)
    outgoing_requests: list[FriendRequestRead] = Field(default_factory=list)


class SocialRecipePayload(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    servings: int | None = Field(default=None, ge=1, le=100)
    prep_time_min: int | None = Field(default=None, ge=0, le=1440)
    ingredients: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    nutrition_kcal: float | None = Field(default=None, ge=0)
    nutrition_protein_g: float | None = Field(default=None, ge=0)
    nutrition_carbs_g: float | None = Field(default=None, ge=0)
    nutrition_fat_g: float | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list)


class SocialProgressPayload(BaseModel):
    weight_kg: float | None = Field(default=None, gt=0)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    bmi: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=1024)


class SocialPostMediaRead(BaseModel):
    id: int
    media_url: str
    width: int | None = None
    height: int | None = None
    order_index: int


class SocialCommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class SocialCommentRead(BaseModel):
    id: int
    text: str
    created_at: datetime
    user: SocialUserRead


class SocialPostUpdate(BaseModel):
    visibility: Literal["public", "friends", "private"]


class SocialDeleteResponse(BaseModel):
    deleted: bool


class SocialPostRead(BaseModel):
    id: str
    type: Literal["photo", "recipe", "progress"]
    caption: str | None = None
    visibility: Literal["public", "friends", "private"]
    created_at: datetime
    updated_at: datetime
    user: SocialUserRead
    media: list[SocialPostMediaRead] = Field(default_factory=list)
    recipe: SocialRecipePayload | None = None
    progress: SocialProgressPayload | None = None
    like_count: int = 0
    comment_count: int = 0
    liked_by_me: bool = False
    source: Literal["friends", "explore", "self"] = "explore"


class SocialFeedResponse(BaseModel):
    items: list[SocialPostRead] = Field(default_factory=list)
    next_cursor: str | None = None


class SocialProfilePostsResponse(BaseModel):
    user: SocialUserRead
    is_me: bool
    is_friend: bool
    outgoing_request_pending: bool = False
    incoming_request_pending: bool = False
    posts_count: int = 0
    friends_count: int = 0
    items: list[SocialPostRead] = Field(default_factory=list)
    next_cursor: str | None = None


class SocialLikeToggleResponse(BaseModel):
    liked: bool
    like_count: int


class RecipeIngredientItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=32)


class UserRecipeUpsert(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    meal_type: RecipeMealType
    servings: int = Field(ge=1, le=100)
    prep_time_min: int | None = Field(default=None, ge=0, le=1440)
    ingredients: list[RecipeIngredientItem] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    nutrition_kcal: float = Field(ge=0)
    nutrition_protein_g: float = Field(ge=0)
    nutrition_carbs_g: float = Field(ge=0)
    nutrition_fat_g: float = Field(ge=0)
    default_quantity_units: float | None = Field(default=None, gt=0, le=100)

    @model_validator(mode="after")
    def validate_recipe_content(self) -> "UserRecipeUpsert":
        cleaned_steps = [step.strip() for step in self.steps if step.strip()]
        if not self.ingredients:
            raise ValueError("Añade al menos un ingrediente.")
        if not cleaned_steps:
            raise ValueError("Añade al menos un paso.")
        self.steps = cleaned_steps
        self.tags = [tag.strip() for tag in self.tags if tag.strip()][:12]
        return self


class UserRecipeRead(UserRecipeUpsert):
    id: int
    generated_with_ai: bool = False
    coach_feedback: str | None = None
    assumptions: list[str] = Field(default_factory=list)
    suggested_extras: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    product: ProductRead
    preferred_serving: ProductPreference | None = None


class RecipeGenerateRequest(BaseModel):
    meal_type: RecipeMealType
    target_kcal: float | None = Field(default=None, ge=0)
    target_protein_g: float | None = Field(default=None, ge=0)
    target_fat_g: float | None = Field(default=None, ge=0)
    target_carbs_g: float | None = Field(default=None, ge=0)
    goal_mode: GoalType | None = None
    use_only_ingredients: bool = True
    allergies: list[str] = Field(default_factory=list)
    preferences: list[str] = Field(default_factory=list)
    available_ingredients: list[RecipeIngredientItem] = Field(default_factory=list)
    allow_basic_pantry: bool = True
    locale: Literal["es", "en"] | None = None

    @model_validator(mode="after")
    def validate_ingredients(self) -> "RecipeGenerateRequest":
        if not self.available_ingredients:
            raise ValueError("Añade al menos un ingrediente disponible.")
        self.allergies = [item.strip() for item in self.allergies if item.strip()][:16]
        self.preferences = [item.strip() for item in self.preferences if item.strip()][:16]
        return self


class RecipeGenerateFeedback(BaseModel):
    summary: str
    highlights: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)
    suggested_extras: list[str] = Field(default_factory=list)


class RecipeGenerateResponse(BaseModel):
    model_used: Literal["gpt-4o-mini"] = "gpt-4o-mini"
    recipe: UserRecipeUpsert
    feedback: RecipeGenerateFeedback
    assumptions: list[str] = Field(default_factory=list)


class RecipeAiOptionPreview(BaseModel):
    option_id: str = Field(min_length=1, max_length=32)
    title: str = Field(min_length=2, max_length=140)
    meal_type: RecipeMealType
    servings: int = Field(ge=1, le=100)
    prep_time_min: int | None = Field(default=None, ge=0, le=1440)
    tags: list[str] = Field(default_factory=list)
    nutrition_kcal: float = Field(ge=0)
    nutrition_protein_g: float = Field(ge=0)
    nutrition_carbs_g: float = Field(ge=0)
    nutrition_fat_g: float = Field(ge=0)
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)
    complexity: Literal["low", "medium", "high"] = "medium"
    recommended: bool = False
    recommended_reason: str | None = None


class RecipeAiOptionsResponse(BaseModel):
    generation_id: str = Field(min_length=8, max_length=64)
    model_used: Literal["gpt-4o-mini"] = "gpt-4o-mini"
    options: list[RecipeAiOptionPreview] = Field(default_factory=list)


class RecipeAiDetailRequest(BaseModel):
    generation_id: str = Field(min_length=8, max_length=64)
    option_id: str = Field(min_length=1, max_length=32)


class RecipeAiDetailResponse(RecipeGenerateResponse):
    generation_id: str
    option_id: str
    recommended: bool = False
    recommended_reason: str | None = None


class ProductPreference(BaseModel):
    method: IntakeMethod
    quantity_g: float | None = None
    quantity_units: float | None = None
    percent_pack: float | None = None


class ProductRead(BaseModel):
    id: int
    barcode: str | None
    created_by_user_id: int | None
    is_public: bool
    report_count: int
    name: str
    brand: str | None
    image_url: str | None
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
    source: str
    is_verified: bool
    verified_at: datetime | None
    status: str
    is_hidden: bool
    canonical_product_id: int | None
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
    analysis_method: Literal["ai_vision", "ocr_fallback"] = "ocr_fallback"
    warnings: list[str] = Field(default_factory=list)


class ProductCorrectionResponse(BaseModel):
    product_id: int
    updated: bool
    product: ProductRead
    current: NutritionExtract
    detected: NutritionExtract
    missing_fields: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    message: str
    analysis_method: Literal["ai_vision", "ocr_fallback"] = "ocr_fallback"
    warnings: list[str] = Field(default_factory=list)


class ProductDataQualityResponse(BaseModel):
    product_id: int
    status: Literal["verified", "imported", "estimated"]
    label: str
    source: str
    is_verified: bool
    data_confidence: str
    verified_at: datetime | None = None
    message: str


class CommunityFoodCreate(BaseModel):
    barcode: str | None = Field(default=None, min_length=8, max_length=14)
    name: str = Field(min_length=2, max_length=256)
    brand: str | None = Field(default=None, max_length=128)
    image_url: str | None = Field(default=None, max_length=1024)
    nutrition_basis: NutritionBasis = NutritionBasis.per_100g
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


class FoodSearchItem(BaseModel):
    product: ProductRead
    badge: Literal["Verificado", "Comunidad", "Importado", "Estimado", "Generico"]
    origin: Literal["local", "openfoodfacts_remote"] = "local"


class FoodSearchResponse(BaseModel):
    query: str
    results: list[FoodSearchItem] = Field(default_factory=list)


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
    estimated: bool = False
    estimate_confidence: str | None = None
    user_description: str | None = None
    source_method: str = "barcode"
    nutrients: IntakeNutrients


class IntakeDeleteResponse(BaseModel):
    deleted: bool
    intake_id: int


class DaySummary(BaseModel):
    date: date
    goal: DailyGoalUpsert | None = None
    consumed: IntakeNutrients
    remaining: IntakeNutrients | None = None
    intakes: list[IntakeRead]
    water_ml: int = 0


class ProfileAnalysisResponse(BaseModel):
    profile: ProfileRead
    recommended_goal: DailyGoalUpsert
    goal_feedback_today: GoalFeedback | None = None
    suggested_kcal_adjustment: float | None = None
    weekly_weight_goal_kg: float | None = None


class MealEstimateQuestion(BaseModel):
    id: str
    prompt: str
    answer_type: Literal["single_choice", "number", "text"] = "text"
    options: list[str] = Field(default_factory=list)
    placeholder: str | None = None


class MealEstimateQuestionsResponse(BaseModel):
    model_used: Literal["gpt-4o-mini"] = "gpt-4o-mini"
    questions: list[str] = Field(default_factory=list)
    question_items: list[MealEstimateQuestion] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    detected_ingredients: list[str] = Field(default_factory=list)
    analysis_id: str | None = None
    analysis_expires_at: datetime | None = None


class MealPhotoEstimateResponse(BaseModel):
    saved: bool
    model_used: Literal["gpt-4o-mini"] = "gpt-4o-mini"
    confidence_level: Literal["high", "medium", "low"]
    analysis_method: Literal["ai_vision", "heuristic"] = "ai_vision"
    assumptions: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    question_items: list[MealEstimateQuestion] = Field(default_factory=list)
    detected_ingredients: list[str] = Field(default_factory=list)
    preview_nutrients: IntakeNutrients
    intake: IntakeRead | None = None


class CalendarDayEntry(BaseModel):
    date: date
    intake_count: int
    kcal: float
    protein_g: float = 0
    protein_goal_g: float | None = None
    weight_kg: float | None = None


class CalendarMonthResponse(BaseModel):
    month: str
    days: list[CalendarDayEntry]


class WaterLogCreate(BaseModel):
    ml: int = Field(gt=0, le=5000)
    created_at: datetime | None = None


class WaterLogRead(BaseModel):
    id: int
    ml: int
    created_at: datetime


class FavoriteProductRead(BaseModel):
    product: ProductRead
    created_at: datetime


class FavoriteProductToggleResponse(BaseModel):
    favorited: bool
    product_id: int


class RepeatIntakesResponse(BaseModel):
    copied: int
    from_day: date
    to_day: date


class WidgetTodaySummaryResponse(BaseModel):
    date: date
    kcal_remaining: float
    protein_consumed_g: float
    protein_goal_g: float
    water_ml: int
    latest_weight_kg: float | None = None


class CommunityFoodReportResponse(BaseModel):
    product_id: int
    report_count: int
    status: str
    is_hidden: bool


class BodyProgressPhotoCreate(BaseModel):
    image_url: str = Field(min_length=4, max_length=1024)
    note: str | None = Field(default=None, max_length=280)
    is_private: bool = True
    created_at: datetime | None = None


class BodyProgressPhotoRead(BaseModel):
    id: int
    image_url: str
    note: str | None = None
    is_private: bool
    created_at: datetime
