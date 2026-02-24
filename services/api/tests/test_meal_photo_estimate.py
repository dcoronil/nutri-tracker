from datetime import date


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
):
    assert api_key.startswith("sk-")
    del description, portion_size, has_added_fats, quantity_note, photo_files, answers
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
    photo_files,
):
    assert api_key.startswith("sk-")
    del description, photo_files
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


def test_meal_photo_preview_and_commit(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.estimate_meal_with_ai", _mock_ai_estimate)

    preview = client.post(
        "/meal-photo-estimate/calculate",
        data={
            "description": "arroz con pollo y mayonesa",
            "portion_size": "medium",
            "has_added_fats": "true",
            "adjust_percent": "0",
            "commit": "false",
        },
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
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
            "description": "arroz con pollo y mayonesa",
            "portion_size": "medium",
            "has_added_fats": "true",
            "quantity_note": "1 plato",
            "adjust_percent": "5",
            "commit": "true",
        },
        files=[("photos", ("meal.jpg", b"fake", "image/jpeg"))],
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
