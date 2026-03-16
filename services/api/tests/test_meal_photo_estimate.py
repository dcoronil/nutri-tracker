from datetime import UTC, date, datetime, timedelta

from sqlmodel import Session

from app.models import MealPhotoAnalysis


def _configure_ai_key(client, auth_headers):
    response = client.post(
        "/user/ai-key",
        json={"provider": "openai", "api_key": "sk-test-key-1234567890abcd"},
        headers=auth_headers,
    )
    assert response.status_code == 200


async def _mock_ai_estimate(
    *,
    api_key: str,
    description: str,
    portion_size,
    has_added_fats,
    quantity_note,
    photo_files,
    adjust_percent: int,
    answers=None,
    locale: str = "es",
):
    assert api_key.startswith("sk-")
    assert len(photo_files) >= 1
    del description, portion_size, has_added_fats, quantity_note, photo_files, answers, locale
    base_kcal = 530.0 + float(adjust_percent)
    return {
        "model_used": "gpt-4o-mini",
        "confidence_level": "medium",
        "analysis_method": "ai_vision",
        "questions": ["¿La ración era mediana o grande?"],
        "question_items": [
            {
                "id": "portion_size",
                "prompt": "¿Qué tamaño tenía la ración?",
                "answer_type": "single_choice",
                "options": ["small", "medium", "large"],
                "placeholder": None,
            }
        ],
        "assumptions": ["Se consideró una ración media."],
        "detected_ingredients": ["arroz", "pollo"],
        "nutrition": {
            "kcal": base_kcal,
            "protein_g": 31.0,
            "fat_g": 17.0,
            "sat_fat_g": 5.1,
            "carbs_g": 58.0,
            "sugars_g": 4.4,
            "fiber_g": 3.2,
            "salt_g": 1.2,
        },
    }


async def _mock_ai_questions(
    *,
    api_key: str,
    description: str,
    quantity_note: str | None = None,
    photo_files,
    locale: str = "es",
):
    assert api_key.startswith("sk-")
    assert len(photo_files) >= 1
    del description, quantity_note, photo_files, locale
    return {
        "model_used": "gpt-4o-mini",
        "questions": ["¿Qué tamaño tenía la ración?"],
        "question_items": [
            {
                "id": "portion_size",
                "prompt": "¿Qué tamaño tenía la ración?",
                "answer_type": "single_choice",
                "options": ["small", "medium", "large"],
                "placeholder": None,
            }
        ],
        "assumptions": ["Se detectó un plato principal."],
        "detected_ingredients": ["pollo", "arroz"],
    }


def test_meal_photo_requires_ai_key(client, auth_headers):
    response = client.post(
        "/meal-photo-estimate/questions",
        data={
            "description": "arroz con pollo",
        },
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
        headers=auth_headers,
    )
    assert response.status_code == 428


