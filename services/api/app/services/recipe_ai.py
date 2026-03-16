from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Any, Literal
from uuid import uuid4

import httpx

from app.config import get_settings
from app.models import GoalType, RecipeMealType

RecipeModel = Literal["gpt-4o-mini"]
AppLocale = Literal["es", "en"]

RECIPE_MODEL: RecipeModel = "gpt-4o-mini"
_RECIPE_GENERATION_TTL = timedelta(minutes=20)
_recipe_generation_cache: dict[str, dict[str, Any]] = {}
_recipe_generation_lock = Lock()


class RecipeAIError(RuntimeError):
    pass


def _extract_json_blob(text: str) -> dict[str, Any]:
    content = text.strip()
    if not content:
        raise RecipeAIError("Recipe model returned an empty response")
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RecipeAIError("Recipe model did not return valid JSON")
    try:
        parsed = json.loads(content[start : end + 1])
    except json.JSONDecodeError as exc:
        raise RecipeAIError("Recipe model JSON could not be parsed") from exc
    if not isinstance(parsed, dict):
        raise RecipeAIError("Recipe model JSON root must be an object")
    return parsed


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", ".")
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _normalize_locale(locale: str | None) -> AppLocale:
    if locale and locale.strip().lower().startswith("en"):
        return "en"
    return "es"


def _meal_type_label(meal_type: RecipeMealType, locale: AppLocale) -> str:
    if locale == "en":
        labels = {
            RecipeMealType.breakfast: "breakfast",
            RecipeMealType.brunch: "brunch",
            RecipeMealType.lunch: "lunch",
            RecipeMealType.snack: "snack",
            RecipeMealType.dinner: "dinner",
        }
    else:
        labels = {
            RecipeMealType.breakfast: "desayuno",
            RecipeMealType.brunch: "almuerzo",
            RecipeMealType.lunch: "comida",
            RecipeMealType.snack: "merienda",
            RecipeMealType.dinner: "cena",
        }
    return labels.get(meal_type, str(meal_type))


def _postprocess_generated_recipe(
    *,
    meal_type: RecipeMealType,
    recipe: dict[str, Any] | None,
    feedback: dict[str, Any] | None,
    assumptions: list[Any] | None,
) -> dict[str, Any]:
    if not isinstance(recipe, dict):
        raise RecipeAIError("La IA no devolvió una receta estructurada.")
    if not isinstance(feedback, dict):
        feedback = {"summary": "", "highlights": [], "gaps": [], "tips": [], "suggested_extras": []}
    if not isinstance(assumptions, list):
        assumptions = []

    raw_protein = max(0.0, _to_float(recipe.get("nutrition_protein_g")) or 0.0)
    raw_carbs = max(0.0, _to_float(recipe.get("nutrition_carbs_g")) or 0.0)
    raw_fat = max(0.0, _to_float(recipe.get("nutrition_fat_g")) or 0.0)
    macro_kcal = raw_protein * 4 + raw_carbs * 4 + raw_fat * 9
    raw_kcal = max(0.0, _to_float(recipe.get("nutrition_kcal")) or 0.0)
    conservative_kcal = max(raw_kcal, macro_kcal)
    cleaned_assumptions = [str(item).strip() for item in assumptions if str(item).strip()]
    if macro_kcal > 0 and (raw_kcal <= 0 or abs(raw_kcal - macro_kcal) / macro_kcal > 0.12):
        cleaned_assumptions = [*cleaned_assumptions, "Se ajustaron kcal para mantener coherencia básica con los macros."]

    return {
        "model_used": RECIPE_MODEL,
        "recipe": {
            "title": str(recipe.get("title") or "").strip(),
            "meal_type": meal_type.value,
            "servings": max(1, int(recipe.get("servings") or 1)),
            "prep_time_min": max(0, int(recipe.get("prep_time_min") or 0)),
            "ingredients": recipe.get("ingredients") if isinstance(recipe.get("ingredients"), list) else [],
            "steps": recipe.get("steps") if isinstance(recipe.get("steps"), list) else [],
            "tags": recipe.get("tags") if isinstance(recipe.get("tags"), list) else [],
            "nutrition_kcal": round(conservative_kcal, 1),
            "nutrition_protein_g": round(raw_protein, 1),
            "nutrition_carbs_g": round(raw_carbs, 1),
            "nutrition_fat_g": round(raw_fat, 1),
        },
        "feedback": {
            "summary": str(feedback.get("summary") or "").strip(),
            "highlights": [str(item).strip() for item in feedback.get("highlights", []) if str(item).strip()],
            "gaps": [str(item).strip() for item in feedback.get("gaps", []) if str(item).strip()],
            "tips": [str(item).strip() for item in feedback.get("tips", []) if str(item).strip()],
            "suggested_extras": [
                str(item).strip() for item in feedback.get("suggested_extras", []) if str(item).strip()
            ],
        },
        "assumptions": cleaned_assumptions,
    }


