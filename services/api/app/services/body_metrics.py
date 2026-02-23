from __future__ import annotations

import math

from app.models import ActivityLevel, GoalType, Sex, UserProfile


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
