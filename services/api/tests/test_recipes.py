from datetime import UTC, datetime

from app.models import GoalType


def _recipe_payload(title: str = "Tortitas proteicas") -> dict:
    return {
        "title": title,
        "meal_type": "breakfast",
        "servings": 2,
        "prep_time_min": 15,
        "ingredients": [
            {"name": "Avena", "quantity": 80, "unit": "g"},
            {"name": "Claras", "quantity": 200, "unit": "ml"},
        ],
        "steps": ["Mezcla todo", "Cocina en sartén"],
        "tags": ["high protein"],
        "nutrition_kcal": 420,
        "nutrition_protein_g": 34,
        "nutrition_carbs_g": 41,
        "nutrition_fat_g": 11,
    }


def _configure_ai_key(client, auth_headers):
    response = client.post(
        "/user/ai-key",
        json={"provider": "openai", "api_key": "sk-test-key-1234567890abcd"},
        headers=auth_headers,
    )
    assert response.status_code == 200


async def _mock_generate_recipe_with_ai(**kwargs):
    assert kwargs["goal_mode"] == GoalType.maintain
    assert kwargs["use_only_ingredients"] is True
    return {
        "model_used": "gpt-4o-mini",
        "recipe": {
            "title": "Bowl exprés de atún",
            "meal_type": "lunch",
            "servings": 1,
            "prep_time_min": 8,
            "ingredients": [
                {"name": "Atún", "quantity": 120, "unit": "g"},
                {"name": "Arroz cocido", "quantity": 150, "unit": "g"},
            ],
            "steps": ["Calienta el arroz", "Mezcla con el atún y sirve"],
            "tags": ["high protein"],
            "nutrition_kcal": 512,
            "nutrition_protein_g": 34,
            "nutrition_carbs_g": 48,
            "nutrition_fat_g": 16,
        },
        "feedback": {
            "summary": "Buen equilibrio general para una comida rápida.",
            "highlights": ["Proteína suficiente."],
            "gaps": ["Algo corta de verdura."],
            "tips": ["Añade tomate si quieres más volumen."],
            "suggested_extras": ["tomate"],
        },
        "assumptions": ["Se asumió arroz ya cocido."],
    }


async def _mock_generate_recipe_options_with_ai(**kwargs):
    assert kwargs["goal_mode"] == GoalType.maintain
    return {
        "model_used": "gpt-4o-mini",
        "options": [
            {
                "option_id": "option_1",
                "model_used": "gpt-4o-mini",
                "recipe": {
                    "title": "Bowl proteico de pollo",
                    "meal_type": "lunch",
                    "servings": 1,
                    "prep_time_min": 14,
                    "ingredients": [
                        {"name": "Pollo", "quantity": 180, "unit": "g"},
                        {"name": "Arroz cocido", "quantity": 120, "unit": "g"},
                    ],
                    "steps": ["Cocina el pollo", "Sirve con arroz"],
                    "tags": ["high protein"],
                    "nutrition_kcal": 520,
                    "nutrition_protein_g": 44,
                    "nutrition_carbs_g": 35,
                    "nutrition_fat_g": 16,
                },
                "feedback": {
                    "summary": "La más potente en proteína.",
                    "highlights": ["Muy alineada con proteína."],
                    "gaps": [],
                    "tips": ["Añade verdura si quieres más volumen."],
                    "suggested_extras": [],
                },
                "assumptions": ["Pollo sin piel."],
            },
            {
                "option_id": "option_2",
                "model_used": "gpt-4o-mini",
                "recipe": {
                    "title": "Wrap rápido de atún",
                    "meal_type": "lunch",
                    "servings": 1,
                    "prep_time_min": 9,
                    "ingredients": [
                        {"name": "Atún", "quantity": 120, "unit": "g"},
                        {"name": "Tortilla de trigo", "quantity": 1, "unit": "ud"},
                    ],
                    "steps": ["Mezcla el relleno", "Monta el wrap"],
                    "tags": ["fast"],
                    "nutrition_kcal": 460,
                    "nutrition_protein_g": 31,
                    "nutrition_carbs_g": 39,
                    "nutrition_fat_g": 14,
                },
                "feedback": {
                    "summary": "Más ligera y rápida.",
                    "highlights": ["Fácil de preparar."],
                    "gaps": [],
                    "tips": ["Añade tomate si quieres."],
                    "suggested_extras": [],
                },
                "assumptions": [],
            },
            {
                "option_id": "option_3",
                "model_used": "gpt-4o-mini",
                "recipe": {
                    "title": "Pasta cremosa de yogur",
                    "meal_type": "lunch",
                    "servings": 1,
                    "prep_time_min": 18,
                    "ingredients": [
                        {"name": "Pasta cocida", "quantity": 180, "unit": "g"},
                        {"name": "Yogur natural", "quantity": 125, "unit": "g"},
                    ],
                    "steps": ["Cuece la pasta", "Liga con yogur"],
                    "tags": ["comfort"],
                    "nutrition_kcal": 690,
                    "nutrition_protein_g": 22,
                    "nutrition_carbs_g": 82,
                    "nutrition_fat_g": 18,
                },
                "feedback": {
                    "summary": "Más contundente.",
                    "highlights": ["Muy saciante."],
                    "gaps": [],
                    "tips": ["Compensa con una cena ligera."],
                    "suggested_extras": [],
                },
                "assumptions": [],
            },
        ],
    }