def test_meal_photo_questions(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.generate_meal_questions_with_ai", _mock_ai_questions)

    response = client.post(
        "/meal-photo-estimate/questions",
        data={
            "description": "arroz con pollo",
        },
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model_used"] == "gpt-4o-mini"
    assert isinstance(body["questions"], list)
    assert isinstance(body["question_items"], list)
    assert "pollo" in body["detected_ingredients"]
    assert body["analysis_id"]
    assert body["analysis_expires_at"]


def test_meal_photo_preview_and_commit(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.generate_meal_questions_with_ai", _mock_ai_questions)
    monkeypatch.setattr("app.api.routes.estimate_meal_with_ai", _mock_ai_estimate)

    questions = client.post(
        "/meal-photo-estimate/questions",
        data={"description": "arroz con pollo y mayonesa"},
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
        headers=auth_headers,
    )
    assert questions.status_code == 200
    analysis_id = questions.json()["analysis_id"]

    preview = client.post(
        "/meal-photo-estimate/calculate",
        data={
            "analysis_id": analysis_id,
            "description": "arroz con pollo y mayonesa",
            "portion_size": "medium",
            "has_added_fats": "true",
            "adjust_percent": "0",
            "commit": "false",
        },
        headers=auth_headers,
    )
    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["saved"] is False
    assert preview_body["model_used"] == "gpt-4o-mini"
    assert preview_body["intake"] is None
    assert preview_body["preview_nutrients"]["kcal"] > 0
    assert preview_body["analysis_method"] == "ai_vision"

    commit = client.post(
        "/intakes/from-meal-photo-estimate",
        data={
            "analysis_id": analysis_id,
            "description": "arroz con pollo y mayonesa",
            "portion_size": "medium",
            "has_added_fats": "true",
            "quantity_note": "1 plato",
            "adjust_percent": "5",
            "commit": "true",
        },
        headers=auth_headers,
    )
    assert commit.status_code == 200
    commit_body = commit.json()
    assert commit_body["saved"] is True
    assert commit_body["intake"] is not None
    assert commit_body["intake"]["estimated"] is True
    assert commit_body["intake"]["source_method"] == "meal_photo"
    estimated_product_id = commit_body["intake"]["product_id"]

    quality = client.get(f"/products/{estimated_product_id}/data-quality", headers=auth_headers)
    assert quality.status_code == 200
    assert quality.json()["status"] == "estimated"

    summary = client.get(f"/days/{date.today().isoformat()}/summary", headers=auth_headers)
    assert summary.status_code == 200
    intakes = summary.json()["intakes"]
    assert any(item.get("source_method") == "meal_photo" for item in intakes)

    expired_cached_preview = client.post(
        "/meal-photo-estimate/calculate",
        data={
            "analysis_id": analysis_id,
            "description": "arroz con pollo y mayonesa",
            "commit": "false",
        },
        headers=auth_headers,
    )
    assert expired_cached_preview.status_code == 404


def test_meal_photo_analysis_id_expiry(client, auth_headers, monkeypatch, engine):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.generate_meal_questions_with_ai", _mock_ai_questions)
    monkeypatch.setattr("app.api.routes.estimate_meal_with_ai", _mock_ai_estimate)

    questions = client.post(
        "/meal-photo-estimate/questions",
        data={"description": "plato mixto"},
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
        headers=auth_headers,
    )
    assert questions.status_code == 200
    analysis_id = questions.json()["analysis_id"]
    assert analysis_id

    with Session(engine) as session:
        cache_entry = session.get(MealPhotoAnalysis, analysis_id)
        assert cache_entry is not None
        cache_entry.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.add(cache_entry)
        session.commit()

    expired = client.post(
        "/meal-photo-estimate/calculate",
        data={"analysis_id": analysis_id, "description": "plato mixto", "commit": "false"},
        headers=auth_headers,
    )
    assert expired.status_code == 410


def test_meal_photo_legacy_calculate_still_accepts_photos(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.estimate_meal_with_ai", _mock_ai_estimate)
    preview = client.post(
        "/meal-photo-estimate/calculate",
        data={
            "description": "plato legacy",
            "commit": "false",
        },
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
        headers=auth_headers,
    )
    assert preview.status_code == 200
    assert preview.json()["saved"] is False


def test_meal_photo_locale_and_macro_overrides(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)

    async def _mock_questions_en(
        *,
        api_key: str,
        description: str,
        quantity_note: str | None = None,
        photo_files,
        locale: str = "es",
    ):
        assert api_key.startswith("sk-")
        assert locale == "en"
        del description, quantity_note, photo_files
        return {
            "model_used": "gpt-4o-mini",
            "questions": ["What portion size was it?"],
            "question_items": [
                {
                    "id": "portion_size",
                    "prompt": "What portion size was it?",
                    "answer_type": "single_choice",
                    "options": ["small", "medium", "large"],
                    "placeholder": None,
                }
            ],
            "assumptions": ["Estimated from visible ingredients."],
            "detected_ingredients": ["chicken", "rice"],
        }

    async def _mock_estimate_en(
        *,
        api_key: str,
        description: str,
        portion_size,
        has_added_fats,
        quantity_note,
        photo_files,
        adjust_percent: int,
        answers=None,
        locale: str = "es",
    ):
        assert api_key.startswith("sk-")
        assert locale == "en"
        del description, portion_size, has_added_fats, quantity_note, photo_files, adjust_percent, answers
        return {
            "model_used": "gpt-4o-mini",
            "confidence_level": "medium",
            "analysis_method": "ai_vision",
            "questions": ["What portion size was it?"],
            "question_items": [],
            "assumptions": ["Estimated from visible ingredients."],
            "detected_ingredients": ["chicken", "rice"],
            "nutrition": {
                "kcal": 510.0,
                "protein_g": 30.0,
                "fat_g": 16.0,
                "sat_fat_g": 5.0,
                "carbs_g": 54.0,
                "sugars_g": 4.0,
                "fiber_g": 3.0,
                "salt_g": 1.1,
            },
        }

    monkeypatch.setattr("app.api.routes.generate_meal_questions_with_ai", _mock_questions_en)
    monkeypatch.setattr("app.api.routes.estimate_meal_with_ai", _mock_estimate_en)

    questions = client.post(
        "/meal-photo-estimate/questions",
        data={"description": "chicken and rice", "locale": "en"},
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
        headers=auth_headers,
    )
    assert questions.status_code == 200
    assert questions.json()["questions"][0].startswith("What")

    preview = client.post(
        "/meal-photo-estimate/calculate",
        data={
            "description": "chicken and rice",
            "locale": "en",
            "override_kcal": "777",
            "override_protein_g": "55",
            "override_fat_g": "22",
            "override_carbs_g": "66",
            "commit": "false",
        },
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
        headers=auth_headers,
    )
    assert preview.status_code == 200
    payload = preview.json()
    assert payload["saved"] is False
    assert payload["preview_nutrients"]["kcal"] == 777
    assert payload["preview_nutrients"]["protein_g"] == 55
    assert payload["preview_nutrients"]["fat_g"] == 22
    assert payload["preview_nutrients"]["carbs_g"] == 66
