from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from app.models import ActivityLevel, BodyWeightLog, GoalType, Sex, UserProfile


def bmi(weight_kg: float, height_cm: float) -> float:
    return round(weight_kg / ((height_cm / 100) ** 2), 2)


def bmi_category(value: float) -> tuple[str, str]:
    if value < 18.5:
        return "underweight", "#60a5fa"
    if value < 25:
        return "normal", "#34d399"
    if value < 30:
        return "overweight", "#fbbf24"
    return "obesity", "#f87171"


def _to_inches(value_cm: float) -> float:
    return value_cm / 2.54


def body_fat_percent(profile: UserProfile) -> float | None:
    if profile.sex == Sex.male:
        if profile.waist_cm is None or profile.neck_cm is None:
            return None

        waist = _to_inches(profile.waist_cm)
        neck = _to_inches(profile.neck_cm)
        height = _to_inches(profile.height_cm)

        if waist <= neck:
            return None

        result = 495 / (1.0324 - 0.19077 * math.log10(waist - neck) + 0.15456 * math.log10(height)) - 450
        return round(max(result, 2.0), 2)

    if profile.sex == Sex.female:
        if profile.waist_cm is None or profile.neck_cm is None or profile.hip_cm is None:
            return None

        waist = _to_inches(profile.waist_cm)
        neck = _to_inches(profile.neck_cm)
        hip = _to_inches(profile.hip_cm)
        height = _to_inches(profile.height_cm)

        if waist + hip <= neck:
            return None

        result = (
            495
            / (1.29579 - 0.35004 * math.log10(waist + hip - neck) + 0.22100 * math.log10(height))
            - 450
        )
        return round(max(result, 5.0), 2)

    return None


def body_fat_category(percent: float | None, sex: Sex) -> tuple[str, str]:
    if percent is None:
        return "unknown", "#94a3b8"

    if sex == Sex.male:
        if percent < 6:
            return "essential", "#60a5fa"
        if percent < 14:
            return "athlete", "#34d399"
        if percent < 18:
            return "fitness", "#22c55e"
        if percent < 25:
            return "acceptable", "#fbbf24"
        return "high", "#f87171"

    if sex == Sex.female:
        if percent < 14:
            return "essential", "#60a5fa"
        if percent < 21:
            return "athlete", "#34d399"
        if percent < 25:
            return "fitness", "#22c55e"
        if percent < 32:
            return "acceptable", "#fbbf24"
        return "high", "#f87171"

    if percent < 15:
        return "low", "#60a5fa"
    if percent < 25:
        return "normal", "#34d399"
    return "high", "#f87171"


def activity_factor(level: ActivityLevel) -> float:
    return {
        ActivityLevel.sedentary: 1.2,
        ActivityLevel.light: 1.375,
        ActivityLevel.moderate: 1.55,
        ActivityLevel.active: 1.725,
        ActivityLevel.athlete: 1.9,
    }[level]


def bmr(profile: UserProfile) -> float:
    age = profile.age or 30
    base = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * age

    if profile.sex == Sex.male:
        return base + 5
    if profile.sex == Sex.female:
        return base - 161
    return base - 78


def recommended_goals(profile: UserProfile) -> dict[str, float]:
    maintenance = bmr(profile) * activity_factor(profile.activity_level)

    if profile.goal_type == GoalType.lose:
        target_kcal = maintenance * 0.82
        protein_per_kg = 2.0
    elif profile.goal_type == GoalType.gain:
        target_kcal = maintenance * 1.1
        protein_per_kg = 1.7
    else:
        target_kcal = maintenance
        protein_per_kg = 1.8

    protein_goal = profile.weight_kg * protein_per_kg
    fat_goal = profile.weight_kg * 0.8
    carbs_goal = max((target_kcal - protein_goal * 4 - fat_goal * 9) / 4, profile.weight_kg * 1.2)

    return {
        "kcal_goal": round(target_kcal),
        "protein_goal": round(protein_goal, 1),
        "fat_goal": round(fat_goal, 1),
        "carbs_goal": round(carbs_goal, 1),
    }


def recommended_weekly_weight_change(goal_type: GoalType) -> float:
    if goal_type == GoalType.lose:
        return -0.35
    if goal_type == GoalType.gain:
        return 0.25
    return 0.0


def suggested_kcal_adjustment(
    *,
    weekly_weight_delta: float | None,
    goal_type: GoalType,
    max_abs_adjustment: float = 350.0,
) -> float | None:
    if weekly_weight_delta is None:
        return None

    target_delta = recommended_weekly_weight_change(goal_type)
    delta_error = weekly_weight_delta - target_delta

    # Avoid noisy micro-adjustments around target.
    if abs(delta_error) < 0.08:
        return 0.0

    # ~1100 kcal/day per 1kg/week difference.
    adjustment = -delta_error * 1100.0
    adjustment = max(-max_abs_adjustment, min(max_abs_adjustment, adjustment))
    return round(adjustment, 1)


