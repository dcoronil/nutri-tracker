from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.services.nutrition import sanitize_numeric_values

ConfidenceLevel = Literal["high", "medium", "low"]
PortionSize = Literal["small", "medium", "large"]
AppLocale = Literal["es", "en"]


@dataclass(frozen=True)
class IngredientProfile:
    keywords: tuple[str, ...]
    kcal: float
    protein_g: float
    fat_g: float
    carbs_g: float
    sugars_g: float
    fiber_g: float


INGREDIENTS: tuple[IngredientProfile, ...] = (
    IngredientProfile(("pollo", "chicken"), kcal=220, protein_g=30, fat_g=8, carbs_g=0, sugars_g=0, fiber_g=0),
    IngredientProfile(("arroz", "rice"), kcal=190, protein_g=4, fat_g=1, carbs_g=41, sugars_g=0.2, fiber_g=0.6),
    IngredientProfile(("pasta",), kcal=230, protein_g=8, fat_g=2, carbs_g=44, sugars_g=2, fiber_g=2),
    IngredientProfile(
        ("patata", "potato", "fries"),
        kcal=210,
        protein_g=4,
        fat_g=8,
        carbs_g=30,
        sugars_g=1.1,
        fiber_g=3,
    ),
    IngredientProfile(("ternera", "beef"), kcal=250, protein_g=26, fat_g=16, carbs_g=0, sugars_g=0, fiber_g=0),
    IngredientProfile(("huevo", "egg"), kcal=140, protein_g=12, fat_g=10, carbs_g=1, sugars_g=1, fiber_g=0),
    IngredientProfile(("pan", "bread", "tost"), kcal=160, protein_g=5, fat_g=2, carbs_g=30, sugars_g=3, fiber_g=2),
    IngredientProfile(("queso", "cheese"), kcal=160, protein_g=10, fat_g=13, carbs_g=1, sugars_g=0.3, fiber_g=0),
    IngredientProfile(("atun", "atún", "tuna"), kcal=150, protein_g=30, fat_g=2, carbs_g=0, sugars_g=0, fiber_g=0),
    IngredientProfile(
        ("salmon", "salmón", "salmon"),
        kcal=240,
        protein_g=24,
        fat_g=16,
        carbs_g=0,
        sugars_g=0,
        fiber_g=0,
    ),
    IngredientProfile(
        ("ensalada", "salad", "verdura", "vegetable"),
        kcal=90,
        protein_g=3,
        fat_g=2,
        carbs_g=13,
        sugars_g=4,
        fiber_g=4,
    ),
    IngredientProfile(
        ("mayonesa", "mayonnaise", "salsa", "sauce"),
        kcal=120,
        protein_g=0.5,
        fat_g=12,
        carbs_g=2,
        sugars_g=1,
        fiber_g=0,
    ),
)

PORTION_MULTIPLIER: dict[str, float] = {
    "small": 0.85,
    "medium": 1.0,
    "large": 1.25,
}

DEFAULT_BASE = {
    "kcal": 420.0,
    "protein_g": 20.0,
    "fat_g": 16.0,
    "carbs_g": 44.0,
    "sugars_g": 6.0,
    "fiber_g": 4.0,
    "salt_g": 1.2,
}

INGREDIENT_LABEL_EN: dict[str, str] = {
    "pollo": "chicken",
    "arroz": "rice",
    "pasta": "pasta",
    "patata": "potato",
    "ternera": "beef",
    "huevo": "egg",
    "pan": "bread",
    "queso": "cheese",
    "atun": "tuna",
    "salmon": "salmon",
    "ensalada": "salad",
    "mayonesa": "mayonnaise",
}


def _confidence_level(score: int) -> ConfidenceLevel:
    if score >= 6:
        return "high"
    if score >= 4:
        return "medium"
    return "low"


def _extract_quantity_multiplier(quantity_note: str | None) -> float:
    if not quantity_note:
        return 1.0

    match = re.search(r"(\d+(?:[\.,]\d+)?)", quantity_note)
    if not match:
        return 1.0

    try:
        value = float(match.group(1).replace(",", "."))
    except ValueError:
        return 1.0

    if value <= 0:
        return 1.0

    return min(max(value, 0.5), 2.0)


