from __future__ import annotations

import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from sqlmodel import Session, desc, select

from app.config import get_settings
from app.database import get_session
from app.models import (
    BodyMeasurementLog,
    BodyWeightLog,
    DailyGoal,
    EmailOTP,
    Intake,
    IntakeMethod,
    NutritionBasis,
    Product,
    UserAccount,
    UserProductPreference,
    UserProfile,
)
from app.schemas import (
    AuthResponse,
    AuthUser,
    BodyMeasurementLogCreate,
    BodyMeasurementLogRead,
    BodySummaryResponse,
    BodyTrendPoint,
    BodyWeightLogCreate,
    BodyWeightLogRead,
    CalendarDayEntry,
    CalendarMonthResponse,
    DailyGoalResponse,
    DailyGoalUpsert,
    DaySummary,
    GoalFeedback,
    IntakeCreate,
    IntakeRead,
    LabelPhotoResponse,
    LoginRequest,
    MealEstimateQuestionsResponse,
    MealPhotoEstimateResponse,
    MeResponse,
    NutritionExtract,
    ProductCorrectionResponse,
    ProductLookupResponse,
    ProductPreference,
    ProductRead,
    ProfileAnalysisResponse,
    ProfileInput,
    ProfileRead,
    RegisterRequest,
    RegisterResponse,
    ResendCodeRequest,
    VerifyRequest,
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
    weekly_weight_change,
)
from app.services.email import EmailSendError, send_verification_email
from app.services.meal_estimate import estimate_meal
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
from app.services.openfoodfacts import OpenFoodFactsClientError, fetch_openfoodfacts_product
from app.services.openfoodfacts import (
    missing_critical_fields as off_missing_critical_fields,
)

router = APIRouter()

EAN_PATTERN = re.compile(r"^\d{8,14}$")
MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")
OTP_MAX_ATTEMPTS = 5


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


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
    session: Annotated[Session, Depends(get_session)],
) -> RegisterResponse:
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
    session: Annotated[Session, Depends(get_session)],
) -> RegisterResponse:
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
    session: Annotated[Session, Depends(get_session)],
) -> AuthResponse:
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
    session: Annotated[Session, Depends(get_session)],
) -> AuthResponse:
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
    del current_user
    image_url_clean = image_url.strip() if image_url and image_url.strip() else None

    photo_files = photos or []
    extracted_text = (label_text or "").strip()
    if not extracted_text and photo_files:
        extracted_text = await ocr_text_from_images(photo_files)

    extracted = extract_nutrition_from_text(extracted_text, basis_hint=nutrition_basis)
    extracted["serving_size_g"] = extracted.get("serving_size_g") or serving_size_g

    missing_fields = missing_critical_fields(extracted)
    questions = coherence_questions(extracted)

    if not extracted_text:
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
    extracted_text = (label_text or "").strip()
    photo_files = photos or []
    if not extracted_text and photo_files:
        extracted_text = await ocr_text_from_images(photo_files)

    extracted = extract_nutrition_from_text(extracted_text, basis_hint=nutrition_basis)
    extracted["serving_size_g"] = extracted.get("serving_size_g") or serving_size_g
    extracted["net_weight_g"] = net_weight_g if net_weight_g is not None else product.net_weight_g

    missing_fields = missing_critical_fields(extracted)
    questions = coherence_questions(extracted)

    if not extracted_text:
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
    del current_user
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    return await _correct_product_from_label_impl(
        product=product,
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
    del current_user
    code = barcode.strip()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="barcode is required")

    product = session.exec(select(Product).where(Product.barcode == code)).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found for barcode")

    return await _correct_product_from_label_impl(
        product=product,
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
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    description: Annotated[str, Form()],
    portion_size: Annotated[str | None, Form()] = None,
    has_added_fats: Annotated[bool | None, Form()] = None,
    quantity_note: Annotated[str | None, Form()] = None,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> MealEstimateQuestionsResponse:
    del current_user
    normalized_portion = portion_size if portion_size in {"small", "medium", "large"} else None
    result = estimate_meal(
        description=description,
        portion_size=normalized_portion,  # type: ignore[arg-type]
        has_added_fats=has_added_fats,
        quantity_note=quantity_note,
        photo_count=len(photos or []),
        adjust_percent=0,
    )
    return MealEstimateQuestionsResponse(
        questions=result["questions"],  # type: ignore[arg-type]
        assumptions=result["assumptions"],  # type: ignore[arg-type]
        detected_ingredients=result["detected_ingredients"],  # type: ignore[arg-type]
    )


@router.post("/intakes/from-meal-photo-estimate", response_model=MealPhotoEstimateResponse)
async def intake_from_meal_photo_estimate(
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
    description: Annotated[str, Form()],
    portion_size: Annotated[str | None, Form()] = None,
    has_added_fats: Annotated[bool | None, Form()] = None,
    quantity_note: Annotated[str | None, Form()] = None,
    adjust_percent: Annotated[int, Form()] = 0,
    commit: Annotated[bool, Form()] = False,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> MealPhotoEstimateResponse:
    normalized_portion = portion_size if portion_size in {"small", "medium", "large"} else None
    normalized_adjust = max(-30, min(30, adjust_percent))
    result = estimate_meal(
        description=description,
        portion_size=normalized_portion,  # type: ignore[arg-type]
        has_added_fats=has_added_fats,
        quantity_note=quantity_note,
        photo_count=len(photos or []),
        adjust_percent=normalized_adjust,
    )

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
        "confidence_level": result["confidence_level"],
        "assumptions": result["assumptions"],
        "questions": result["questions"],
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
    if quantity_note:
        match = re.search(r"(\\d+(?:[\\.,]\\d+)?)", quantity_note)
        if match:
            try:
                qty_factor = float(match.group(1).replace(",", "."))
                serving_size = max(120.0, min(620.0, serving_size * max(0.5, min(qty_factor, 2.0))))
            except ValueError:
                pass

    product_name = description.strip()
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
        user_description=description.strip(),
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


@router.post("/intakes", response_model=IntakeRead)
def create_intake(
    payload: IntakeCreate,
    current_user: Annotated[UserAccount, Depends(get_ready_user)],
    session: Annotated[Session, Depends(get_session)],
) -> IntakeRead:
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

    return DaySummary(date=day, goal=goal_payload, consumed=consumed, remaining=remaining, intakes=rows)


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
