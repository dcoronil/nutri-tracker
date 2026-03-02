from __future__ import annotations

import json
import re
import unicodedata
from datetime import UTC, date, datetime, time, timedelta
from difflib import SequenceMatcher
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile, status
from sqlalchemy import and_, or_
from sqlmodel import Session, desc, select

from app.config import get_settings
from app.database import get_session
from app.models import (
    BodyMeasurementLog,
    BodyProgressPhoto,
    BodyWeightLog,
    DailyGoal,
    EmailOTP,
    Intake,
    IntakeMethod,
    NutritionBasis,
    Product,
    UserAccount,
    UserFavoriteProduct,
    UserProductPreference,
    UserProfile,
    WaterIntakeLog,
)
from app.schemas import (
    AuthResponse,
    AuthUser,
    BodyMeasurementLogCreate,
    BodyMeasurementLogRead,
    BodyProgressPhotoCreate,
    BodyProgressPhotoRead,
    BodySummaryResponse,
    BodyTrendPoint,
    BodyWeightLogCreate,
    BodyWeightLogRead,
    CalendarDayEntry,
    CalendarMonthResponse,
    CommunityFoodCreate,
    CommunityFoodReportResponse,
    DailyGoalResponse,
    DailyGoalUpsert,
    DaySummary,
    FavoriteProductRead,
    FavoriteProductToggleResponse,
    FoodSearchItem,
    FoodSearchResponse,
    GoalFeedback,
    IntakeCreate,
    IntakeDeleteResponse,
    IntakeRead,
    LabelPhotoResponse,
    LoginRequest,
    MealEstimateQuestionsResponse,
    MealPhotoEstimateResponse,
    MeResponse,
    NutritionExtract,
    ProductCorrectionResponse,
    ProductDataQualityResponse,
    ProductLookupResponse,
    ProductPreference,
    ProductRead,
    ProfileAnalysisResponse,
    ProfileInput,
    ProfileRead,
    RegisterRequest,
    RegisterResponse,
    RepeatIntakesResponse,
    ResendCodeRequest,
    UserAIKeyDeleteResponse,
    UserAIKeyStatusResponse,
    UserAIKeyTestRequest,
    UserAIKeyTestResponse,
    UserAIKeyUpsertRequest,
    VerifyRequest,
    WaterLogCreate,
    WaterLogRead,
    WidgetTodaySummaryResponse,
)
from app.services.ai_keys import (
    AIKeyValidationError,
    decrypt_api_key,
    encrypt_api_key,
    mask_key_for_display,
    normalize_provider_or_default,
    test_provider_api_key,
    validate_api_key_shape,
)
from app.services.auth import (
    AuthTokenError,
    create_access_token,
    create_verification_code,
    hash_otp_code,
    hash_password,
    validate_email_format,
    verify_access_token,
    verify_otp_code,
    verify_password,
)
from app.services.body_metrics import (
    bmi,
    bmi_category,
    body_fat_category,
    body_fat_percent,
    coach_hints,
    goal_feedback,
    recommended_goals,
    rolling_weight_points,
    should_prompt_weight_log,
    suggested_kcal_adjustment,
    weekly_weight_change,
)
from app.services.email import EmailSendError, send_verification_email
from app.services.nutrition import (
    IntakeComputationError,
    coherence_questions,
    extract_nutrition_from_text,
    missing_critical_fields,
    nutrients_for_quantity,
    ocr_text_from_images,
    quantity_from_method,
    remaining_from_goal,
    sanitize_numeric_values,
    sum_nutrients,
    zero_nutrients,
)
from app.services.openfoodfacts import (
    OpenFoodFactsClientError,
    fetch_openfoodfacts_product,
    search_openfoodfacts_products,
)
from app.services.openfoodfacts import (
    missing_critical_fields as off_missing_critical_fields,
)
from app.services.rate_limit import client_key_from_ip, rate_limiter
from app.services.vision_ai import (
    VisionAIError,
    estimate_meal_with_ai,
    extract_label_nutrition_with_ai,
    generate_meal_questions_with_ai,
)

router = APIRouter()

EAN_PATTERN = re.compile(r"^\d{8,14}$")
MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")
OTP_MAX_ATTEMPTS = 5


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _rate_limit(request: Request, *, scope: str, limit: int, window_seconds: int, key_suffix: str = "") -> None:
    client_ip = request.headers.get("x-forwarded-for")
    if not client_ip and request.client:
        client_ip = request.client.host
    client_key = client_key_from_ip(client_ip)
    full_key = f"{client_key}:{key_suffix}" if key_suffix else client_key
    rate_limiter.check(scope=scope, key=full_key, limit=limit, window_seconds=window_seconds)


def _auth_user(user: UserAccount) -> AuthUser:
    return AuthUser(
        id=user.id,
        email=user.email,
        email_verified=user.email_verified,
        onboarding_completed=user.onboarding_completed,
    )


def _profile_to_read(profile: UserProfile) -> ProfileRead:
    bmi_value = profile.bmi if profile.bmi is not None else bmi(profile.weight_kg, profile.height_cm)
    bmi_label, bmi_color = bmi_category(bmi_value)

    fat_value = profile.body_fat_percent
    if fat_value is None:
        fat_value = body_fat_percent(profile)
    fat_label, fat_color = body_fat_category(fat_value, profile.sex)

    return ProfileRead(
        weight_kg=profile.weight_kg,
        height_cm=profile.height_cm,
        age=profile.age,
        sex=profile.sex,
        activity_level=profile.activity_level,
        goal_type=profile.goal_type,
        waist_cm=profile.waist_cm,
        neck_cm=profile.neck_cm,
        hip_cm=profile.hip_cm,
        chest_cm=profile.chest_cm,
        arm_cm=profile.arm_cm,
        thigh_cm=profile.thigh_cm,
        bmi=bmi_value,
        bmi_category=bmi_label,
        bmi_color=bmi_color,
        body_fat_percent=fat_value,
        body_fat_category=fat_label,
        body_fat_color=fat_color,
    )


def _load_profile(session: Session, user_id: int) -> UserProfile | None:
    return session.get(UserProfile, user_id)


def _load_profile_or_404(session: Session, user_id: int) -> UserProfile:
    profile = _load_profile(session, user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


def _ai_key_status(user: UserAccount) -> UserAIKeyStatusResponse:
    configured = bool(user.ai_api_key_encrypted)
    provider = None
    key_hint = None

    if configured:
        try:
            provider = normalize_provider_or_default(user.ai_provider)
            key_hint = mask_key_for_display(decrypt_api_key(user.ai_api_key_encrypted or ""))
        except AIKeyValidationError:
            provider = normalize_provider_or_default(user.ai_provider)
            key_hint = None

    return UserAIKeyStatusResponse(
        configured=configured,
        provider=provider,
        key_hint=key_hint,
    )


def _user_ai_provider_and_key(
    user: UserAccount,
    *,
    required: bool,
) -> tuple[str, str] | None:
    if not user.ai_api_key_encrypted:
        if required:
            raise HTTPException(
                status_code=status.HTTP_428_PRECONDITION_REQUIRED,
                detail="Configura tu API key en Settings > IA para usar esta función.",
            )
        return None

    try:
        provider = normalize_provider_or_default(user.ai_provider)
        api_key = decrypt_api_key(user.ai_api_key_encrypted)
    except AIKeyValidationError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    if provider != "openai":
        if not required:
            return None
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"Provider '{provider}' no implementado para visión todavía.",
        )

    return provider, api_key


async def _extract_label_payload(
    *,
    user: UserAccount,
    basis_hint: NutritionBasis | None,
    serving_size_g: float | None,
    net_weight_g: float | None,
    label_text: str | None,
    photos: list[UploadFile] | None,
) -> tuple[dict[str, object], list[str], list[str], Literal["ai_vision", "ocr_fallback"]]:
    photo_files = photos or []
    extracted_text = (label_text or "").strip()
    warnings: list[str] = []
    questions: list[str] = []
    analysis_method: Literal["ai_vision", "ocr_fallback"] = "ocr_fallback"
    extracted: dict[str, object] = {}

    ai_credentials = _user_ai_provider_and_key(user, required=False)
    if ai_credentials and (extracted_text or photo_files):
        _, api_key = ai_credentials
        try:
            ai_result = await extract_label_nutrition_with_ai(
                api_key=api_key,
                label_text=extracted_text,
                photo_files=photo_files,
                basis_hint=basis_hint,
            )
            extracted = dict(ai_result["nutrition"])  # type: ignore[arg-type]
            questions.extend(ai_result["questions"])  # type: ignore[arg-type]
            analysis_method = "ai_vision"
        except VisionAIError as exc:
            warnings.append(f"IA no disponible ({exc}). Se aplicó OCR clásico.")

    if analysis_method != "ai_vision":
        if user.ai_api_key_encrypted and not ai_credentials:
            warnings.append("Proveedor IA actual no soportado para visión; se aplicó OCR clásico.")
        if photo_files and not user.ai_api_key_encrypted:
            warnings.append("Sin API key configurada: se aplicó OCR clásico (menos preciso).")
        if not extracted_text and photo_files:
            extracted_text = await ocr_text_from_images(photo_files)
        extracted = extract_nutrition_from_text(extracted_text, basis_hint=basis_hint)

    extracted["serving_size_g"] = extracted.get("serving_size_g") or serving_size_g
    if net_weight_g is not None:
        extracted["net_weight_g"] = net_weight_g

    if not extracted_text and not photo_files:
        questions.append("No se recibió texto ni imagen de etiqueta.")

    questions.extend(coherence_questions(extracted))
    return extracted, questions, warnings, analysis_method


def _parse_meal_answers_json(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}

    if not isinstance(parsed, dict):
        return {}

    answers: dict[str, str] = {}
    for key, value in parsed.items():
        normalized_key = str(key).strip()
        normalized_value = str(value).strip()
        if normalized_key and normalized_value:
            answers[normalized_key] = normalized_value
    return answers


def _infer_portion_from_answers(answers: dict[str, str]) -> Literal["small", "medium", "large"] | None:
    joined = " ".join(answers.values()).lower()
    if "small" in joined or "peque" in joined:
        return "small"
    if "large" in joined or "grande" in joined:
        return "large"
    if "medium" in joined or "media" in joined or "mediana" in joined:
        return "medium"
    return None


def _infer_added_fats_from_answers(answers: dict[str, str]) -> bool | None:
    joined = " ".join(answers.values()).lower()
    if any(token in joined for token in {"yes", "si", "sí"}):
        return True
    if "no" in joined:
        return False
    return None