def _prune_recipe_generation_cache() -> None:
    now = datetime.now(UTC)
    stale_keys = [
        generation_id
        for generation_id, entry in _recipe_generation_cache.items()
        if not isinstance(entry.get("expires_at"), datetime) or entry["expires_at"] <= now
    ]
    for generation_id in stale_keys:
        _recipe_generation_cache.pop(generation_id, None)


def store_recipe_generation(*, user_id: int, options: list[dict[str, Any]], model_used: str = RECIPE_MODEL) -> str:
    generation_id = uuid4().hex
    now = datetime.now(UTC)
    with _recipe_generation_lock:
        _prune_recipe_generation_cache()
        _recipe_generation_cache[generation_id] = {
            "user_id": user_id,
            "options": options,
            "model_used": model_used,
            "created_at": now,
            "expires_at": now + _RECIPE_GENERATION_TTL,
        }
    return generation_id


def get_recipe_generation_option(*, user_id: int, generation_id: str, option_id: str) -> dict[str, Any] | None:
    with _recipe_generation_lock:
        _prune_recipe_generation_cache()
        entry = _recipe_generation_cache.get(generation_id)
        if not entry or entry.get("user_id") != user_id:
            return None
        options = entry.get("options")
        if not isinstance(options, list):
            return None
        for option in options:
            if str(option.get("option_id")) == option_id:
                return {
                    "generation_id": generation_id,
                    "model_used": entry.get("model_used", RECIPE_MODEL),
                    **option,
                }
    return None


