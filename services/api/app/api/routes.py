from __future__ import annotations

import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from sqlmodel import Session, desc, select

from app.config import get_settings
from app.database import get_session
from app.models import (
    DailyGoal,
    EmailVerificationCode,
    Intake,
    NutritionBasis,
    Product,
    UserAccount,
    UserProfile,
)
from app.schemas import (
    AuthResponse,
    CalendarDayEntry,
    CalendarMonthResponse,
    DailyGoalResponse,
    DailyGoalUpsert,
    DaySummary,
    EmailRequest,
    GoalFeedback,
    IntakeCreate,
    IntakeRead,
    LabelPhotoResponse,
    LoginRequest,
    NutritionExtract,
    ProductLookupResponse,
    ProductRead,
    ProfileAnalysisResponse,
    ProfileRead,
    ProfileUpdate,
    RegisterRequest,
    RegisterResponse,
    UserRead,
    VerifyEmailRequest,
)
from app.services.auth import (
    AuthTokenError,
    create_access_token,
    create_verification_code,
    hash_password,
    validate_email_format,
    verify_access_token,
    verify_password,
)
from app.services.body_metrics import (
    bmi,
    bmi_category,
    body_fat_category,
    body_fat_percent,
    goal_feedback,
    recommended_goals,
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
from app.services.openfoodfacts import OpenFoodFactsClientError, fetch_openfoodfacts_product
from app.services.openfoodfacts import (
    missing_critical_fields as off_missing_critical_fields,
)

router = APIRouter()

EAN_PATTERN = re.compile(r"^\d{8,14}$")
MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")


def _profile_to_read(profile: UserProfile) -> ProfileRead:
    bmi_value = bmi(profile.weight_kg, profile.height_cm)
    bmi_label, bmi_color = bmi_category(bmi_value)

    body_fat_value = body_fat_percent(profile)
    body_fat_label, body_fat_color = body_fat_category(body_fat_value, profile.sex)

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
        body_fat_percent=body_fat_value,
        body_fat_category=body_fat_label,
        body_fat_color=body_fat_color,
    )


