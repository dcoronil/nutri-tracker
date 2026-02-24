from __future__ import annotations

import base64
import json
from typing import Any, Literal

import httpx
from fastapi import UploadFile

from app.config import get_settings
from app.models import NutritionBasis
from app.services.meal_estimate import estimate_meal
from app.services.nutrition import sanitize_numeric_values

ConfidenceLevel = Literal["high", "medium", "low"]
VisionModel = Literal["gpt-4o-mini", "gpt-5.1"]
SUPPORTED_VISION_MODELS = {"gpt-4o-mini", "gpt-5.1"}
MEAL_ESTIMATE_MODEL: Literal["gpt-4o-mini"] = "gpt-4o-mini"


class VisionAIError(RuntimeError):
    pass


def _resolve_openai_vision_model(
    model: str | None,
    *,
    fallback: str | None = None,
    default: VisionModel = "gpt-4o-mini",
) -> VisionModel:
    for candidate in (model, fallback):
        normalized = (candidate or "").strip().lower()
        if not normalized:
            continue
        if normalized in SUPPORTED_VISION_MODELS:
            return normalized  # type: ignore[return-value]
    return default


def _extract_json_blob(text: str) -> dict[str, Any]:
    content = text.strip()
    if not content:
        raise VisionAIError("Vision model returned an empty response")

    try:
        data = json.loads(content)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise VisionAIError("Vision model did not return valid JSON")

    try:
        data = json.loads(content[start : end + 1])
    except json.JSONDecodeError as exc:
        raise VisionAIError("Vision model JSON could not be parsed") from exc

    if not isinstance(data, dict):
        raise VisionAIError("Vision model JSON root must be an object")
    return data


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


def _normalize_basis(value: Any, basis_hint: NutritionBasis | None = None) -> NutritionBasis | None:
    if isinstance(value, NutritionBasis):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"per_100g", "100g", "per100g", "per-100g"}:
            return NutritionBasis.per_100g
        if lowered in {"per_100ml", "100ml", "per100ml", "per-100ml"}:
            return NutritionBasis.per_100ml
        if lowered in {"per_serving", "serving", "portion", "per_portion", "per serving"}:
            return NutritionBasis.per_serving
    return basis_hint


def _normalize_confidence(value: Any) -> ConfidenceLevel:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"high", "medium", "low"}:
            return lowered  # type: ignore[return-value]
    return "medium"


async def _image_urls_from_uploads(photo_files: list[UploadFile]) -> list[str]:
    image_urls: list[str] = []

    for photo in photo_files:
        raw = await photo.read()
        await photo.seek(0)
        if not raw:
            continue

        content_type = (photo.content_type or "image/jpeg").strip().lower()
        if not content_type.startswith("image/"):
            content_type = "image/jpeg"

        encoded = base64.b64encode(raw).decode("ascii")
        image_urls.append(f"data:{content_type};base64,{encoded}")

        # Keep token usage bounded for predictable latency/cost.
        if len(image_urls) >= 3:
            break

    return image_urls


async def _openai_json_chat(
    *,
    api_key: str,
    model: VisionModel,
    system_prompt: str,
    user_prompt: str,
    photo_files: list[UploadFile],
    max_tokens: int,
) -> dict[str, Any]:
    settings = get_settings()
    image_urls = await _image_urls_from_uploads(photo_files)

    user_content: list[dict[str, Any]] = [{"type": "text", "text": user_prompt}]
    for image_url in image_urls:
        user_content.append({"type": "image_url", "image_url": {"url": image_url}})

    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
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
        raise VisionAIError(f"Vision provider request failed: {exc}") from exc

    if response.status_code in {401, 403}:
        raise VisionAIError("La API key no es válida o no tiene permisos de visión")

    if response.status_code >= 400:
        detail = response.text.strip()
        if len(detail) > 280:
            detail = f"{detail[:277]}..."
        raise VisionAIError(f"Vision provider HTTP {response.status_code}: {detail}")

    payload = response.json()
    content = (
        payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )

    if not isinstance(content, str):
        raise VisionAIError("Vision provider response format is unsupported")

    return _extract_json_blob(content)