async def _run_recipe_ai_request(*, api_key: str, system_prompt: str, user_prompt: str, max_tokens: int) -> dict[str, Any]:
    settings = get_settings()
    payload = {
        "model": RECIPE_MODEL,
        "temperature": 0.35,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    url = f"{settings.openai_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.openai_vision_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise RecipeAIError(f"Recipe provider request failed: {exc}") from exc

    if response.status_code in {401, 403}:
        raise RecipeAIError("La API key no es válida o no tiene permisos para generar recetas.")
    if response.status_code >= 400:
        detail = response.text.strip()
        if len(detail) > 280:
            detail = f"{detail[:277]}..."
        raise RecipeAIError(f"Recipe provider HTTP {response.status_code}: {detail}")

    content = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    if not isinstance(content, str):
        raise RecipeAIError("Recipe provider response format is unsupported")
    return _extract_json_blob(content)


async def generate_recipe_with_ai(
    *,
    api_key: str,
    meal_type: RecipeMealType,
    target_kcal: float | None,
    target_protein_g: float | None,
    target_fat_g: float | None,
    target_carbs_g: float | None,
    goal_mode: GoalType | None,
    use_only_ingredients: bool,
    allergies: list[str],
    preferences: list[str],
    available_ingredients: list[dict[str, Any]],
    allow_basic_pantry: bool,
    locale: str | None,
) -> dict[str, Any]:
    selected_locale = _normalize_locale(locale)
    meal_label = _meal_type_label(meal_type, selected_locale)
    mode_label = goal_mode.value if goal_mode else None

    system_prompt = (
        "You are a strict nutrition recipe generator for a fitness app. "
        "Return only valid JSON with no markdown. "
        "Respect the allowed ingredients policy exactly. "
        "If use_only_ingredients is true, do not add ingredients outside the provided list except pantry basics when allowed. "
        "Be conservative with nutrition: never understate calories, never overstate protein."
    )

    user_prompt = json.dumps(
        {
            "locale": selected_locale,
            "meal_type": meal_label,
            "goal_mode": mode_label,
            "targets": {
                "kcal": target_kcal,
                "protein_g": target_protein_g,
                "fat_g": target_fat_g,
                "carbs_g": target_carbs_g,
            },
            "use_only_ingredients": use_only_ingredients,
            "allow_basic_pantry": allow_basic_pantry,
            "allergies": allergies,
            "preferences": preferences,
            "available_ingredients": available_ingredients,
            "response_contract": {
                "recipe": {
                    "title": "string",
                    "meal_type": meal_type.value,
                    "servings": "integer >= 1",
                    "prep_time_min": "integer >= 0",
                    "ingredients": [{"name": "string", "quantity": "number|null", "unit": "string|null"}],
                    "steps": ["string", "..."],
                    "tags": ["string", "..."],
                    "nutrition_kcal": "number >= 0",
                    "nutrition_protein_g": "number >= 0",
                    "nutrition_carbs_g": "number >= 0",
                    "nutrition_fat_g": "number >= 0",
                },
                "feedback": {
                    "summary": "string",
                    "highlights": ["string", "..."],
                    "gaps": ["string", "..."],
                    "tips": ["string", "..."],
                    "suggested_extras": ["string", "..."],
                },
                "assumptions": ["string", "..."],
            },
        },
        ensure_ascii=False,
    )
    data = await _run_recipe_ai_request(
        api_key=api_key,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=1600,
    )
    return _postprocess_generated_recipe(
        meal_type=meal_type,
        recipe=data.get("recipe"),
        feedback=data.get("feedback"),
        assumptions=data.get("assumptions"),
    )


async def generate_recipe_options_with_ai(
    *,
    api_key: str,
    meal_type: RecipeMealType,
    target_kcal: float | None,
    target_protein_g: float | None,
    target_fat_g: float | None,
    target_carbs_g: float | None,
    goal_mode: GoalType | None,
    use_only_ingredients: bool,
    allergies: list[str],
    preferences: list[str],
    available_ingredients: list[dict[str, Any]],
    allow_basic_pantry: bool,
    locale: str | None,
) -> dict[str, Any]:
    selected_locale = _normalize_locale(locale)
    meal_label = _meal_type_label(meal_type, selected_locale)
    mode_label = goal_mode.value if goal_mode else None

    system_prompt = (
        "You are a strict nutrition recipe generator for a fitness app. "
        "Return only valid JSON with no markdown. "
        "Generate exactly 3 materially different recipe options, not tiny variations. "
        "Each option must differ in structure, ingredients balance, cooking approach, or macro profile. "
        "Respect the allowed ingredients policy exactly. "
        "If use_only_ingredients is true, do not add ingredients outside the provided list except pantry basics when allowed. "
        "Be conservative with nutrition: never understate calories, never overstate protein."
    )

    user_prompt = json.dumps(
        {
            "locale": selected_locale,
            "meal_type": meal_label,
            "goal_mode": mode_label,
            "targets": {
                "kcal": target_kcal,
                "protein_g": target_protein_g,
                "fat_g": target_fat_g,
                "carbs_g": target_carbs_g,
            },
            "use_only_ingredients": use_only_ingredients,
            "allow_basic_pantry": allow_basic_pantry,
            "allergies": allergies,
            "preferences": preferences,
            "available_ingredients": available_ingredients,
            "response_contract": {
                "options": [
                    {
                        "id": "option_1",
                        "recipe": {
                            "title": "string",
                            "meal_type": meal_type.value,
                            "servings": "integer >= 1",
                            "prep_time_min": "integer >= 0",
                            "ingredients": [{"name": "string", "quantity": "number|null", "unit": "string|null"}],
                            "steps": ["string", "..."],
                            "tags": ["string", "..."],
                            "nutrition_kcal": "number >= 0",
                            "nutrition_protein_g": "number >= 0",
                            "nutrition_carbs_g": "number >= 0",
                            "nutrition_fat_g": "number >= 0",
                        },
                        "feedback": {
                            "summary": "string",
                            "highlights": ["string", "..."],
                            "gaps": ["string", "..."],
                            "tips": ["string", "..."],
                            "suggested_extras": ["string", "..."],
                        },
                        "assumptions": ["string", "..."],
                    }
                ]
            },
        },
        ensure_ascii=False,
    )

    data = await _run_recipe_ai_request(
        api_key=api_key,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=3200,
    )

    raw_options = data.get("options")
    if not isinstance(raw_options, list) or not raw_options:
        raise RecipeAIError("La IA no devolvió opciones válidas.")

    normalized_options: list[dict[str, Any]] = []
    seen_signatures: set[tuple[str, tuple[str, ...]]] = set()
    for index, option in enumerate(raw_options[:6], start=1):
        if not isinstance(option, dict):
            continue
        normalized = _postprocess_generated_recipe(
            meal_type=meal_type,
            recipe=option.get("recipe"),
            feedback=option.get("feedback"),
            assumptions=option.get("assumptions"),
        )
        recipe_payload = normalized["recipe"]
        title = str(recipe_payload.get("title") or "").strip().lower()
        ingredient_names = tuple(
            sorted(
                str(item.get("name") or "").strip().lower()
                for item in recipe_payload.get("ingredients", [])
                if isinstance(item, dict) and str(item.get("name") or "").strip()
            )
        )
        signature = (title, ingredient_names)
        if signature in seen_signatures:
            continue
        seen_signatures.add(signature)
        normalized_options.append(
            {
                "option_id": str(option.get("id") or f"option_{index}"),
                **normalized,
            }
        )
        if len(normalized_options) == 3:
            break

    if len(normalized_options) < 3:
        raise RecipeAIError("La IA no devolvió 3 opciones suficientemente distintas.")

    return {
        "model_used": RECIPE_MODEL,
        "options": normalized_options,
    }