def _load_profile_or_404(session: Session, user_id: int) -> UserProfile:
    profile = session.get(UserProfile, user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil no encontrado")
    return profile


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def get_current_user(
    session: Annotated[Session, Depends(get_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> UserAccount:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Falta header Authorization")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization inválido")

    try:
        payload = verify_access_token(token)
    except AuthTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user = session.get(UserAccount, payload["uid"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no existe")

    return user


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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email inválido")

    existing = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya registrado")

    try:
        password_hash = hash_password(payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    user = UserAccount(email=email, password_hash=password_hash, is_verified=False)
    session.add(user)
    session.flush()

    profile = UserProfile(
        user_id=user.id,
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
    )
    session.add(profile)

    settings = get_settings()
    code = create_verification_code()
    verification = EmailVerificationCode(
        user_id=user.id,
        code=code,
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.verification_code_ttl_minutes),
    )
    session.add(verification)
    session.commit()

    message = "Cuenta creada. Revisa tu correo para verificar el código."
    try:
        sent = send_verification_email(email, code)
    except EmailSendError:
        sent = False

    if not sent:
        message = "Cuenta creada. Correo no configurado; usa código de verificación temporal."

    return RegisterResponse(
        user_id=user.id,
        email=email,
        verification_required=True,
        message=message,
        debug_verification_code=code if settings.expose_verification_code else None,
    )


@router.post("/auth/resend-code", response_model=RegisterResponse)
def resend_code(
    payload: EmailRequest,
    session: Annotated[Session, Depends(get_session)],
) -> RegisterResponse:
    email = payload.email.strip().lower()
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    settings = get_settings()
    code = create_verification_code()
    verification = EmailVerificationCode(
        user_id=user.id,
        code=code,
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.verification_code_ttl_minutes),
    )
    session.add(verification)
    session.commit()

    message = "Nuevo código generado."
    try:
        sent = send_verification_email(email, code)
    except EmailSendError:
        sent = False

    if not sent:
        message = "SMTP no configurado; usa código temporal mostrado por el backend."

    return RegisterResponse(
        user_id=user.id,
        email=email,
        verification_required=True,
        message=message,
        debug_verification_code=code if settings.expose_verification_code else None,
    )


@router.post("/auth/verify-email", response_model=AuthResponse)
def verify_email(
    payload: VerifyEmailRequest,
    session: Annotated[Session, Depends(get_session)],
) -> AuthResponse:
    email = payload.email.strip().lower()
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    statement = (
        select(EmailVerificationCode)
        .where(EmailVerificationCode.user_id == user.id)
        .where(EmailVerificationCode.used_at.is_(None))
        .order_by(desc(EmailVerificationCode.created_at))
    )
    record = session.exec(statement).first()

    if not record or record.code != payload.code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código inválido")
    if _to_utc(record.expires_at) < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código expirado")

    user.is_verified = True
    record.used_at = datetime.now(UTC)
    session.commit()

    profile = _load_profile_or_404(session, user.id)
    token = create_access_token(user.id, user.email)

    return AuthResponse(
        access_token=token,
        user=UserRead(id=user.id, email=user.email, is_verified=user.is_verified),
        profile=_profile_to_read(profile),
    )


@router.post("/auth/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    session: Annotated[Session, Depends(get_session)],
) -> AuthResponse:
    email = payload.email.strip().lower()
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Debes verificar tu email")

    profile = _load_profile_or_404(session, user.id)
    token = create_access_token(user.id, user.email)

    return AuthResponse(
        access_token=token,
        user=UserRead(id=user.id, email=user.email, is_verified=user.is_verified),
        profile=_profile_to_read(profile),
    )


@router.get("/me/profile", response_model=ProfileRead)
def me_profile(
    current_user: Annotated[UserAccount, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ProfileRead:
    profile = _load_profile_or_404(session, current_user.id)
    return _profile_to_read(profile)


@router.put("/me/profile", response_model=ProfileRead)
def upsert_profile(
    payload: ProfileUpdate,
    current_user: Annotated[UserAccount, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ProfileRead:
    profile = session.get(UserProfile, current_user.id)

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

    session.commit()
    session.refresh(profile)
    return _profile_to_read(profile)


@router.get("/me/analysis", response_model=ProfileAnalysisResponse)
def me_analysis(
    current_user: Annotated[UserAccount, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    day: date | None = None,
) -> ProfileAnalysisResponse:
    profile = _load_profile_or_404(session, current_user.id)
    profile_read = _profile_to_read(profile)

    recommended = recommended_goals(profile)
    recommendation_payload = DailyGoalUpsert(**recommended)

    target_day = day or datetime.now(UTC).date()
    goal_statement = (
        select(DailyGoal)
        .where(DailyGoal.user_id == current_user.id)
        .where(DailyGoal.date == target_day)
    )
    current_goal = session.exec(goal_statement).first()

    feedback = None
    if current_goal:
        feedback = GoalFeedback(
            **goal_feedback(
                profile,
                {
                    "kcal_goal": current_goal.kcal_goal,
                    "protein_goal": current_goal.protein_goal,
                    "fat_goal": current_goal.fat_goal,
                    "carbs_goal": current_goal.carbs_goal,
                },
                recommended,
            )
        )

    return ProfileAnalysisResponse(
        profile=profile_read,
        recommended_goal=recommendation_payload,
        goal_feedback_today=feedback,
    )


@router.get("/products/by_barcode/{ean}", response_model=ProductLookupResponse)
async def product_by_barcode(
    ean: str,
    session: Annotated[Session, Depends(get_session)],
) -> ProductLookupResponse:
    if not EAN_PATTERN.match(ean):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EAN/UPC inválido")

    local = session.exec(select(Product).where(Product.barcode == ean)).first()
    if local:
        return ProductLookupResponse(source="local", product=ProductRead.model_validate(local))

    try:
        off_product = await fetch_openfoodfacts_product(ean)
    except OpenFoodFactsClientError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    if off_product is None:
        return ProductLookupResponse(
            source="not_found",
            message="Producto no encontrado en base local ni en OpenFoodFacts",
        )

    missing = off_missing_critical_fields(off_product)
    if missing:
        return ProductLookupResponse(
            source="openfoodfacts_incomplete",
            missing_fields=missing,
            message="OpenFoodFacts no trae nutrición suficiente. Captura foto de etiqueta.",
        )

    product = Product(
        barcode=ean,
        name=off_product["name"],
        brand=off_product.get("brand"),
        nutrition_basis=off_product["nutrition_basis"],
        serving_size_g=off_product.get("serving_size_g"),
        net_weight_g=off_product.get("net_weight_g"),
        kcal=off_product["kcal"],
        protein_g=off_product["protein_g"],
        fat_g=off_product["fat_g"],
        sat_fat_g=off_product.get("sat_fat_g"),
        carbs_g=off_product["carbs_g"],
        sugars_g=off_product.get("sugars_g"),
        fiber_g=off_product.get("fiber_g"),
        salt_g=off_product.get("salt_g"),
        data_confidence="openfoodfacts",
    )
    session.add(product)
    session.commit()
    session.refresh(product)

    return ProductLookupResponse(
        source="openfoodfacts_imported",
        product=ProductRead.model_validate(product),
    )


@router.post("/products/from_label_photo", response_model=LabelPhotoResponse)
async def create_product_from_label_photo(
    session: Annotated[Session, Depends(get_session)],
    barcode: Annotated[str | None, Form()] = None,
    name: Annotated[str | None, Form()] = None,
    brand: Annotated[str | None, Form()] = None,
    nutrition_basis: Annotated[NutritionBasis | None, Form()] = None,
    serving_size_g: Annotated[float | None, Form()] = None,
    net_weight_g: Annotated[float | None, Form()] = None,
    label_text: Annotated[str | None, Form()] = None,
    photos: Annotated[list[UploadFile] | None, File()] = None,
) -> LabelPhotoResponse:
    photo_files = photos or []
    extracted_text = (label_text or "").strip()
    if not extracted_text and photo_files:
        extracted_text = await ocr_text_from_images(photo_files)

    extracted = extract_nutrition_from_text(extracted_text, basis_hint=nutrition_basis)
    extracted["serving_size_g"] = extracted.get("serving_size_g") or serving_size_g

    missing_fields = missing_critical_fields(extracted)
    questions = coherence_questions(extracted)

    if not extracted_text:
        questions.insert(
            0,
            "No pude extraer texto de la etiqueta. Sube una foto más nítida o pega el texto OCR.",
        )

    if not name:
        questions.append("Falta el nombre del producto.")

    if missing_fields:
        for field in missing_fields:
            questions.append(f"Falta {field}. ¿Puedes confirmarlo manualmente?")

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
        existing.data_confidence = "label_photo"
        product = existing
    else:
        product = Product(
            barcode=barcode,
            name=name,
            brand=brand,
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
            data_confidence="label_photo",
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


@router.post("/intakes", response_model=IntakeRead)
def create_intake(
    payload: IntakeCreate,
    current_user: Annotated[UserAccount, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> IntakeRead:
    product = session.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    try:
        resolved_quantity_g = quantity_from_method(
            product=product,
            method=payload.method.value,
            quantity_g=payload.quantity_g,
            quantity_units=payload.quantity_units,
            percent_pack=payload.percent_pack,
        )
    except IntakeComputationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

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
        nutrients=nutrients,
    )


@router.get("/days/{day}/summary", response_model=DaySummary)
def day_summary(
    day: date,
    current_user: Annotated[UserAccount, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DaySummary:
    start_dt = datetime.combine(day, time.min).replace(tzinfo=UTC)
    end_dt = datetime.combine(day + timedelta(days=1), time.min).replace(tzinfo=UTC)

    statement = (
        select(Intake)
        .where(Intake.user_id == current_user.id)
        .where(Intake.created_at >= start_dt)
        .where(Intake.created_at < end_dt)
    )
    intakes = session.exec(statement).all()

    consumed = zero_nutrients()
    intake_rows: list[IntakeRead] = []
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
        intake_rows.append(
            IntakeRead(
                id=intake.id,
                product_id=intake.product_id,
                product_name=product.name,
                method=intake.method,
                quantity_g=intake.quantity_g,
                quantity_units=intake.quantity_units,
                percent_pack=intake.percent_pack,
                created_at=intake.created_at,
                nutrients=nutrients,
            )
        )

    goal = session.exec(
        select(DailyGoal)
        .where(DailyGoal.user_id == current_user.id)
        .where(DailyGoal.date == day)
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

    return DaySummary(
        date=day,
        goal=goal_payload,
        consumed=consumed,
        remaining=remaining,
        intakes=intake_rows,
    )


@router.post("/goals/{day}", response_model=DailyGoalResponse)
def upsert_daily_goal(
    day: date,
    payload: DailyGoalUpsert,
    current_user: Annotated[UserAccount, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DailyGoalResponse:
    existing = session.exec(
        select(DailyGoal)
        .where(DailyGoal.user_id == current_user.id)
        .where(DailyGoal.date == day)
    ).first()

    if existing:
        existing.kcal_goal = payload.kcal_goal
        existing.protein_goal = payload.protein_goal
        existing.fat_goal = payload.fat_goal
        existing.carbs_goal = payload.carbs_goal
    else:
        existing = DailyGoal(
            user_id=current_user.id,
            date=day,
            kcal_goal=payload.kcal_goal,
            protein_goal=payload.protein_goal,
            fat_goal=payload.fat_goal,
            carbs_goal=payload.carbs_goal,
        )
        session.add(existing)

    session.commit()

    profile = _load_profile_or_404(session, current_user.id)
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


@router.get("/calendar/{year_month}", response_model=CalendarMonthResponse)
def month_calendar(
    year_month: str,
    current_user: Annotated[UserAccount, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> CalendarMonthResponse:
    if not MONTH_PATTERN.match(year_month):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato inválido. Usa YYYY-MM")

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
        day = intake.created_at.astimezone(UTC).date()
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
        CalendarDayEntry(
            date=day,
            intake_count=int(values["count"]),
            kcal=float(values["kcal"]),
        )
        for day, values in sorted(stats.items(), key=lambda item: item[0])
    ]

    return CalendarMonthResponse(month=year_month, days=days)