async def extract_label_nutrition_with_ai(
    *,
    api_key: str,
    label_text: str,
    photo_files: list[UploadFile],
    basis_hint: NutritionBasis | None,
    model: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    selected_model = _resolve_openai_vision_model(model, fallback=settings.openai_vision_model)

    system_prompt = (
        "Eres un extractor estricto de tablas nutricionales. "
        "Devuelve solo JSON válido sin texto extra."
    )

    user_prompt = (
        "Extrae nutrición de la etiqueta. "
        "Si un campo no se ve claramente, usa null. "
        "Responde con este esquema JSON exacto: "
        "{\"nutrition\":{\"kcal\":number|null,\"protein_g\":number|null,\"fat_g\":number|null,"
        "\"sat_fat_g\":number|null,\"carbs_g\":number|null,\"sugars_g\":number|null,"
        "\"fiber_g\":number|null,\"salt_g\":number|null,"
        "\"nutrition_basis\":\"per_100g\"|\"per_100ml\"|\"per_serving\"|null,"
        "\"serving_size_g\":number|null},"
        "\"questions\":[string,...]}\n"
        f"Contexto OCR/usuario: {label_text or '(sin texto manual)'}"
    )

    data = await _openai_json_chat(
        api_key=api_key,
        model=selected_model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        photo_files=photo_files,
        max_tokens=900,
    )

    raw_nutrition = data.get("nutrition") if isinstance(data.get("nutrition"), dict) else data
    if not isinstance(raw_nutrition, dict):
        raw_nutrition = {}

    nutrition = {
        "kcal": _to_float(raw_nutrition.get("kcal")),
        "protein_g": _to_float(raw_nutrition.get("protein_g")),
        "fat_g": _to_float(raw_nutrition.get("fat_g")),
        "sat_fat_g": _to_float(raw_nutrition.get("sat_fat_g")),
        "carbs_g": _to_float(raw_nutrition.get("carbs_g")),
        "sugars_g": _to_float(raw_nutrition.get("sugars_g")),
        "fiber_g": _to_float(raw_nutrition.get("fiber_g")),
        "salt_g": _to_float(raw_nutrition.get("salt_g")),
        "nutrition_basis": _normalize_basis(raw_nutrition.get("nutrition_basis"), basis_hint),
        "serving_size_g": _to_float(raw_nutrition.get("serving_size_g")),
    }

    questions: list[str] = []
    if isinstance(data.get("questions"), list):
        questions = [str(item).strip() for item in data["questions"] if str(item).strip()]

    return {
        "nutrition": sanitize_numeric_values(nutrition),
        "questions": questions,
        "analysis_method": "ai_vision",
    }


def _coerce_question_items(raw_value: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_value, list):
        return []

    items: list[dict[str, Any]] = []
    for index, raw_item in enumerate(raw_value):
        prompt: str | None = None
        answer_type = "text"
        options: list[str] = []
        placeholder: str | None = None
        item_id = f"q_{index + 1}"

        if isinstance(raw_item, str):
            prompt = raw_item.strip()
        elif isinstance(raw_item, dict):
            maybe_prompt = raw_item.get("prompt") or raw_item.get("question")
            if isinstance(maybe_prompt, str):
                prompt = maybe_prompt.strip()

            maybe_id = raw_item.get("id")
            if isinstance(maybe_id, str) and maybe_id.strip():
                item_id = maybe_id.strip()

            maybe_type = raw_item.get("answer_type")
            if isinstance(maybe_type, str):
                normalized_type = maybe_type.strip().lower()
                if normalized_type in {"single_choice", "number", "text"}:
                    answer_type = normalized_type

            maybe_options = raw_item.get("options")
            if isinstance(maybe_options, list):
                options = [str(option).strip() for option in maybe_options if str(option).strip()]

            maybe_placeholder = raw_item.get("placeholder")
            if isinstance(maybe_placeholder, str) and maybe_placeholder.strip():
                placeholder = maybe_placeholder.strip()

        if not prompt:
            continue

        if answer_type == "single_choice" and not options:
            options = ["yes", "no"]
        if answer_type != "single_choice":
            options = []

        items.append(
            {
                "id": item_id,
                "prompt": prompt,
                "answer_type": answer_type,
                "options": options[:5],
                "placeholder": placeholder,
            }
        )

    return items[:3]


def _heuristic_question_items(heuristic_result: dict[str, Any]) -> list[dict[str, Any]]:
    source_questions = heuristic_result.get("questions", [])
    if not isinstance(source_questions, list):
        source_questions = []

    fallback_items: list[dict[str, Any]] = []
    for index, question in enumerate(source_questions):
        prompt = str(question).strip()
        if not prompt:
            continue

        lowered = prompt.lower()
        if "pequeña" in lowered and "mediana" in lowered and "grande" in lowered:
            fallback_items.append(
                {
                    "id": "portion_size",
                    "prompt": "¿Qué tamaño tenía la ración?",
                    "answer_type": "single_choice",
                    "options": ["small", "medium", "large"],
                    "placeholder": None,
                }
            )
            continue

        if "aceite" in lowered or "salsa" in lowered or "mantequilla" in lowered:
            fallback_items.append(
                {
                    "id": "added_fats",
                    "prompt": "¿Llevaba aceite o salsas añadidas?",
                    "answer_type": "single_choice",
                    "options": ["yes", "no"],
                    "placeholder": None,
                }
            )
            continue

        if "cantidad" in lowered or "cucharada" in lowered or "plato" in lowered:
            fallback_items.append(
                {
                    "id": "quantity_note",
                    "prompt": "¿Cantidad aproximada? (ej: 1 plato, 2 cucharadas)",
                    "answer_type": "text",
                    "options": [],
                    "placeholder": "1 plato / 250 g / 2 cucharadas",
                }
            )
            continue

        fallback_items.append(
            {
                "id": f"q_{index + 1}",
                "prompt": prompt,
                "answer_type": "text",
                "options": [],
                "placeholder": "Respuesta breve",
            }
        )

    unique: list[dict[str, Any]] = []
    seen_prompts: set[str] = set()
    for item in fallback_items:
        normalized_prompt = str(item["prompt"]).strip().lower()
        if not normalized_prompt or normalized_prompt in seen_prompts:
            continue
        seen_prompts.add(normalized_prompt)
        unique.append(item)
        if len(unique) >= 3:
            break
    return unique


def _questions_plain(question_items: list[dict[str, Any]]) -> list[str]:
    return [str(item["prompt"]).strip() for item in question_items if str(item.get("prompt", "")).strip()]


async def generate_meal_questions_with_ai(
    *,
    api_key: str,
    description: str,
    photo_files: list[UploadFile],
) -> dict[str, Any]:
    model_used = MEAL_ESTIMATE_MODEL
    safe_description = (description or "").strip()

    heuristic_fallback = estimate_meal(
        description=safe_description,
        portion_size=None,
        has_added_fats=None,
        quantity_note=None,
        photo_count=len(photo_files),
        adjust_percent=0,
    )
    fallback_items = _heuristic_question_items(heuristic_fallback)

    system_prompt = (
        "Eres un asistente de nutrición. Tu tarea es pedir solo la información mínima para "
        "mejorar la precisión de una estimación "
        "de comida por foto. Devuelve solo JSON válido."
    )
    user_prompt = (
        "Analiza imagen y descripción. NO estimes macros todavía. "
        "Devuelve solo preguntas de aclaración (máximo 3, ideal 2). "
        "Responde exactamente con este JSON: "
        "{\"questions\":[{\"id\":string,\"prompt\":string,"
        "\"answer_type\":\"single_choice\"|\"number\"|\"text\",\"options\":[string,...],\"placeholder\":string|null}],"
        "\"detected_ingredients\":[string,...],\"assumptions\":[string,...]}\n"
        f"Descripción: {safe_description or '(sin descripción)'}"
    )

    data = await _openai_json_chat(
        api_key=api_key,
        model=model_used,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        photo_files=photo_files,
        max_tokens=700,
    )

    assumptions = [str(item).strip() for item in data.get("assumptions", []) if str(item).strip()]
    ingredients = [str(item).strip() for item in data.get("detected_ingredients", []) if str(item).strip()]
    question_items = _coerce_question_items(data.get("questions"))

    if not question_items:
        question_items = fallback_items

    if len(question_items) < 2:
        existing = {str(item.get("prompt", "")).strip().lower() for item in question_items}
        for fallback in fallback_items:
            prompt_key = str(fallback.get("prompt", "")).strip().lower()
            if prompt_key and prompt_key not in existing:
                question_items.append(fallback)
                existing.add(prompt_key)
            if len(question_items) >= 2:
                break

    question_items = question_items[:3]

    if not assumptions:
        assumptions = [str(item) for item in heuristic_fallback.get("assumptions", [])][:3]
    if not ingredients:
        ingredients = [str(item) for item in heuristic_fallback.get("detected_ingredients", [])][:6]

    return {
        "model_used": model_used,
        "questions": _questions_plain(question_items),
        "question_items": question_items,
        "assumptions": assumptions,
        "detected_ingredients": ingredients,
    }


async def estimate_meal_with_ai(
    *,
    api_key: str,
    description: str,
    portion_size: Literal["small", "medium", "large"] | None,
    has_added_fats: bool | None,
    quantity_note: str | None,
    photo_files: list[UploadFile],
    adjust_percent: int,
    answers: list[str] | None = None,
) -> dict[str, Any]:
    model_used = MEAL_ESTIMATE_MODEL

    portion_text = portion_size or "unknown"
    added_fat_text = "unknown" if has_added_fats is None else ("yes" if has_added_fats else "no")

    system_prompt = (
        "Eres un analista nutricional conservador para estimaciones de platos por foto. "
        "Devuelve solo JSON válido sin texto extra."
    )

    user_prompt = (
        "Estima nutrición de la comida usando imagen y descripción. "
        "Sé conservador (kcal/grasas/azúcares ligeramente al alza, proteína/fibra ligeramente a la baja). "
        "Responde estrictamente con este JSON: "
        "{\"confidence_level\":\"high\"|\"medium\"|\"low\","
        "\"detected_ingredients\":[string,...],\"assumptions\":[string,...],"
        "\"questions\":[{\"id\":string,\"prompt\":string,\"answer_type\":\"single_choice\"|\"number\"|\"text\","
        "\"options\":[string,...],\"placeholder\":string|null}],"
        "\"nutrition\":{\"kcal\":number,\"protein_g\":number,\"fat_g\":number,\"sat_fat_g\":number|null,"
        "\"carbs_g\":number,\"sugars_g\":number|null,\"fiber_g\":number|null,\"salt_g\":number|null}}\n"
        f"Descripción: {description}\n"
        f"portion_size: {portion_text}\n"
        f"has_added_fats: {added_fat_text}\n"
        f"quantity_note: {quantity_note or '(none)'}\n"
        f"respuestas_usuario: {' | '.join(answers or []) or '(none)'}"
    )

    data = await _openai_json_chat(
        api_key=api_key,
        model=model_used,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        photo_files=photo_files,
        max_tokens=1000,
    )

    nutrition_raw = data.get("nutrition") if isinstance(data.get("nutrition"), dict) else {}

    heuristic_fallback = estimate_meal(
        description=description,
        portion_size=portion_size,
        has_added_fats=has_added_fats,
        quantity_note=quantity_note,
        photo_count=len(photo_files),
        adjust_percent=0,
    )
    fallback_nutrition = heuristic_fallback["nutrition"]

    parsed = {
        "kcal": _to_float(nutrition_raw.get("kcal")) or float(fallback_nutrition["kcal"]),
        "protein_g": _to_float(nutrition_raw.get("protein_g")) or float(fallback_nutrition["protein_g"]),
        "fat_g": _to_float(nutrition_raw.get("fat_g")) or float(fallback_nutrition["fat_g"]),
        "sat_fat_g": _to_float(nutrition_raw.get("sat_fat_g")) or float(fallback_nutrition.get("sat_fat_g") or 0.0),
        "carbs_g": _to_float(nutrition_raw.get("carbs_g")) or float(fallback_nutrition["carbs_g"]),
        "sugars_g": _to_float(nutrition_raw.get("sugars_g")) or float(fallback_nutrition.get("sugars_g") or 0.0),
        "fiber_g": _to_float(nutrition_raw.get("fiber_g")) or float(fallback_nutrition.get("fiber_g") or 0.0),
        "salt_g": _to_float(nutrition_raw.get("salt_g")) or float(fallback_nutrition.get("salt_g") or 0.0),
    }

    conservative = {
        "kcal": parsed["kcal"] * 1.08,
        "protein_g": parsed["protein_g"] * 0.92,
        "fat_g": parsed["fat_g"] * 1.1,
        "sat_fat_g": parsed["sat_fat_g"] * 1.08,
        "carbs_g": parsed["carbs_g"] * 1.04,
        "sugars_g": parsed["sugars_g"] * 1.1,
        "fiber_g": parsed["fiber_g"] * 0.9,
        "salt_g": parsed["salt_g"] * 1.05,
    }

    adjust_factor = 1 + (max(-30, min(30, adjust_percent)) / 100)
    nutrition = sanitize_numeric_values(
        {
            key: round(value * adjust_factor, 2)
            for key, value in conservative.items()
        }
    )

    confidence_level = _normalize_confidence(data.get("confidence_level"))

    assumptions = [str(item).strip() for item in data.get("assumptions", []) if str(item).strip()]
    question_items = _coerce_question_items(data.get("questions"))
    questions = _questions_plain(question_items)
    ingredients = [str(item).strip() for item in data.get("detected_ingredients", []) if str(item).strip()]

    fallback_items = _heuristic_question_items(heuristic_fallback)

    if not assumptions:
        assumptions = [str(item) for item in heuristic_fallback["assumptions"]]
    if not questions:
        question_items = fallback_items
        questions = _questions_plain(question_items)
    if not ingredients:
        ingredients = [str(item) for item in heuristic_fallback["detected_ingredients"]]

    return {
        "model_used": model_used,
        "confidence_level": confidence_level,
        "analysis_method": "ai_vision",
        "questions": questions,
        "question_items": question_items,
        "assumptions": assumptions,
        "detected_ingredients": ingredients,
        "nutrition": nutrition,
    }