def goal_feedback(profile: UserProfile, goal: dict[str, float], recommended: dict[str, float]) -> dict[str, object]:
    notes: list[str] = []

    recommended_kcal = recommended["kcal_goal"]
    kcal = goal["kcal_goal"]
    kcal_delta = (kcal - recommended_kcal) / max(recommended_kcal, 1)

    if kcal_delta < -0.2:
        notes.append("Calories too low for your profile (>20% below recommendation).")
    elif kcal_delta > 0.2:
        notes.append("Calories too high for your profile (>20% above recommendation).")

    protein_per_kg = goal["protein_goal"] / profile.weight_kg
    if protein_per_kg < 1.2:
        notes.append("Protein is low. Aim for at least 1.2 g/kg.")
    elif protein_per_kg > 2.7:
        notes.append("Protein is very high for daily intake (>2.7 g/kg).")

    fat_per_kg = goal["fat_goal"] / profile.weight_kg
    if fat_per_kg < 0.5:
        notes.append("Fat is low. Keep at least 0.5 g/kg.")

    realistic = len(notes) == 0
    if realistic:
        notes.append("Goal looks realistic for your current profile.")

    return {
        "realistic": realistic,
        "notes": notes,
    }


def average_weight(logs: Sequence[BodyWeightLog], start: datetime, end: datetime) -> float | None:
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    values = [row.weight_kg for row in logs if start <= _as_utc(row.created_at) < end]
    if not values:
        return None
    return round(sum(values) / len(values), 3)


def weekly_weight_change(logs: Sequence[BodyWeightLog], now: datetime | None = None) -> float | None:
    now_utc = now or datetime.now(UTC)
    current_start = now_utc - timedelta(days=7)
    previous_start = now_utc - timedelta(days=14)

    current_avg = average_weight(logs, current_start, now_utc)
    previous_avg = average_weight(logs, previous_start, current_start)
    if current_avg is None or previous_avg is None:
        return None
    return round(current_avg - previous_avg, 3)


def rolling_weight_points(logs: Sequence[BodyWeightLog], days: int = 56) -> list[dict[str, float | str]]:
    if not logs:
        return []

    cutoff = datetime.now(UTC) - timedelta(days=days)
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    sorted_logs = sorted([row for row in logs if _as_utc(row.created_at) >= cutoff], key=lambda row: row.created_at)
    points: list[dict[str, float | str]] = []
    for row in sorted_logs:
        points.append({"date": row.created_at.date().isoformat(), "weight_kg": round(row.weight_kg, 2)})
    return points


def should_prompt_weight_log(last_weight_log_at: datetime | None, now: datetime | None = None) -> bool:
    if last_weight_log_at is None:
        return True
    now_utc = now or datetime.now(UTC)
    if last_weight_log_at.tzinfo is None:
        last_weight_log_at = last_weight_log_at.replace(tzinfo=UTC)
    else:
        last_weight_log_at = last_weight_log_at.astimezone(UTC)
    return (now_utc - last_weight_log_at).days >= 7


def coach_hints(
    *,
    consumed_kcal: float,
    kcal_goal: float | None,
    consumed_protein_g: float,
    protein_goal: float | None,
    has_intakes_today: bool,
    current_time: datetime | None = None,
    weekly_weight_delta: float | None = None,
    latest_weight_kg: float | None = None,
    goal_type: GoalType | None = None,
    weekly_weight_goal_kg: float | None = None,
) -> list[str]:
    notes: list[str] = []

    if kcal_goal and kcal_goal > 0 and consumed_kcal > kcal_goal * 1.15:
        notes.append("Kcal por encima del 115% del objetivo diario.")

    if protein_goal and protein_goal > 0 and consumed_protein_g < protein_goal * 0.7:
        notes.append("Proteína por debajo del 70% del objetivo diario.")

    now = current_time or datetime.now(UTC)
    if now.hour >= 18 and not has_intakes_today:
        notes.append("No hay registros hoy. Añade tus comidas para mantener la adherencia.")

    if weekly_weight_delta is not None and latest_weight_kg and latest_weight_kg > 0:
        weekly_percent = abs(weekly_weight_delta) / latest_weight_kg
        if weekly_weight_delta < 0 and weekly_percent > 0.01:
            notes.append("Tu peso baja >1% por semana. Considera subir kcal ligeramente.")

    if goal_type is not None and weekly_weight_delta is not None:
        expected_delta = recommended_weekly_weight_change(goal_type)
        if goal_type == GoalType.maintain and abs(weekly_weight_delta) > 0.25:
            notes.append("Tu peso se mueve más de lo esperado para mantenimiento.")
        elif goal_type == GoalType.lose and weekly_weight_delta > -0.1:
            notes.append("Pérdida de peso lenta. Revisa adherencia o reduce kcal ligeramente.")
        elif goal_type == GoalType.gain and weekly_weight_delta < 0.05:
            notes.append("Ganancia de peso lenta. Podrías subir kcal ligeramente.")
        elif abs(weekly_weight_delta - expected_delta) <= 0.1:
            notes.append("Tu tendencia de peso va en línea con el objetivo.")

    if weekly_weight_goal_kg is not None:
        notes.append(f"Objetivo semanal configurado: {weekly_weight_goal_kg:.2f} kg.")

    return notes