def _infer_quantity_note_from_answers(answers: dict[str, str]) -> str | None:
    quantity_parts = [
        value
        for key, value in answers.items()
        if any(token in key.lower() for token in {"qty", "quantity", "cantidad"})
    ]
    if not quantity_parts:
        quantity_parts = [value for value in answers.values() if re.search(r"\d", value)]
    joined = " | ".join(quantity_parts).strip()
    return joined or None


def _answers_to_context(answers: dict[str, str]) -> list[str]:
    return [f"{key}: {value}" for key, value in answers.items() if key and value]


def _resolve_meal_inputs(
    *,
    description: str | None,
    answers_json: str | None,
    portion_size: str | None,
    has_added_fats: bool | None,
    quantity_note: str | None,
) -> tuple[str, Literal["small", "medium", "large"] | None, bool | None, str | None, list[str]]:
    answers = _parse_meal_answers_json(answers_json)
    normalized_portion: Literal["small", "medium", "large"] | None
    normalized_portion = (
        portion_size
        if portion_size in {"small", "medium", "large"}
        else _infer_portion_from_answers(answers)
    )
    normalized_added_fats = has_added_fats if has_added_fats is not None else _infer_added_fats_from_answers(answers)
    normalized_quantity_note = (quantity_note or "").strip() or _infer_quantity_note_from_answers(answers)
    answer_context = _answers_to_context(answers)

    resolved_description = (description or "").strip()
    if answer_context:
        answer_text = " | ".join(answer_context)
        resolved_description = f"{resolved_description}. {answer_text}" if resolved_description else answer_text

    if not resolved_description:
        resolved_description = "Comida estimada por foto"

    return resolved_description, normalized_portion, normalized_added_fats, normalized_quantity_note, answer_context


