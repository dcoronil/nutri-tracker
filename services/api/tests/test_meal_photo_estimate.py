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
    model_preference: str | None,
    portion_size,
    has_added_fats,
    quantity_note,
    photo_files,
    adjust_percent: int,
):
    assert api_key.startswith("sk-")
    model_used = model_preference if model_preference in {"gpt-4o-mini", "gpt-5.1"} else "gpt-4o-mini"
    suggested_model = "gpt-5.1" if model_used == "gpt-4o-mini" else None
    del description, portion_size, has_added_fats, quantity_note, photo_files
    base_kcal = 530.0 + float(adjust_percent)
    return {
        "model_used": model_used,
        "suggested_model": suggested_model,
        "confidence_level": "medium",
        "analysis_method": "ai_vision",
        "questions": ["¿La ración era mediana o grande?"],
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


def test_meal_photo_requires_ai_key(client, auth_headers):
    response = client.post(
        "/meal-photo-estimate/questions",
        data={
            "description": "arroz con pollo",
        },
        headers=auth_headers,
    )
    assert response.status_code == 428


def test_meal_photo_questions(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.estimate_meal_with_ai", _mock_ai_estimate)

    response = client.post(
        "/meal-photo-estimate/questions",
        data={
            "description": "arroz con pollo",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model_used"] == "gpt-4o-mini"
    assert body["suggested_model"] == "gpt-5.1"
    assert isinstance(body["questions"], list)
    assert "pollo" in body["detected_ingredients"]

    high_precision = client.post(
        "/meal-photo-estimate/questions",
        data={
            "description": "arroz con pollo",
            "model": "gpt-5.1",
        },
        headers=auth_headers,
    )
    assert high_precision.status_code == 200
    assert high_precision.json()["model_used"] == "gpt-5.1"


def test_meal_photo_preview_and_commit(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.estimate_meal_with_ai", _mock_ai_estimate)

    preview = client.post(
        "/intakes/from-meal-photo-estimate",
        data={
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