def test_recipe_create_list_and_update(client, auth_headers):
    create_response = client.post("/recipes", json=_recipe_payload(), headers=auth_headers)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["title"] == "Tortitas proteicas"
    assert created["product"]["source"] == "user_recipe"
    assert created["product"]["nutrition_basis"] == "per_serving"

    list_response = client.get("/recipes/mine", headers=auth_headers)
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == 1
    assert listed[0]["title"] == "Tortitas proteicas"

    update_response = client.put(
        f"/recipes/{created['id']}",
        json=_recipe_payload("Tortitas pro deluxe"),
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["title"] == "Tortitas pro deluxe"
    assert updated["product"]["name"].startswith("Tortitas pro deluxe")

    search_response = client.get("/recipes/mine?q=deluxe", headers=auth_headers)
    assert search_response.status_code == 200
    assert len(search_response.json()) == 1


def test_recipe_duplicate_title_is_rejected(client, auth_headers):
    first = client.post("/recipes", json=_recipe_payload(), headers=auth_headers)
    assert first.status_code == 200
    second = client.post("/recipes", json=_recipe_payload(), headers=auth_headers)
    assert second.status_code == 409


def test_recipe_can_be_added_to_day_as_intake(client, auth_headers):
    recipe_response = client.post("/recipes", json=_recipe_payload("Bowl IA"), headers=auth_headers)
    assert recipe_response.status_code == 200
    recipe = recipe_response.json()

    intake_response = client.post(
        "/intakes",
        json={"product_id": recipe["product"]["id"], "method": "units", "quantity_units": 1},
        headers=auth_headers,
    )
    assert intake_response.status_code == 200
    intake = intake_response.json()
    assert intake["product_id"] == recipe["product"]["id"]
    assert intake["method"] == "units"
    assert intake["nutrients"]["kcal"] == 420.0


def test_ai_recipe_can_store_default_units_preference(client, auth_headers):
    response = client.post(
        "/recipes",
        json={**_recipe_payload("Receta IA"), "default_quantity_units": 2},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["preferred_serving"] is not None
    assert body["preferred_serving"]["method"] == "units"
    assert body["preferred_serving"]["quantity_units"] == 2.0

    detail = client.get(f"/recipes/{body['id']}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["preferred_serving"]["quantity_units"] == 2.0


def test_recipe_generate_with_ai(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.generate_recipe_with_ai", _mock_generate_recipe_with_ai)

    response = client.post(
        "/recipes/generate",
        json={
            "meal_type": "lunch",
            "target_kcal": 550,
            "target_protein_g": 35,
            "target_fat_g": 18,
            "target_carbs_g": 50,
            "goal_mode": "maintain",
            "use_only_ingredients": True,
            "allergies": ["nueces"],
            "preferences": ["high protein"],
            "available_ingredients": [
                {"name": "Atún", "quantity": 120, "unit": "g"},
                {"name": "Arroz cocido", "quantity": 150, "unit": "g"},
            ],
            "allow_basic_pantry": True,
            "locale": "es",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model_used"] == "gpt-4o-mini"
    assert body["recipe"]["title"] == "Bowl exprés de atún"
    assert body["feedback"]["highlights"] == ["Proteína suficiente."]
    assert body["assumptions"] == ["Se asumió arroz ya cocido."]


def test_recipe_ai_options_recommendation_and_detail(client, auth_headers, monkeypatch):
    _configure_ai_key(client, auth_headers)
    monkeypatch.setattr("app.api.routes.generate_recipe_options_with_ai", _mock_generate_recipe_options_with_ai)

    today = datetime.now(UTC).date().isoformat()
    goal_response = client.post(
        f"/goals/{today}",
        json={
            "kcal_goal": 2100,
            "protein_goal": 160,
            "fat_goal": 70,
            "carbs_goal": 220,
        },
        headers=auth_headers,
    )
    assert goal_response.status_code == 200

    product_response = client.post(
        "/foods/community",
        json={
            "name": "Skyr natural",
            "nutrition_basis": "per_100g",
            "kcal": 62,
            "protein_g": 11,
            "fat_g": 0.2,
            "carbs_g": 4,
        },
        headers=auth_headers,
    )
    assert product_response.status_code == 200
    product = product_response.json()

    intake_response = client.post(
        "/intakes",
        json={"product_id": product["id"], "method": "grams", "quantity_g": 300},
        headers=auth_headers,
    )
    assert intake_response.status_code == 200

    options_response = client.post(
        "/recipes/ai/options",
        json={
          "meal_type": "lunch",
          "target_kcal": 550,
          "target_protein_g": 40,
          "target_fat_g": 18,
          "target_carbs_g": 50,
          "goal_mode": "maintain",
          "use_only_ingredients": True,
          "available_ingredients": [
            {"name": "Pollo", "quantity": 200, "unit": "g"},
            {"name": "Arroz cocido", "quantity": 150, "unit": "g"},
          ],
          "allow_basic_pantry": True,
          "locale": "es",
        },
        headers=auth_headers,
    )
    assert options_response.status_code == 200
    body = options_response.json()
    assert len(body["options"]) == 3
    recommended = [item for item in body["options"] if item["recommended"]]
    assert len(recommended) == 1
    assert recommended[0]["option_id"] == "option_1"
    assert recommended[0]["recommended_reason"]

    detail_response = client.post(
        "/recipes/ai/detail",
        json={"generation_id": body["generation_id"], "option_id": "option_1"},
        headers=auth_headers,
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["recipe"]["title"] == "Bowl proteico de pollo"
    assert detail["recommended"] is True
    assert detail["recommended_reason"]