def get_current_user(
    session: Annotated[Session, Depends(get_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> UserAccount:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization header")

    try:
        payload = verify_access_token(token)
    except AuthTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user = session.get(UserAccount, payload["uid"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def get_verified_user(
    current_user: Annotated[UserAccount, Depends(get_current_user)],
) -> UserAccount:
    if not current_user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email is not verified")
    return current_user


def get_ready_user(
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
) -> UserAccount:
    if not current_user.onboarding_completed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Onboarding not completed")
    return current_user


def _otp_response(user: UserAccount, message: str, code: str | None) -> RegisterResponse:
    settings = get_settings()
    debug_code = code if settings.expose_verification_code else None

    return RegisterResponse(
        user_id=user.id,
        email=user.email,
        email_verified=user.email_verified,
        onboarding_completed=user.onboarding_completed,
        message=message,
        debug_verification_code=debug_code,
    )


def _create_otp(session: Session, user: UserAccount) -> str:
    settings = get_settings()
    raw_code = create_verification_code()

    otp = EmailOTP(
        user_id=user.id,
        code_hash=hash_otp_code(raw_code),
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.verification_code_ttl_minutes),
        attempts=0,
    )
    session.add(otp)
    return raw_code


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/auth/register", response_model=RegisterResponse)
def register(
    payload: RegisterRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> RegisterResponse:
    _rate_limit(request, scope="auth_register", limit=8, window_seconds=60)
    email = payload.email.strip().lower()
    if not validate_email_format(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email")

    existing = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    password_hash = hash_password(payload.password)
    user = UserAccount(
        email=email,
        password_hash=password_hash,
        email_verified=False,
        onboarding_completed=False,
    )
    session.add(user)
    session.flush()

    raw_code = _create_otp(session, user)
    session.commit()

    message = "Account created. Verify your email with the code."
    try:
        sent = send_verification_email(email, raw_code)
    except EmailSendError:
        sent = False

    if not sent:
        message = "Account created. SMTP disabled, use development OTP code."

    return _otp_response(user, message, raw_code)


@router.post("/auth/resend-code", response_model=RegisterResponse)
def resend_code(
    payload: ResendCodeRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> RegisterResponse:
    _rate_limit(request, scope="auth_resend", limit=8, window_seconds=60)
    email = payload.email.strip().lower()
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    raw_code = _create_otp(session, user)
    session.commit()

    message = "A new verification code was generated."
    try:
        sent = send_verification_email(email, raw_code)
    except EmailSendError:
        sent = False

    if not sent:
        message = "SMTP disabled, use development OTP code."

    return _otp_response(user, message, raw_code)


@router.post("/auth/verify", response_model=AuthResponse)
def verify_email(
    payload: VerifyRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> AuthResponse:
    _rate_limit(request, scope="auth_verify", limit=20, window_seconds=60)
    email = payload.email.strip().lower()
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    otp = session.exec(
        select(EmailOTP)
        .where(EmailOTP.user_id == user.id)
        .where(EmailOTP.used_at.is_(None))
        .order_by(desc(EmailOTP.created_at))
    ).first()

    if not otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active verification code")

    if otp.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts")

    if _to_utc(otp.expires_at) < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification code expired")

    if not verify_otp_code(payload.code, otp.code_hash):
        otp.attempts += 1
        session.add(otp)
        session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code")

    user.email_verified = True
    otp.used_at = datetime.now(UTC)
    session.add(user)
    session.add(otp)
    session.commit()

    token = create_access_token(user.id, user.email)
    profile = _load_profile(session, user.id)

    return AuthResponse(
        access_token=token,
        user=_auth_user(user),
        profile=_profile_to_read(profile) if profile else None,
    )


@router.post("/auth/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> AuthResponse:
    _rate_limit(request, scope="auth_login", limit=12, window_seconds=60)
    email = payload.email.strip().lower()
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(user.id, user.email)
    profile = _load_profile(session, user.id)

    return AuthResponse(
        access_token=token,
        user=_auth_user(user),
        profile=_profile_to_read(profile) if profile else None,
    )


@router.get("/me", response_model=MeResponse)
def me(
    current_user: Annotated[UserAccount, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> MeResponse:
    profile = _load_profile(session, current_user.id)
    return MeResponse(user=_auth_user(current_user), profile=_profile_to_read(profile) if profile else None)


@router.get("/user/ai-key/status", response_model=UserAIKeyStatusResponse)
def user_ai_key_status(
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
) -> UserAIKeyStatusResponse:
    return _ai_key_status(current_user)


@router.post("/user/ai-key", response_model=UserAIKeyStatusResponse)
def upsert_user_ai_key(
    payload: UserAIKeyUpsertRequest,
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
) -> UserAIKeyStatusResponse:
    _rate_limit(request, scope="ai_key_upsert", limit=15, window_seconds=60, key_suffix=str(current_user.id))
    try:
        provider = normalize_provider_or_default(payload.provider)
        validate_api_key_shape(provider, payload.api_key)
    except AIKeyValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    current_user.ai_provider = provider
    current_user.ai_api_key_encrypted = encrypt_api_key(payload.api_key.strip())
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return _ai_key_status(current_user)


@router.delete("/user/ai-key", response_model=UserAIKeyDeleteResponse)
def delete_user_ai_key(
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
) -> UserAIKeyDeleteResponse:
    current_user.ai_provider = None
    current_user.ai_api_key_encrypted = None
    session.add(current_user)
    session.commit()
    return UserAIKeyDeleteResponse(deleted=True)


@router.post("/user/ai-key/test", response_model=UserAIKeyTestResponse)
async def test_user_ai_key(
    payload: UserAIKeyTestRequest,
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
) -> UserAIKeyTestResponse:
    _rate_limit(request, scope="ai_key_test", limit=20, window_seconds=60, key_suffix=str(current_user.id))
    provider = normalize_provider_or_default(payload.provider or current_user.ai_provider)

    if payload.api_key and payload.api_key.strip():
        raw_key = payload.api_key.strip()
    elif current_user.ai_api_key_encrypted:
        try:
            raw_key = decrypt_api_key(current_user.ai_api_key_encrypted)
        except AIKeyValidationError as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No API key configured")

    ok, message = await test_provider_api_key(provider, raw_key)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    return UserAIKeyTestResponse(ok=True, provider=provider, message=message)


@router.post("/profile", response_model=ProfileRead)
def upsert_profile(
    payload: ProfileInput,
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ProfileRead:
    profile = _load_profile(session, current_user.id)

    if profile is None:
        profile = UserProfile(
            user_id=current_user.id,
            weight_kg=payload.weight_kg,
            height_cm=payload.height_cm,
            age=payload.age,
            sex=payload.sex,
            activity_level=payload.activity_level,
            goal_type=payload.goal_type,
            weekly_weight_goal_kg=payload.weekly_weight_goal_kg,
            waist_cm=payload.waist_cm,
            neck_cm=payload.neck_cm,
            hip_cm=payload.hip_cm,
            chest_cm=payload.chest_cm,
            arm_cm=payload.arm_cm,
            thigh_cm=payload.thigh_cm,
            updated_at=datetime.now(UTC),
        )
        session.add(profile)
    else:
        profile.weight_kg = payload.weight_kg
        profile.height_cm = payload.height_cm
        profile.age = payload.age
        profile.sex = payload.sex
        profile.activity_level = payload.activity_level
        profile.goal_type = payload.goal_type
        profile.weekly_weight_goal_kg = payload.weekly_weight_goal_kg
        profile.waist_cm = payload.waist_cm
        profile.neck_cm = payload.neck_cm
        profile.hip_cm = payload.hip_cm
        profile.chest_cm = payload.chest_cm
        profile.arm_cm = payload.arm_cm
        profile.thigh_cm = payload.thigh_cm
        profile.updated_at = datetime.now(UTC)

    profile.bmi = bmi(profile.weight_kg, profile.height_cm)
    profile.body_fat_percent = body_fat_percent(profile)

    session.add(profile)
    session.commit()
    session.refresh(profile)
    return _profile_to_read(profile)


@router.get("/me/analysis", response_model=ProfileAnalysisResponse)
def me_analysis(
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
    day: date | None = None,
) -> ProfileAnalysisResponse:
    profile = _load_profile_or_404(session, current_user.id)
    recommended = recommended_goals(profile)
    weight_logs = session.exec(
        select(BodyWeightLog).where(BodyWeightLog.user_id == current_user.id).order_by(desc(BodyWeightLog.created_at))
    ).all()
    weekly_delta = weekly_weight_change(weight_logs)
    kcal_adjustment = suggested_kcal_adjustment(
        weekly_weight_delta=weekly_delta,
        goal_type=profile.goal_type,
    )

    target_day = day or datetime.now(UTC).date()
    goal = session.exec(
        select(DailyGoal).where(DailyGoal.user_id == current_user.id).where(DailyGoal.date == target_day)
    ).first()

    feedback = None
    if goal:
        feedback = GoalFeedback(
            **goal_feedback(
                profile,
                {
                    "kcal_goal": goal.kcal_goal,
                    "protein_goal": goal.protein_goal,
                    "fat_goal": goal.fat_goal,
                    "carbs_goal": goal.carbs_goal,
                },
                recommended,
            )
        )

    return ProfileAnalysisResponse(
        profile=_profile_to_read(profile),
        recommended_goal=DailyGoalUpsert(**recommended),
        goal_feedback_today=feedback,
        suggested_kcal_adjustment=kcal_adjustment,
        weekly_weight_goal_kg=profile.weekly_weight_goal_kg,
    )


def _preference_payload(pref: UserProductPreference | None) -> ProductPreference | None:
    if not pref:
        return None
    return ProductPreference(
        method=pref.method,
        quantity_g=pref.quantity_g,
        quantity_units=pref.quantity_units,
        percent_pack=pref.percent_pack,
    )


def _nutrition_extract_from_product(product: Product) -> NutritionExtract:
    return NutritionExtract(
        kcal=product.kcal,
        protein_g=product.protein_g,
        fat_g=product.fat_g,
        sat_fat_g=product.sat_fat_g,
        carbs_g=product.carbs_g,
        sugars_g=product.sugars_g,
        fiber_g=product.fiber_g,
        salt_g=product.salt_g,
        nutrition_basis=product.nutrition_basis,
        serving_size_g=product.serving_size_g,
    )


def _weight_log_to_read(record: BodyWeightLog) -> BodyWeightLogRead:
    return BodyWeightLogRead(
        id=record.id,
        weight_kg=record.weight_kg,
        note=record.note,
        created_at=record.created_at,
    )


def _measurement_log_to_read(record: BodyMeasurementLog) -> BodyMeasurementLogRead:
    return BodyMeasurementLogRead(
        id=record.id,
        waist_cm=record.waist_cm,
        neck_cm=record.neck_cm,
        hip_cm=record.hip_cm,
        chest_cm=record.chest_cm,
        arm_cm=record.arm_cm,
        thigh_cm=record.thigh_cm,
        created_at=record.created_at,
    )


def _water_log_to_read(record: WaterIntakeLog) -> WaterLogRead:
    return WaterLogRead(
        id=record.id,
        ml=record.ml,
        created_at=record.created_at,
    )


def _body_photo_to_read(record: BodyProgressPhoto) -> BodyProgressPhotoRead:
    return BodyProgressPhotoRead(
        id=record.id,
        image_url=record.image_url,
        note=record.note,
        is_private=record.is_private,
        created_at=record.created_at,
    )


@router.post("/body/weight-logs", response_model=BodyWeightLogRead)
def create_body_weight_log(
    payload: BodyWeightLogCreate,
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
) -> BodyWeightLogRead:
    created_at = payload.created_at or datetime.now(UTC)
    record = BodyWeightLog(
        user_id=current_user.id,
        weight_kg=payload.weight_kg,
        note=payload.note,
        created_at=created_at,
    )
    session.add(record)

    profile = _load_profile(session, current_user.id)
    if profile:
        profile.weight_kg = payload.weight_kg
        profile.bmi = bmi(profile.weight_kg, profile.height_cm)
        profile.body_fat_percent = body_fat_percent(profile)
        profile.updated_at = datetime.now(UTC)
        session.add(profile)

    session.commit()
    session.refresh(record)
    return _weight_log_to_read(record)


@router.get("/body/weight-logs", response_model=list[BodyWeightLogRead])
def list_body_weight_logs(
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 120,
) -> list[BodyWeightLogRead]:
    bounded_limit = max(1, min(limit, 365))
    rows = session.exec(
        select(BodyWeightLog)
        .where(BodyWeightLog.user_id == current_user.id)
        .order_by(desc(BodyWeightLog.created_at))
        .limit(bounded_limit)
    ).all()
    return [_weight_log_to_read(row) for row in rows]


@router.post("/body/measurement-logs", response_model=BodyMeasurementLogRead)
def create_body_measurement_log(
    payload: BodyMeasurementLogCreate,
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
) -> BodyMeasurementLogRead:
    created_at = payload.created_at or datetime.now(UTC)
    record = BodyMeasurementLog(
        user_id=current_user.id,
        waist_cm=payload.waist_cm,
        neck_cm=payload.neck_cm,
        hip_cm=payload.hip_cm,
        chest_cm=payload.chest_cm,
        arm_cm=payload.arm_cm,
        thigh_cm=payload.thigh_cm,
        created_at=created_at,
    )
    session.add(record)

    profile = _load_profile(session, current_user.id)
    if profile:
        profile.waist_cm = payload.waist_cm
        profile.neck_cm = payload.neck_cm
        profile.hip_cm = payload.hip_cm
        profile.chest_cm = payload.chest_cm
        profile.arm_cm = payload.arm_cm
        profile.thigh_cm = payload.thigh_cm
        profile.body_fat_percent = body_fat_percent(profile)
        profile.updated_at = datetime.now(UTC)
        session.add(profile)

    session.commit()
    session.refresh(record)
    return _measurement_log_to_read(record)


@router.get("/body/measurement-logs", response_model=list[BodyMeasurementLogRead])
def list_body_measurement_logs(
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 120,
) -> list[BodyMeasurementLogRead]:
    bounded_limit = max(1, min(limit, 365))
    rows = session.exec(
        select(BodyMeasurementLog)
        .where(BodyMeasurementLog.user_id == current_user.id)
        .order_by(desc(BodyMeasurementLog.created_at))
        .limit(bounded_limit)
    ).all()
    return [_measurement_log_to_read(row) for row in rows]


@router.post("/body/progress-photos", response_model=BodyProgressPhotoRead)
def create_body_progress_photo(
    payload: BodyProgressPhotoCreate,
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
) -> BodyProgressPhotoRead:
    _rate_limit(request, scope="body_photo_create", limit=10, window_seconds=60, key_suffix=str(current_user.id))
    image_url = payload.image_url.strip()
    if not image_url:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image_url is required")

    record = BodyProgressPhoto(
        user_id=current_user.id,
        image_url=image_url,
        note=(payload.note or "").strip() or None,
        is_private=payload.is_private,
        created_at=payload.created_at or datetime.now(UTC),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _body_photo_to_read(record)


@router.get("/body/progress-photos", response_model=list[BodyProgressPhotoRead])
def list_body_progress_photos(
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 120,
) -> list[BodyProgressPhotoRead]:
    bounded_limit = max(1, min(limit, 365))
    rows = session.exec(
        select(BodyProgressPhoto)
        .where(BodyProgressPhoto.user_id == current_user.id)
        .order_by(desc(BodyProgressPhoto.created_at))
        .limit(bounded_limit)
    ).all()
    return [_body_photo_to_read(row) for row in rows]


@router.post("/water/logs", response_model=WaterLogRead)
def create_water_log(
    payload: WaterLogCreate,
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> WaterLogRead:
    _rate_limit(request, scope="water_create", limit=30, window_seconds=60, key_suffix=str(current_user.id))
    record = WaterIntakeLog(
        user_id=current_user.id,
        ml=payload.ml,
        created_at=payload.created_at or datetime.now(UTC),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _water_log_to_read(record)


@router.get("/water/logs", response_model=list[WaterLogRead])
def list_water_logs(
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    day: date | None = None,
    limit: int = 240,
) -> list[WaterLogRead]:
    bounded_limit = max(1, min(limit, 1000))
    stmt = (
        select(WaterIntakeLog)
        .where(WaterIntakeLog.user_id == current_user.id)
        .order_by(desc(WaterIntakeLog.created_at))
    )
    if day:
        start_dt = datetime.combine(day, time.min).replace(tzinfo=UTC)
        end_dt = datetime.combine(day + timedelta(days=1), time.min).replace(tzinfo=UTC)
        stmt = stmt.where(WaterIntakeLog.created_at >= start_dt).where(WaterIntakeLog.created_at < end_dt)

    rows = session.exec(stmt.limit(bounded_limit)).all()
    return [_water_log_to_read(row) for row in rows]


@router.get("/body/summary", response_model=BodySummaryResponse)
def body_summary(
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> BodySummaryResponse:
    profile = _load_profile(session, current_user.id)

    weight_logs = session.exec(
        select(BodyWeightLog)
        .where(BodyWeightLog.user_id == current_user.id)
        .order_by(desc(BodyWeightLog.created_at))
        .limit(400)
    ).all()

    latest_weight = weight_logs[0] if weight_logs else None
    weekly_change = weekly_weight_change(weight_logs, now=datetime.now(UTC))
    weight_points = rolling_weight_points(weight_logs, days=84)
    trend_points: list[BodyTrendPoint] = [
        BodyTrendPoint(date=date.fromisoformat(str(point["date"])), weight_kg=float(point["weight_kg"]))
        for point in weight_points
    ]

    bmi_value = None
    bmi_label = "unknown"
    body_fat_value = None
    body_fat_label = "unknown"

    if profile:
        if latest_weight:
            bmi_value = bmi(latest_weight.weight_kg, profile.height_cm)
        else:
            bmi_value = bmi(profile.weight_kg, profile.height_cm)
        bmi_label, _ = bmi_category(bmi_value)

        measurement = session.exec(
            select(BodyMeasurementLog)
            .where(BodyMeasurementLog.user_id == current_user.id)
            .order_by(desc(BodyMeasurementLog.created_at))
        ).first()

        body_fat_profile = UserProfile(
            user_id=profile.user_id,
            weight_kg=latest_weight.weight_kg if latest_weight else profile.weight_kg,
            height_cm=profile.height_cm,
            age=profile.age,
            sex=profile.sex,
            activity_level=profile.activity_level,
            goal_type=profile.goal_type,
            waist_cm=measurement.waist_cm if measurement else profile.waist_cm,
            neck_cm=measurement.neck_cm if measurement else profile.neck_cm,
            hip_cm=measurement.hip_cm if measurement else profile.hip_cm,
            chest_cm=measurement.chest_cm if measurement else profile.chest_cm,
            arm_cm=measurement.arm_cm if measurement else profile.arm_cm,
            thigh_cm=measurement.thigh_cm if measurement else profile.thigh_cm,
        )
        body_fat_value = body_fat_percent(body_fat_profile)
        body_fat_label, _ = body_fat_category(body_fat_value, body_fat_profile.sex)

    today = datetime.now(UTC).date()
    today_summary = _day_summary(day=today, current_user=current_user, session=session)
    hints = coach_hints(
        consumed_kcal=today_summary.consumed.kcal,
        kcal_goal=today_summary.goal.kcal_goal if today_summary.goal else None,
        consumed_protein_g=today_summary.consumed.protein_g,
        protein_goal=today_summary.goal.protein_goal if today_summary.goal else None,
        has_intakes_today=len(today_summary.intakes) > 0,
        weekly_weight_delta=weekly_change,
        latest_weight_kg=latest_weight.weight_kg if latest_weight else profile.weight_kg if profile else None,
        goal_type=profile.goal_type if profile else None,
        weekly_weight_goal_kg=profile.weekly_weight_goal_kg if profile else None,
    )

    return BodySummaryResponse(
        latest_weight_kg=latest_weight.weight_kg if latest_weight else profile.weight_kg if profile else None,
        weekly_change_kg=weekly_change,
        bmi=bmi_value,
        bmi_category=bmi_label,
        body_fat_percent=body_fat_value,
        body_fat_category=body_fat_label,
        needs_weight_checkin=should_prompt_weight_log(latest_weight.created_at if latest_weight else None),
        trend_points=trend_points,
        hints=hints,
    )


def _apply_openfoodfacts_payload(product: Product, off_product: dict[str, object]) -> None:
    brand_value = off_product.get("brand")
    image_value = off_product.get("image_url")

    product.name = str(off_product["name"])
    product.brand = brand_value if isinstance(brand_value, str | type(None)) else None
    product.image_url = image_value if isinstance(image_value, str | type(None)) else None
    product.nutrition_basis = off_product["nutrition_basis"]  # type: ignore[assignment]
    product.serving_size_g = off_product.get("serving_size_g")  # type: ignore[assignment]
    product.net_weight_g = off_product.get("net_weight_g")  # type: ignore[assignment]
    product.kcal = off_product["kcal"]  # type: ignore[assignment]
    product.protein_g = off_product["protein_g"]  # type: ignore[assignment]
    product.fat_g = off_product["fat_g"]  # type: ignore[assignment]
    product.sat_fat_g = off_product.get("sat_fat_g")  # type: ignore[assignment]
    product.carbs_g = off_product["carbs_g"]  # type: ignore[assignment]
    product.sugars_g = off_product.get("sugars_g")  # type: ignore[assignment]
    product.fiber_g = off_product.get("fiber_g")  # type: ignore[assignment]
    product.salt_g = off_product.get("salt_g")  # type: ignore[assignment]
    product.source = "openfoodfacts"
    product.is_verified = False
    product.verified_at = None
    product.data_confidence = "openfoodfacts_imported"


def _product_data_quality(product: Product) -> ProductDataQualityResponse:
    if product.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Product id missing")

    if product.is_verified or product.source == "local_verified":
        return ProductDataQualityResponse(
            product_id=product.id,
            status="verified",
            label="Verificado",
            source=product.source,
            is_verified=product.is_verified,
            data_confidence=product.data_confidence,
            verified_at=product.verified_at,
            message="Valores verificados localmente con etiqueta o revisión manual.",
        )

    if product.source == "photo_estimate" or product.data_confidence.startswith("estimate"):
        return ProductDataQualityResponse(
            product_id=product.id,
            status="estimated",
            label="Estimado",
            source=product.source,
            is_verified=False,
            data_confidence=product.data_confidence,
            verified_at=product.verified_at,
            message="Estimación aproximada; revisar con etiqueta real cuando sea posible.",
        )

    if product.source == "community":
        return ProductDataQualityResponse(
            product_id=product.id,
            status="imported",
            label="Comunidad",
            source=product.source,
            is_verified=product.is_verified,
            data_confidence=product.data_confidence,
            verified_at=product.verified_at,
            message="Producto creado por la comunidad y compartido públicamente.",
        )

    return ProductDataQualityResponse(
        product_id=product.id,
        status="imported",
        label="Importado",
        source=product.source,
        is_verified=product.is_verified,
        data_confidence=product.data_confidence,
        verified_at=product.verified_at,
        message="Datos importados de fuente externa sin verificación local.",
    )


def _product_badge(product: Product) -> Literal["Verificado", "Comunidad", "Importado", "Estimado"]:
    if product.is_verified or product.source in {"local_verified", "community_verified"}:
        return "Verificado"
    if product.source == "community":
        return "Comunidad"
    if product.source == "photo_estimate" or product.data_confidence.startswith("estimate"):
        return "Estimado"
    return "Importado"


def _as_float_or_zero(value: object) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


def _as_float_or_none(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _normalize_search_text(value: str) -> str:
    lowered = value.strip().lower()
    folded = unicodedata.normalize("NFKD", lowered)
    without_accents = "".join(char for char in folded if not unicodedata.combining(char))
    compact = re.sub(r"[^a-z0-9]+", " ", without_accents)
    return re.sub(r"\s+", " ", compact).strip()


def _tokenize_search_text(value: str) -> list[str]:
    normalized = _normalize_search_text(value)
    if not normalized:
        return []
    return [token for token in normalized.split(" ") if token]


def _similarity_bonus(query: str, target: str, *, weight: float) -> float:
    if not query or not target:
        return 0.0
    ratio = SequenceMatcher(None, query, target).ratio()
    if ratio >= 0.92:
        return weight
    if ratio >= 0.85:
        return weight * 0.72
    if ratio >= 0.76:
        return weight * 0.44
    if ratio >= 0.68:
        return weight * 0.24
    return 0.0


def _minimum_text_score_for_query(query: str) -> float:
    normalized = _normalize_search_text(query)
    length = len(normalized)
    if length <= 2:
        return 14.0
    if length <= 4:
        return 24.0
    if length <= 7:
        return 34.0
    return 44.0


def _text_match_score(query: str, name: str, brand: str | None, barcode: str | None) -> float:
    q = _normalize_search_text(query)
    name_l = _normalize_search_text(name)
    brand_l = _normalize_search_text(brand or "")
    barcode_l = (barcode or "").strip()

    if not q:
        return 0.0

    if barcode_l and q == barcode_l:
        return 1200.0

    score = 0.0
    if name_l == q:
        score += 700.0
    elif name_l.startswith(q):
        score += 450.0
    elif q in name_l:
        score += 260.0

    if brand_l == q:
        score += 320.0
    elif brand_l.startswith(q):
        score += 180.0
    elif q in brand_l:
        score += 90.0

    score += _similarity_bonus(q, name_l, weight=220.0)
    score += _similarity_bonus(q, brand_l, weight=140.0)

    query_tokens = [token for token in q.split(" ") if len(token) >= 2]
    name_tokens = [token for token in name_l.split(" ") if len(token) >= 2]
    brand_tokens = [token for token in brand_l.split(" ") if len(token) >= 2]

    if query_tokens:
        combined = f"{name_l} {brand_l}".strip()
        if combined and all(token in combined for token in query_tokens):
            score += 80.0

    for token in query_tokens:
        if token in name_tokens:
            score += 70.0
            continue
        if token in brand_tokens:
            score += 52.0
            continue

        best_name_ratio = max(
            (SequenceMatcher(None, token, candidate).ratio() for candidate in name_tokens),
            default=0.0,
        )
        best_brand_ratio = max(
            (SequenceMatcher(None, token, candidate).ratio() for candidate in brand_tokens),
            default=0.0,
        )
        best_ratio = max(best_name_ratio, best_brand_ratio)
        if best_ratio >= 0.9:
            score += 52.0
        elif best_ratio >= 0.82:
            score += 34.0
        elif best_ratio >= 0.74:
            score += 20.0

    return score


def _source_priority_score(product: Product) -> float:
    if product.is_verified:
        return 240.0
    if product.source in {"community_verified", "local_verified"}:
        return 220.0
    if product.source == "community":
        return 130.0
    if product.source == "openfoodfacts":
        return 60.0
    return 100.0


def _local_search_score(
    *,
    query: str,
    product: Product,
    is_favorite: bool,
    user_use_count: int,
    global_use_count: int,
    text_score: float | None = None,
) -> float:
    score = (
        text_score
        if text_score is not None
        else _text_match_score(query, product.name, product.brand, product.barcode)
    )
    score += _source_priority_score(product)
    if product.created_by_user_id is not None:
        score += 18.0
    if is_favorite:
        score += 180.0
    score += min(user_use_count, 30) * 14.0
    score += min(global_use_count, 80) * 2.2
    return score


def _off_search_preview_product(item: dict[str, object], synthetic_id: int) -> ProductRead:
    basis = item.get("nutrition_basis")
    if not isinstance(basis, NutritionBasis):
        basis = NutritionBasis.per_100g

    barcode = str(item.get("barcode") or "").strip()
    name = str(item.get("name") or "").strip() or "Producto OpenFoodFacts"
    brand_raw = item.get("brand")
    image_raw = item.get("image_url")

    return ProductRead(
        id=synthetic_id,
        barcode=barcode or None,
        created_by_user_id=None,
        is_public=True,
        report_count=0,
        name=name,
        brand=brand_raw if isinstance(brand_raw, str) else None,
        image_url=image_raw if isinstance(image_raw, str) else None,
        nutrition_basis=basis,
        serving_size_g=_as_float_or_none(item.get("serving_size_g")),
        net_weight_g=_as_float_or_none(item.get("net_weight_g")),
        kcal=_as_float_or_zero(item.get("kcal")),
        protein_g=_as_float_or_zero(item.get("protein_g")),
        fat_g=_as_float_or_zero(item.get("fat_g")),
        sat_fat_g=_as_float_or_none(item.get("sat_fat_g")),
        carbs_g=_as_float_or_zero(item.get("carbs_g")),
        sugars_g=_as_float_or_none(item.get("sugars_g")),
        fiber_g=_as_float_or_none(item.get("fiber_g")),
        salt_g=_as_float_or_none(item.get("salt_g")),
        source="openfoodfacts",
        is_verified=False,
        verified_at=None,
        status="approved",
        is_hidden=False,
        canonical_product_id=None,
        data_confidence="openfoodfacts_search_preview",
    )


@router.post("/foods/community", response_model=ProductRead)
def create_community_food(
    payload: CommunityFoodCreate,
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ProductRead:
    _rate_limit(request, scope="community_create", limit=15, window_seconds=60, key_suffix=str(current_user.id))
    barcode = payload.barcode.strip() if payload.barcode else None
    if barcode and not EAN_PATTERN.match(barcode):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid EAN/UPC")

    if barcode:
        existing = session.exec(select(Product).where(Product.barcode == barcode)).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Barcode already exists")

    image_url = payload.image_url.strip() if payload.image_url and payload.image_url.strip() else None
    brand = payload.brand.strip() if payload.brand and payload.brand.strip() else None

    product = Product(
        barcode=barcode,
        created_by_user_id=current_user.id,
        is_public=True,
        report_count=0,
        name=payload.name.strip(),
        brand=brand,
        image_url=image_url,
        nutrition_basis=payload.nutrition_basis,
        serving_size_g=payload.serving_size_g,
        net_weight_g=payload.net_weight_g,
        kcal=payload.kcal,
        protein_g=payload.protein_g,
        fat_g=payload.fat_g,
        sat_fat_g=payload.sat_fat_g,
        carbs_g=payload.carbs_g,
        sugars_g=payload.sugars_g,
        fiber_g=payload.fiber_g,
        salt_g=payload.salt_g,
        source="community",
        is_verified=False,
        verified_at=None,
        status="approved",
        is_hidden=False,
        canonical_product_id=None,
        data_confidence="community_approved_auto",
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    return ProductRead.model_validate(product)


@router.get("/foods/search", response_model=FoodSearchResponse)
async def search_foods(
    q: str,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 20,
) -> FoodSearchResponse:
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="q must have at least 2 characters",
        )

    bounded_limit = max(1, min(limit, 40))
    pattern = f"%{query}%"
    query_tokens = _tokenize_search_text(query)
    token_patterns = [f"%{token}%" for token in query_tokens[:4]]

    visibility = or_(
        Product.created_by_user_id == current_user.id,
        and_(Product.is_public.is_(True), Product.is_hidden.is_(False), Product.status == "approved"),
    )

    text_filters = [
        Product.name.ilike(pattern),
        Product.brand.ilike(pattern),
        Product.barcode.ilike(pattern),
    ]
    for token_pattern in token_patterns:
        text_filters.extend([Product.name.ilike(token_pattern), Product.brand.ilike(token_pattern)])

    candidate_rows = session.exec(
        select(Product)
        .where(visibility)
        .where(or_(*text_filters))
        .order_by(desc(Product.is_verified), desc(Product.created_at))
        .limit(max(80, bounded_limit * 5))
    ).all()

    # When strict LIKE search is sparse, add a wider local pool and rank in Python.
    if len(candidate_rows) < max(24, bounded_limit * 2):
        fallback_rows = session.exec(
            select(Product)
            .where(visibility)
            .order_by(desc(Product.is_verified), desc(Product.created_at))
            .limit(max(180, bounded_limit * 10))
        ).all()
        seen_candidate_ids = {product.id for product in candidate_rows if product.id is not None}
        for fallback in fallback_rows:
            if fallback.id is None:
                continue
            if fallback.id in seen_candidate_ids:
                continue
            candidate_rows.append(fallback)
            seen_candidate_ids.add(fallback.id)

    product_ids = [product.id for product in candidate_rows if product.id is not None]
    favorite_ids: set[int] = set()
    user_use_counts: dict[int, int] = {}
    global_use_counts: dict[int, int] = {}

    if product_ids:
        favorite_rows = session.exec(
            select(UserFavoriteProduct.product_id)
            .where(UserFavoriteProduct.user_id == current_user.id)
            .where(UserFavoriteProduct.product_id.in_(product_ids))
        ).all()
        favorite_ids = set(favorite_rows)

        user_intakes = session.exec(
            select(Intake.product_id)
            .where(Intake.user_id == current_user.id)
            .where(Intake.product_id.in_(product_ids))
        ).all()
        for product_id in user_intakes:
            user_use_counts[product_id] = user_use_counts.get(product_id, 0) + 1

        global_intakes = session.exec(select(Intake.product_id).where(Intake.product_id.in_(product_ids))).all()
        for product_id in global_intakes:
            global_use_counts[product_id] = global_use_counts.get(product_id, 0) + 1

    minimum_text_score = _minimum_text_score_for_query(query)
    scored_rows: list[tuple[float, float, Product]] = []
    for product in candidate_rows:
        text_score = _text_match_score(query, product.name, product.brand, product.barcode)
        if text_score < minimum_text_score:
            continue
        score = _local_search_score(
            query=query,
            product=product,
            is_favorite=(product.id or -1) in favorite_ids,
            user_use_count=user_use_counts.get(product.id or -1, 0),
            global_use_count=global_use_counts.get(product.id or -1, 0),
            text_score=text_score,
        )
        scored_rows.append((score, text_score, product))

    ranked_rows = [
        row[2]
        for row in sorted(
            scored_rows,
            key=lambda item: (item[0], item[1], item[2].created_at),
            reverse=True,
        )
    ]

    results: list[FoodSearchItem] = []
    seen_product_ids: set[int] = set()
    seen_barcodes: set[str] = set()

    for product in ranked_rows:
        if product.id is None or product.id in seen_product_ids:
            continue
        seen_product_ids.add(product.id)
        if product.barcode:
            seen_barcodes.add(product.barcode)
        results.append(
            FoodSearchItem(
                product=ProductRead.model_validate(product),
                badge=_product_badge(product),
                origin="local",
            )
        )
        if len(results) >= bounded_limit:
            return FoodSearchResponse(query=query, results=results)

    should_try_openfoodfacts_barcode = EAN_PATTERN.match(query) is not None and all(
        product.barcode != query for product in ranked_rows
    )
    if should_try_openfoodfacts_barcode and len(results) < bounded_limit:
        try:
            off_product = await fetch_openfoodfacts_product(query)
        except OpenFoodFactsClientError:
            off_product = None

        if off_product and not off_missing_critical_fields(off_product):
            existing = session.exec(select(Product).where(Product.barcode == query)).first()
            imported = existing
            if imported is None:
                imported = Product(
                    barcode=query,
                    name="",
                    brand=None,
                    image_url=None,
                    nutrition_basis=NutritionBasis.per_100g,
                    serving_size_g=None,
                    net_weight_g=None,
                    kcal=0,
                    protein_g=0,
                    fat_g=0,
                    sat_fat_g=None,
                    carbs_g=0,
                    sugars_g=None,
                    fiber_g=None,
                    salt_g=None,
                    data_confidence="manual",
                )
            _apply_openfoodfacts_payload(imported, off_product)
            session.add(imported)
            session.commit()
            session.refresh(imported)
            if imported.id is not None and imported.id not in seen_product_ids:
                seen_product_ids.add(imported.id)
                if imported.barcode:
                    seen_barcodes.add(imported.barcode)
                results.append(
                    FoodSearchItem(
                        product=ProductRead.model_validate(imported),
                        badge=_product_badge(imported),
                        origin="local",
                    )
                )

    should_try_openfoodfacts_text = EAN_PATTERN.match(query) is None and len(results) < max(5, bounded_limit // 2)
    if should_try_openfoodfacts_text:
        try:
            off_candidates = await search_openfoodfacts_products(query, limit=bounded_limit * 2)
        except OpenFoodFactsClientError:
            off_candidates = []

        synthetic_id = -1
        for candidate in off_candidates:
            barcode = str(candidate.get("barcode") or "").strip()
            if not barcode or barcode in seen_barcodes:
                continue
            results.append(
                FoodSearchItem(
                    product=_off_search_preview_product(candidate, synthetic_id),
                    badge="Importado",
                    origin="openfoodfacts_remote",
                )
            )
            synthetic_id -= 1
            seen_barcodes.add(barcode)
            if len(results) >= bounded_limit:
                break

    return FoodSearchResponse(query=query, results=results)


@router.post("/foods/{product_id}/report", response_model=CommunityFoodReportResponse)
def report_community_food(
    product_id: int,
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> CommunityFoodReportResponse:
    _rate_limit(request, scope="community_report", limit=20, window_seconds=60, key_suffix=str(current_user.id))
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    product.report_count = (product.report_count or 0) + 1
    if product.report_count >= 5:
        product.status = "flagged"
        product.is_hidden = True

    session.add(product)
    session.commit()
    session.refresh(product)
    return CommunityFoodReportResponse(
        product_id=product.id,
        report_count=product.report_count,
        status=product.status,
        is_hidden=product.is_hidden,
    )


@router.get("/products/by_barcode/{ean}", response_model=ProductLookupResponse)
async def product_by_barcode(
    ean: str,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ProductLookupResponse:
    if not EAN_PATTERN.match(ean):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid EAN/UPC")

    local = session.exec(select(Product).where(Product.barcode == ean)).first()
    if local:
        if local.is_hidden and local.created_by_user_id != current_user.id:
            return ProductLookupResponse(source="not_found", message="Product not found")
        # Avoid mixing label/manual nutrition with external images.
        # Only sync OpenFoodFacts products with OpenFoodFacts data.
        if local.source == "openfoodfacts" and not local.is_verified:
            try:
                off_product = await fetch_openfoodfacts_product(ean)
            except OpenFoodFactsClientError:
                off_product = None

            if off_product and not off_missing_critical_fields(off_product):
                _apply_openfoodfacts_payload(local, off_product)
                session.add(local)
                session.commit()
                session.refresh(local)

        pref = session.exec(
            select(UserProductPreference)
            .where(UserProductPreference.user_id == current_user.id)
            .where(UserProductPreference.product_id == local.id)
        ).first()
        return ProductLookupResponse(
            source="local",
            product=ProductRead.model_validate(local),
            preferred_serving=_preference_payload(pref),
        )

    try:
        off_product = await fetch_openfoodfacts_product(ean)
    except OpenFoodFactsClientError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    if off_product is None:
        return ProductLookupResponse(source="not_found", message="Product not found")

    missing = off_missing_critical_fields(off_product)
    if missing:
        return ProductLookupResponse(
            source="openfoodfacts_incomplete",
            missing_fields=missing,
            message="Missing nutrition fields. Capture the label.",
        )

    product = Product(
        barcode=ean,
        name="",
        brand=None,
        image_url=None,
        nutrition_basis=NutritionBasis.per_100g,
        serving_size_g=None,
        net_weight_g=None,
        kcal=0,
        protein_g=0,
        fat_g=0,
        sat_fat_g=None,
        carbs_g=0,
        sugars_g=None,
        fiber_g=None,
        salt_g=None,
        data_confidence="manual",
    )
    _apply_openfoodfacts_payload(product, off_product)
    session.add(product)
    session.commit()
    session.refresh(product)

    return ProductLookupResponse(source="openfoodfacts_imported", product=ProductRead.model_validate(product))


@router.get("/products/{product_id}/data-quality", response_model=ProductDataQualityResponse)
def product_data_quality(
    product_id: int,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ProductDataQualityResponse:
    del current_user
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return _product_data_quality(product)


@router.post("/products/from_label_photo", response_model=LabelPhotoResponse)
async def create_product_from_label_photo(
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    barcode: Annotated[str | None, Form()] = None,
    name: Annotated[str | None, Form()] = None,
    brand: Annotated[str | None, Form()] = None,
    image_url: Annotated[str | None, Form()] = None,
    nutrition_basis: Annotated[NutritionBasis | None, Form()] = None,
    serving_size_g: Annotated[float | None, Form()] = None,
    net_weight_g: Annotated[float | None, Form()] = None,
    label_text: Annotated[str | None, Form()] = None,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> LabelPhotoResponse:
    image_url_clean = image_url.strip() if image_url and image_url.strip() else None

    extracted, questions, warnings, analysis_method = await _extract_label_payload(
        user=current_user,
        basis_hint=nutrition_basis,
        serving_size_g=serving_size_g,
        net_weight_g=net_weight_g,
        label_text=label_text,
        photos=photos,
    )

    missing_fields = missing_critical_fields(extracted)
    extracted_text = (label_text or "").strip()
    if not extracted_text and not photos:
        questions.insert(0, "Could not extract text from label. Upload a clearer image or paste OCR text.")

    if not name:
        questions.append("Missing product name.")

    if missing_fields:
        for field in missing_fields:
            questions.append(f"Missing {field}. Please confirm manually.")

    nutrition_payload = NutritionExtract.model_validate(extracted)

    if missing_fields or not name:
        return LabelPhotoResponse(
            created=False,
            extracted=nutrition_payload,
            missing_fields=missing_fields,
            questions=questions,
            analysis_method=analysis_method,
            warnings=warnings,
        )

    payload = sanitize_numeric_values({**extracted, "net_weight_g": net_weight_g})

    existing = None
    if barcode:
        existing = session.exec(select(Product).where(Product.barcode == barcode)).first()

    if existing:
        existing.name = name
        existing.brand = brand
        if image_url is not None:
            existing.image_url = image_url_clean
        existing.nutrition_basis = payload["nutrition_basis"]
        existing.serving_size_g = payload.get("serving_size_g")
        existing.net_weight_g = payload.get("net_weight_g")
        existing.kcal = payload["kcal"]
        existing.protein_g = payload["protein_g"]
        existing.fat_g = payload["fat_g"]
        existing.sat_fat_g = payload.get("sat_fat_g")
        existing.carbs_g = payload["carbs_g"]
        existing.sugars_g = payload.get("sugars_g")
        existing.fiber_g = payload.get("fiber_g")
        existing.salt_g = payload.get("salt_g")
        existing.source = "local_verified"
        existing.is_verified = True
        existing.verified_at = datetime.now(UTC)
        existing.data_confidence = "label_photo_verified"
        product = existing
    else:
        product = Product(
            barcode=barcode,
            name=name,
            brand=brand,
            image_url=image_url_clean,
            nutrition_basis=payload["nutrition_basis"],
            serving_size_g=payload.get("serving_size_g"),
            net_weight_g=payload.get("net_weight_g"),
            kcal=payload["kcal"],
            protein_g=payload["protein_g"],
            fat_g=payload["fat_g"],
            sat_fat_g=payload.get("sat_fat_g"),
            carbs_g=payload["carbs_g"],
            sugars_g=payload.get("sugars_g"),
            fiber_g=payload.get("fiber_g"),
            salt_g=payload.get("salt_g"),
            source="local_verified",
            is_verified=True,
            verified_at=datetime.now(UTC),
            data_confidence="label_photo_verified",
        )
        session.add(product)

    session.commit()
    session.refresh(product)

    return LabelPhotoResponse(
        created=True,
        product=ProductRead.model_validate(product),
        extracted=nutrition_payload,
        missing_fields=[],
        questions=questions,
        analysis_method=analysis_method,
        warnings=warnings,
    )


def _apply_extracted_label_to_product(
    product: Product,
    payload: dict[str, object],
    *,
    name: str | None = None,
    brand: str | None = None,
) -> None:
    if name is not None and name.strip():
        product.name = name.strip()
    if brand is not None:
        brand_clean = brand.strip()
        product.brand = brand_clean or None

    product.nutrition_basis = payload["nutrition_basis"]  # type: ignore[assignment]
    product.serving_size_g = payload.get("serving_size_g")  # type: ignore[assignment]
    product.net_weight_g = payload.get("net_weight_g")  # type: ignore[assignment]
    product.kcal = payload["kcal"]  # type: ignore[assignment]
    product.protein_g = payload["protein_g"]  # type: ignore[assignment]
    product.fat_g = payload["fat_g"]  # type: ignore[assignment]
    product.sat_fat_g = payload.get("sat_fat_g")  # type: ignore[assignment]
    product.carbs_g = payload["carbs_g"]  # type: ignore[assignment]
    product.sugars_g = payload.get("sugars_g")  # type: ignore[assignment]
    product.fiber_g = payload.get("fiber_g")  # type: ignore[assignment]
    product.salt_g = payload.get("salt_g")  # type: ignore[assignment]
    product.source = "local_verified"
    product.is_verified = True
    product.verified_at = datetime.now(UTC)
    product.data_confidence = "label_photo_verified"


async def _correct_product_from_label_impl(
    *,
    product: Product,
    user: UserAccount,
    session: Session,
    confirm_update: bool,
    name: str | None,
    brand: str | None,
    nutrition_basis: NutritionBasis | None,
    serving_size_g: float | None,
    net_weight_g: float | None,
    label_text: str | None,
    photos: list[UploadFile] | None,
) -> ProductCorrectionResponse:
    extracted, questions, warnings, analysis_method = await _extract_label_payload(
        user=user,
        basis_hint=nutrition_basis,
        serving_size_g=serving_size_g,
        net_weight_g=net_weight_g if net_weight_g is not None else product.net_weight_g,
        label_text=label_text,
        photos=photos,
    )
    missing_fields = missing_critical_fields(extracted)
    if not (label_text or "").strip() and not photos:
        questions.insert(0, "No se pudo extraer texto de la etiqueta. Sube una imagen más nítida o pega el OCR.")

    detected_payload = NutritionExtract.model_validate(extracted)
    current_payload = _nutrition_extract_from_product(product)

    if not confirm_update:
        return ProductCorrectionResponse(
            product_id=product.id,
            updated=False,
            product=ProductRead.model_validate(product),
            current=current_payload,
            detected=detected_payload,
            missing_fields=missing_fields,
            questions=questions,
            message="Revisa comparación y reenvía con confirm_update=true para guardar.",
            analysis_method=analysis_method,
            warnings=warnings,
        )

    if missing_fields:
        return ProductCorrectionResponse(
            product_id=product.id,
            updated=False,
            product=ProductRead.model_validate(product),
            current=current_payload,
            detected=detected_payload,
            missing_fields=missing_fields,
            questions=questions,
            message="Faltan campos críticos; no se guardó la corrección.",
            analysis_method=analysis_method,
            warnings=warnings,
        )

    payload = sanitize_numeric_values(extracted)
    _apply_extracted_label_to_product(
        product,
        payload,
        name=name,
        brand=brand,
    )

    session.add(product)
    session.commit()
    session.refresh(product)

    return ProductCorrectionResponse(
        product_id=product.id,
        updated=True,
        product=ProductRead.model_validate(product),
        current=current_payload,
        detected=detected_payload,
        missing_fields=[],
        questions=questions,
        message="Producto actualizado y marcado como verificado localmente.",
        analysis_method=analysis_method,
        warnings=warnings,
    )


@router.post("/products/{product_id}/correct-from-label-photo", response_model=ProductCorrectionResponse)
async def correct_product_from_label_photo(
    product_id: int,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    confirm_update: Annotated[bool, Form()] = False,
    name: Annotated[str | None, Form()] = None,
    brand: Annotated[str | None, Form()] = None,
    nutrition_basis: Annotated[NutritionBasis | None, Form()] = None,
    serving_size_g: Annotated[float | None, Form()] = None,
    net_weight_g: Annotated[float | None, Form()] = None,
    label_text: Annotated[str | None, Form()] = None,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> ProductCorrectionResponse:
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    return await _correct_product_from_label_impl(
        product=product,
        user=current_user,
        session=session,
        confirm_update=confirm_update,
        name=name,
        brand=brand,
        nutrition_basis=nutrition_basis,
        serving_size_g=serving_size_g,
        net_weight_g=net_weight_g,
        label_text=label_text,
        photos=photos,
    )


@router.post("/products/correct-by-barcode-from-label-photo", response_model=ProductCorrectionResponse)
async def correct_product_by_barcode_from_label_photo(
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    barcode: Annotated[str, Form()],
    confirm_update: Annotated[bool, Form()] = False,
    name: Annotated[str | None, Form()] = None,
    brand: Annotated[str | None, Form()] = None,
    nutrition_basis: Annotated[NutritionBasis | None, Form()] = None,
    serving_size_g: Annotated[float | None, Form()] = None,
    net_weight_g: Annotated[float | None, Form()] = None,
    label_text: Annotated[str | None, Form()] = None,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> ProductCorrectionResponse:
    code = barcode.strip()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="barcode is required")

    product = session.exec(select(Product).where(Product.barcode == code)).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found for barcode")

    return await _correct_product_from_label_impl(
        product=product,
        user=current_user,
        session=session,
        confirm_update=confirm_update,
        name=name,
        brand=brand,
        nutrition_basis=nutrition_basis,
        serving_size_g=serving_size_g,
        net_weight_g=net_weight_g,
        label_text=label_text,
        photos=photos,
    )


@router.post("/meal-photo-estimate/questions", response_model=MealEstimateQuestionsResponse)
async def meal_photo_estimate_questions(
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    description: Annotated[str | None, Form()] = None,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> MealEstimateQuestionsResponse:
    _rate_limit(request, scope="meal_questions", limit=12, window_seconds=60, key_suffix=str(current_user.id))
    ai_credentials = _user_ai_provider_and_key(current_user, required=True)
    if not ai_credentials:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No AI credentials available",
        )
    _, api_key = ai_credentials
    photo_files = photos or []
    if not photo_files:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Adjunta al menos una foto.")

    try:
        result = await generate_meal_questions_with_ai(
            api_key=api_key,
            description=(description or "").strip(),
            photo_files=photo_files,
        )
    except VisionAIError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return MealEstimateQuestionsResponse(
        model_used=result["model_used"],  # type: ignore[arg-type]
        questions=result["questions"],  # type: ignore[arg-type]
        question_items=result.get("question_items", []),  # type: ignore[arg-type]
        assumptions=result["assumptions"],  # type: ignore[arg-type]
        detected_ingredients=result["detected_ingredients"],  # type: ignore[arg-type]
    )


@router.post("/meal-photo-estimate/calculate", response_model=MealPhotoEstimateResponse)
async def meal_photo_estimate_calculate(
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    description: Annotated[str | None, Form()] = None,
    answers_json: Annotated[str | None, Form()] = None,
    portion_size: Annotated[str | None, Form()] = None,
    has_added_fats: Annotated[bool | None, Form()] = None,
    quantity_note: Annotated[str | None, Form()] = None,
    adjust_percent: Annotated[int, Form()] = 0,
    commit: Annotated[bool, Form()] = False,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> MealPhotoEstimateResponse:
    _rate_limit(request, scope="meal_calculate", limit=18, window_seconds=60, key_suffix=str(current_user.id))
    return await intake_from_meal_photo_estimate(
        request=request,
        current_user=current_user,
        session=session,
        description=description,
        answers_json=answers_json,
        portion_size=portion_size,
        has_added_fats=has_added_fats,
        quantity_note=quantity_note,
        adjust_percent=adjust_percent,
        commit=commit,
        photos=photos,
    )


@router.post("/intakes/from-meal-photo-estimate", response_model=MealPhotoEstimateResponse)
async def intake_from_meal_photo_estimate(
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    description: Annotated[str | None, Form()] = None,
    answers_json: Annotated[str | None, Form()] = None,
    portion_size: Annotated[str | None, Form()] = None,
    has_added_fats: Annotated[bool | None, Form()] = None,
    quantity_note: Annotated[str | None, Form()] = None,
    adjust_percent: Annotated[int, Form()] = 0,
    commit: Annotated[bool, Form()] = False,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> MealPhotoEstimateResponse:
    _rate_limit(request, scope="meal_commit", limit=25, window_seconds=60, key_suffix=str(current_user.id))
    ai_credentials = _user_ai_provider_and_key(current_user, required=True)
    if not ai_credentials:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No AI credentials available",
        )
    _, api_key = ai_credentials

    photo_files = photos or []
    if not photo_files:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Adjunta al menos una foto.")

    resolved_description, normalized_portion, resolved_added_fats, resolved_quantity_note, answer_context = (
        _resolve_meal_inputs(
        description=description,
        answers_json=answers_json,
        portion_size=portion_size,
        has_added_fats=has_added_fats,
        quantity_note=quantity_note,
        )
    )
    normalized_adjust = max(-30, min(30, adjust_percent))
    try:
        result = await estimate_meal_with_ai(
            api_key=api_key,
            description=resolved_description,
            portion_size=normalized_portion,  # type: ignore[arg-type]
            has_added_fats=resolved_added_fats,
            quantity_note=resolved_quantity_note,
            photo_files=photo_files,
            adjust_percent=normalized_adjust,
            answers=answer_context,
        )
    except VisionAIError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    nutrition = result["nutrition"]  # type: ignore[assignment]
    preview_nutrients = {
        "kcal": float(nutrition["kcal"]),
        "protein_g": float(nutrition["protein_g"]),
        "fat_g": float(nutrition["fat_g"]),
        "sat_fat_g": float(nutrition.get("sat_fat_g") or 0.0),
        "carbs_g": float(nutrition["carbs_g"]),
        "sugars_g": float(nutrition.get("sugars_g") or 0.0),
        "fiber_g": float(nutrition.get("fiber_g") or 0.0),
        "salt_g": float(nutrition.get("salt_g") or 0.0),
    }

    response_base = {
        "saved": False,
        "model_used": result["model_used"],
        "confidence_level": result["confidence_level"],
        "analysis_method": result.get("analysis_method", "heuristic"),
        "assumptions": result["assumptions"],
        "questions": result["questions"],
        "question_items": result.get("question_items", []),
        "detected_ingredients": result["detected_ingredients"],
        "preview_nutrients": preview_nutrients,
        "intake": None,
    }
    if not commit:
        return MealPhotoEstimateResponse.model_validate(response_base)

    serving_size = {
        "small": 200.0,
        "medium": 280.0,
        "large": 360.0,
    }.get(normalized_portion or "medium", 280.0)
    if resolved_quantity_note:
        match = re.search(r"(\\d+(?:[\\.,]\\d+)?)", resolved_quantity_note)
        if match:
            try:
                qty_factor = float(match.group(1).replace(",", "."))
                serving_size = max(120.0, min(620.0, serving_size * max(0.5, min(qty_factor, 2.0))))
            except ValueError:
                pass

    product_name = (description or "").strip()
    if not product_name:
        product_name = "Comida estimada"

    product = Product(
        barcode=None,
        name=f"Estimación: {product_name[:72]}",
        brand=None,
        image_url=None,
        nutrition_basis=NutritionBasis.per_serving,
        serving_size_g=serving_size,
        net_weight_g=serving_size,
        kcal=preview_nutrients["kcal"],
        protein_g=preview_nutrients["protein_g"],
        fat_g=preview_nutrients["fat_g"],
        sat_fat_g=preview_nutrients["sat_fat_g"],
        carbs_g=preview_nutrients["carbs_g"],
        sugars_g=preview_nutrients["sugars_g"],
        fiber_g=preview_nutrients["fiber_g"],
        salt_g=preview_nutrients["salt_g"],
        source="photo_estimate",
        is_verified=False,
        verified_at=None,
        data_confidence=f"estimate_{result['confidence_level']}",
    )
    session.add(product)
    session.flush()

    intake = Intake(
        user_id=current_user.id,
        product_id=product.id,
        quantity_g=serving_size,
        quantity_units=1,
        percent_pack=None,
        method=IntakeMethod.units,
        estimated=True,
        estimate_confidence=result["confidence_level"],  # type: ignore[arg-type]
        user_description=resolved_description,
        source_method="meal_photo",
        created_at=datetime.now(UTC),
    )
    session.add(intake)
    session.commit()
    session.refresh(product)
    session.refresh(intake)

    nutrients = nutrients_for_quantity(product, serving_size)
    intake_payload = IntakeRead(
        id=intake.id,
        product_id=intake.product_id,
        product_name=product.name,
        method=intake.method,
        quantity_g=intake.quantity_g,
        quantity_units=intake.quantity_units,
        percent_pack=intake.percent_pack,
        created_at=intake.created_at,
        estimated=intake.estimated,
        estimate_confidence=intake.estimate_confidence,
        user_description=intake.user_description,
        source_method=intake.source_method,
        nutrients=nutrients,
    )

    response_base["saved"] = True
    response_base["intake"] = intake_payload
    return MealPhotoEstimateResponse.model_validate(response_base)


@router.get("/favorites/products", response_model=list[FavoriteProductRead])
def list_favorite_products(
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 60,
) -> list[FavoriteProductRead]:
    bounded_limit = max(1, min(limit, 200))
    rows = session.exec(
        select(UserFavoriteProduct, Product)
        .join(Product, Product.id == UserFavoriteProduct.product_id)
        .where(UserFavoriteProduct.user_id == current_user.id)
        .where(Product.is_hidden.is_(False))
        .order_by(desc(UserFavoriteProduct.created_at))
        .limit(bounded_limit)
    ).all()
    return [
        FavoriteProductRead(product=ProductRead.model_validate(product), created_at=favorite.created_at)
        for favorite, product in rows
    ]


@router.post("/favorites/products/{product_id}", response_model=FavoriteProductToggleResponse)
def add_favorite_product(
    product_id: int,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> FavoriteProductToggleResponse:
    product = session.get(Product, product_id)
    if not product or product.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    existing = session.exec(
        select(UserFavoriteProduct)
        .where(UserFavoriteProduct.user_id == current_user.id)
        .where(UserFavoriteProduct.product_id == product_id)
    ).first()
    if not existing:
        session.add(UserFavoriteProduct(user_id=current_user.id, product_id=product_id, created_at=datetime.now(UTC)))
        session.commit()
    return FavoriteProductToggleResponse(favorited=True, product_id=product_id)


@router.delete("/favorites/products/{product_id}", response_model=FavoriteProductToggleResponse)
def remove_favorite_product(
    product_id: int,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> FavoriteProductToggleResponse:
    existing = session.exec(
        select(UserFavoriteProduct)
        .where(UserFavoriteProduct.user_id == current_user.id)
        .where(UserFavoriteProduct.product_id == product_id)
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
    return FavoriteProductToggleResponse(favorited=False, product_id=product_id)


@router.post("/intakes/repeat-from-day/{from_day}", response_model=RepeatIntakesResponse)
def repeat_intakes_from_day(
    from_day: date,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    to_day: date | None = None,
) -> RepeatIntakesResponse:
    target_day = to_day or datetime.now(UTC).date()
    if from_day == target_day:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_day and to_day must be different",
        )

    source_start = datetime.combine(from_day, time.min).replace(tzinfo=UTC)
    source_end = datetime.combine(from_day + timedelta(days=1), time.min).replace(tzinfo=UTC)
    target_start = datetime.combine(target_day, time.min).replace(tzinfo=UTC)

    existing_target = session.exec(
        select(Intake)
        .where(Intake.user_id == current_user.id)
        .where(Intake.created_at >= target_start)
        .where(Intake.created_at < target_start + timedelta(days=1))
    ).all()
    if existing_target:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Target day already has intakes")

    source_intakes = session.exec(
        select(Intake)
        .where(Intake.user_id == current_user.id)
        .where(Intake.created_at >= source_start)
        .where(Intake.created_at < source_end)
        .order_by(Intake.created_at.asc())
    ).all()

    copied = 0
    for index, source in enumerate(source_intakes):
        session.add(
            Intake(
                user_id=current_user.id,
                product_id=source.product_id,
                quantity_g=source.quantity_g,
                quantity_units=source.quantity_units,
                percent_pack=source.percent_pack,
                method=source.method,
                estimated=source.estimated,
                estimate_confidence=source.estimate_confidence,
                user_description=source.user_description,
                source_method="repeat_day",
                created_at=target_start + timedelta(minutes=10 * index),
            )
        )
        copied += 1

    session.commit()
    return RepeatIntakesResponse(copied=copied, from_day=from_day, to_day=target_day)


@router.post("/intakes", response_model=IntakeRead)
def create_intake(
    payload: IntakeCreate,
    request: Request,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> IntakeRead:
    _rate_limit(request, scope="intake_create", limit=60, window_seconds=60, key_suffix=str(current_user.id))
    product = session.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    try:
        resolved_quantity_g = quantity_from_method(
            product=product,
            method=payload.method.value,
            quantity_g=payload.quantity_g,
            quantity_units=payload.quantity_units,
            percent_pack=payload.percent_pack,
        )
    except IntakeComputationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    intake = Intake(
        user_id=current_user.id,
        product_id=payload.product_id,
        quantity_g=resolved_quantity_g,
        quantity_units=payload.quantity_units,
        percent_pack=payload.percent_pack,
        method=payload.method,
        created_at=payload.created_at or datetime.now(UTC),
    )
    session.add(intake)

    preference = session.exec(
        select(UserProductPreference)
        .where(UserProductPreference.user_id == current_user.id)
        .where(UserProductPreference.product_id == payload.product_id)
    ).first()
    if preference is None:
        preference = UserProductPreference(
            user_id=current_user.id,
            product_id=payload.product_id,
            method=payload.method,
            quantity_g=payload.quantity_g,
            quantity_units=payload.quantity_units,
            percent_pack=payload.percent_pack,
            updated_at=datetime.now(UTC),
        )
        session.add(preference)
    else:
        preference.method = payload.method
        preference.quantity_g = payload.quantity_g
        preference.quantity_units = payload.quantity_units
        preference.percent_pack = payload.percent_pack
        preference.updated_at = datetime.now(UTC)

    session.commit()
    session.refresh(intake)

    nutrients = nutrients_for_quantity(product, resolved_quantity_g)
    return IntakeRead(
        id=intake.id,
        product_id=intake.product_id,
        product_name=product.name,
        method=intake.method,
        quantity_g=intake.quantity_g,
        quantity_units=intake.quantity_units,
        percent_pack=intake.percent_pack,
        created_at=intake.created_at,
        estimated=intake.estimated,
        estimate_confidence=intake.estimate_confidence,
        user_description=intake.user_description,
        source_method=intake.source_method,
        nutrients=nutrients,
    )


@router.delete("/intakes/{intake_id}", response_model=IntakeDeleteResponse)
def delete_intake(
    intake_id: int,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> IntakeDeleteResponse:
    intake = session.get(Intake, intake_id)
    if intake is None or intake.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intake not found")

    session.delete(intake)
    session.commit()
    return IntakeDeleteResponse(deleted=True, intake_id=intake_id)


def _day_summary(
    day: date,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DaySummary:
    start_dt = datetime.combine(day, time.min).replace(tzinfo=UTC)
    end_dt = datetime.combine(day + timedelta(days=1), time.min).replace(tzinfo=UTC)

    intakes = session.exec(
        select(Intake)
        .where(Intake.user_id == current_user.id)
        .where(Intake.created_at >= start_dt)
        .where(Intake.created_at < end_dt)
    ).all()

    consumed = zero_nutrients()
    rows: list[IntakeRead] = []
    product_cache: dict[int, Product] = {}

    for intake in intakes:
        product = product_cache.get(intake.product_id)
        if not product:
            product = session.get(Product, intake.product_id)
            if product:
                product_cache[intake.product_id] = product

        if not product or intake.quantity_g is None:
            continue

        nutrients = nutrients_for_quantity(product, intake.quantity_g)
        consumed = sum_nutrients(consumed, nutrients)
        rows.append(
            IntakeRead(
                id=intake.id,
                product_id=intake.product_id,
                product_name=product.name,
                method=intake.method,
                quantity_g=intake.quantity_g,
                quantity_units=intake.quantity_units,
                percent_pack=intake.percent_pack,
                created_at=intake.created_at,
                estimated=intake.estimated,
                estimate_confidence=intake.estimate_confidence,
                user_description=intake.user_description,
                source_method=intake.source_method,
                nutrients=nutrients,
            )
        )

    goal = session.exec(
        select(DailyGoal).where(DailyGoal.user_id == current_user.id).where(DailyGoal.date == day)
    ).first()

    goal_payload = None
    remaining = None
    if goal:
        goal_payload = DailyGoalUpsert(
            kcal_goal=goal.kcal_goal,
            protein_goal=goal.protein_goal,
            fat_goal=goal.fat_goal,
            carbs_goal=goal.carbs_goal,
        )
        remaining = remaining_from_goal(
            {
                "kcal": goal.kcal_goal,
                "protein_g": goal.protein_goal,
                "fat_g": goal.fat_goal,
                "carbs_g": goal.carbs_goal,
            },
            consumed,
        )

    water_rows = session.exec(
        select(WaterIntakeLog.ml)
        .where(WaterIntakeLog.user_id == current_user.id)
        .where(WaterIntakeLog.created_at >= start_dt)
        .where(WaterIntakeLog.created_at < end_dt)
    ).all()
    water_ml = int(sum(water_rows))

    return DaySummary(
        date=day,
        goal=goal_payload,
        consumed=consumed,
        remaining=remaining,
        intakes=rows,
        water_ml=water_ml,
    )


@router.get("/days/{day}/summary", response_model=DaySummary)
def day_summary(
    day: date,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DaySummary:
    return _day_summary(day=day, current_user=current_user, session=session)


@router.get("/days/{day}", response_model=DaySummary)
def day_summary_legacy(
    day: date,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DaySummary:
    return _day_summary(day=day, current_user=current_user, session=session)


@router.get("/widget/summary/today", response_model=WidgetTodaySummaryResponse)
def widget_today_summary(
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> WidgetTodaySummaryResponse:
    today = datetime.now(UTC).date()
    summary = _day_summary(day=today, current_user=current_user, session=session)

    latest_weight = session.exec(
        select(BodyWeightLog)
        .where(BodyWeightLog.user_id == current_user.id)
        .order_by(desc(BodyWeightLog.created_at))
    ).first()

    protein_goal = summary.goal.protein_goal if summary.goal else 0.0
    kcal_goal = summary.goal.kcal_goal if summary.goal else 0.0
    kcal_remaining = max(kcal_goal - summary.consumed.kcal, 0.0)

    return WidgetTodaySummaryResponse(
        date=today,
        kcal_remaining=round(kcal_remaining, 2),
        protein_consumed_g=round(summary.consumed.protein_g, 2),
        protein_goal_g=round(protein_goal, 2),
        water_ml=summary.water_ml,
        latest_weight_kg=latest_weight.weight_kg if latest_weight else None,
    )


@router.post("/goals/{day}", response_model=DailyGoalResponse)
def upsert_daily_goal(
    day: date,
    payload: DailyGoalUpsert,
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DailyGoalResponse:
    profile = _load_profile_or_404(session, current_user.id)

    existing = session.exec(
        select(DailyGoal).where(DailyGoal.user_id == current_user.id).where(DailyGoal.date == day)
    ).first()

    if existing:
        existing.kcal_goal = payload.kcal_goal
        existing.protein_goal = payload.protein_goal
        existing.fat_goal = payload.fat_goal
        existing.carbs_goal = payload.carbs_goal
    else:
        session.add(
            DailyGoal(
                user_id=current_user.id,
                date=day,
                kcal_goal=payload.kcal_goal,
                protein_goal=payload.protein_goal,
                fat_goal=payload.fat_goal,
                carbs_goal=payload.carbs_goal,
            )
        )

    if not current_user.onboarding_completed:
        current_user.onboarding_completed = True
        session.add(current_user)

    session.commit()

    recommended = recommended_goals(profile)
    feedback_payload = GoalFeedback(
        **goal_feedback(
            profile,
            payload.model_dump(),
            recommended,
        )
    )

    return DailyGoalResponse(
        kcal_goal=payload.kcal_goal,
        protein_goal=payload.protein_goal,
        fat_goal=payload.fat_goal,
        carbs_goal=payload.carbs_goal,
        feedback=feedback_payload,
    )


@router.get("/goals/{day}", response_model=DailyGoalResponse | None)
def get_daily_goal(
    day: date,
    current_user: Annotated[UserAccount, Depends(get_verified_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DailyGoalResponse | None:
    profile = _load_profile_or_404(session, current_user.id)
    goal = session.exec(
        select(DailyGoal).where(DailyGoal.user_id == current_user.id).where(DailyGoal.date == day)
    ).first()
    if not goal:
        return None

    recommended = recommended_goals(profile)
    feedback_payload = GoalFeedback(
        **goal_feedback(
            profile,
            {
                "kcal_goal": goal.kcal_goal,
                "protein_goal": goal.protein_goal,
                "fat_goal": goal.fat_goal,
                "carbs_goal": goal.carbs_goal,
            },
            recommended,
        )
    )

    return DailyGoalResponse(
        kcal_goal=goal.kcal_goal,
        protein_goal=goal.protein_goal,
        fat_goal=goal.fat_goal,
        carbs_goal=goal.carbs_goal,
        feedback=feedback_payload,
    )


@router.get("/calendar/{year_month}", response_model=CalendarMonthResponse)
def month_calendar(
    year_month: str,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> CalendarMonthResponse:
    if not MONTH_PATTERN.match(year_month):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid format. Use YYYY-MM")

    year, month = map(int, year_month.split("-"))
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    start_dt = datetime.combine(start_date, time.min).replace(tzinfo=UTC)
    end_dt = datetime.combine(end_date, time.min).replace(tzinfo=UTC)

    intakes = session.exec(
        select(Intake)
        .where(Intake.user_id == current_user.id)
        .where(Intake.created_at >= start_dt)
        .where(Intake.created_at < end_dt)
    ).all()

    stats: dict[date, dict[str, float]] = {}
    product_cache: dict[int, Product] = {}

    for intake in intakes:
        day = _to_utc(intake.created_at).date()
        bucket = stats.setdefault(day, {"count": 0, "kcal": 0.0})
        bucket["count"] += 1

        product = product_cache.get(intake.product_id)
        if not product:
            product = session.get(Product, intake.product_id)
            if product:
                product_cache[intake.product_id] = product

        if product and intake.quantity_g is not None:
            nutrients = nutrients_for_quantity(product, intake.quantity_g)
            bucket["kcal"] = round(bucket["kcal"] + nutrients["kcal"], 2)

    days = [
        CalendarDayEntry(date=entry_day, intake_count=int(values["count"]), kcal=float(values["kcal"]))
        for entry_day, values in sorted(stats.items(), key=lambda item: item[0])
    ]

    return CalendarMonthResponse(month=year_month, days=days)