def estimate_meal(
    *,
    description: str,
    portion_size: PortionSize | None,
    has_added_fats: bool | None,
    quantity_note: str | None,
    photo_count: int,
    adjust_percent: int = 0,
    locale: AppLocale = "es",
) -> dict[str, object]:
    normalized_locale: AppLocale = "en" if str(locale).lower().startswith("en") else "es"
    lowered = description.lower().strip()

    detected_ingredients: list[str] = []
    base = {
        "kcal": 0.0,
        "protein_g": 0.0,
        "fat_g": 0.0,
        "carbs_g": 0.0,
        "sugars_g": 0.0,
        "fiber_g": 0.0,
        "salt_g": 0.9,
    }

    for profile in INGREDIENTS:
        if any(keyword in lowered for keyword in profile.keywords):
            detected_ingredients.append(profile.keywords[0])
            base["kcal"] += profile.kcal
            base["protein_g"] += profile.protein_g
            base["fat_g"] += profile.fat_g
            base["carbs_g"] += profile.carbs_g
            base["sugars_g"] += profile.sugars_g
            base["fiber_g"] += profile.fiber_g
            base["salt_g"] += 0.15

    assumptions: list[str] = []
    if not detected_ingredients:
        base = DEFAULT_BASE.copy()
        assumptions.append(
            "No clear ingredients were detected; a standard mixed dish was applied."
            if normalized_locale == "en"
            else "No se detectaron ingredientes claros; se aplicó un plato mixto estándar."
        )
    else:
        display_ingredients = (
            [INGREDIENT_LABEL_EN.get(item, item) for item in detected_ingredients]
            if normalized_locale == "en"
            else detected_ingredients
        )
        assumptions.append(
            f"Detected base ingredients: {', '.join(display_ingredients[:6])}."
            if normalized_locale == "en"
            else f"Ingredientes base detectados: {', '.join(display_ingredients[:6])}."
        )

    portion_key = portion_size or "medium"
    portion_factor = PORTION_MULTIPLIER.get(portion_key, 1.0)
    base = {key: value * portion_factor for key, value in base.items()}
    assumptions.append(
        f"Assumed portion size: {portion_key}."
        if normalized_locale == "en"
        else f"Tamaño de ración asumido: {portion_key}."
    )

    qty_factor = _extract_quantity_multiplier(quantity_note)
    if qty_factor != 1.0:
        base = {key: value * qty_factor for key, value in base.items()}
        assumptions.append(
            "Portion size was adjusted using the provided quantity."
            if normalized_locale == "en"
            else "Se ajustó la ración usando la cantidad indicada."
        )

    if has_added_fats:
        base["kcal"] += 90
        base["fat_g"] += 10
        base["salt_g"] += 0.2
        assumptions.append(
            "A margin was added for oils/sauces."
            if normalized_locale == "en"
            else "Se añadió margen por aceites/salsas."
        )

    # Conservative estimate: kcal/fat/sugars up, protein/fiber down.
    conservative = {
        "kcal": base["kcal"] * 1.12,
        "protein_g": base["protein_g"] * 0.9,
        "fat_g": base["fat_g"] * 1.15,
        "carbs_g": base["carbs_g"] * 1.05,
        "sugars_g": max(base["sugars_g"], base["carbs_g"] * 0.2) * 1.1,
        "fiber_g": base["fiber_g"] * 0.85,
        "salt_g": base["salt_g"] * 1.05,
        "sat_fat_g": base["fat_g"] * 0.32,
    }

    adjust_factor = 1 + (adjust_percent / 100)
    conservative = {key: value * adjust_factor for key, value in conservative.items()}

    nutrition = sanitize_numeric_values({
        "kcal": round(conservative["kcal"], 2),
        "protein_g": round(conservative["protein_g"], 2),
        "fat_g": round(conservative["fat_g"], 2),
        "sat_fat_g": round(conservative["sat_fat_g"], 2),
        "carbs_g": round(conservative["carbs_g"], 2),
        "sugars_g": round(conservative["sugars_g"], 2),
        "fiber_g": round(conservative["fiber_g"], 2),
        "salt_g": round(conservative["salt_g"], 2),
    })

    questions: list[str] = []
    if portion_size is None:
        questions.append(
            "Is the portion small, medium, or large?"
            if normalized_locale == "en"
            else "¿La ración es pequeña, mediana o grande?"
        )
    if has_added_fats is None:
        questions.append(
            "Did it include oil, butter, or added sauces?"
            if normalized_locale == "en"
            else "¿Lleva aceite, mantequilla o salsas añadidas?"
        )
    if not quantity_note:
        questions.append(
            "Approximate quantity? (e.g., 1 plate, 2 tablespoons, 1 fillet)"
            if normalized_locale == "en"
            else "¿Cantidad aproximada? (ej: 1 plato, 2 cucharadas, 1 filete)"
        )
    if not detected_ingredients:
        questions.append(
            "Describe main ingredients to improve accuracy."
            if normalized_locale == "en"
            else "Describe ingredientes principales para mejorar precisión."
        )

    detected_output = (
        [INGREDIENT_LABEL_EN.get(item, item) for item in detected_ingredients]
        if normalized_locale == "en"
        else detected_ingredients
    )

    confidence_score = 0
    if photo_count >= 2:
        confidence_score += 1
    if len(detected_ingredients) >= 2:
        confidence_score += 1
    if quantity_note:
        confidence_score += 2
    if portion_size is not None:
        confidence_score += 1
    if has_added_fats is not None:
        confidence_score += 1

    return {
        "confidence_level": _confidence_level(confidence_score),
        "questions": questions,
        "assumptions": assumptions,
        "detected_ingredients": detected_output,
        "nutrition": nutrition,
    }
