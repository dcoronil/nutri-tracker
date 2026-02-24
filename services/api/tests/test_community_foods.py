from app.models import NutritionBasis


def test_create_community_food_and_search(client, auth_headers):
    create = client.post(
        "/foods/community",
        json={
            "name": "Pan integral casero",
            "brand": "Comunidad",
            "barcode": "1234567890123",
            "nutrition_basis": "per_100g",
            "kcal": 260,
            "protein_g": 9.8,
            "fat_g": 3.4,
            "carbs_g": 46.0,
            "fiber_g": 6.3,
            "salt_g": 0.8,
        },
        headers=auth_headers,
    )
    assert create.status_code == 200
    body = create.json()
    assert body["source"] == "community"
    assert body["created_by_user_id"] is not None
    assert body["is_public"] is True

    search = client.get("/foods/search?q=pan", headers=auth_headers)
    assert search.status_code == 200
    payload = search.json()
    assert payload["query"] == "pan"
    assert any(item["product"]["id"] == body["id"] and item["badge"] == "Comunidad" for item in payload["results"])


def test_create_community_food_barcode_conflict(client, auth_headers):
    base_payload = {
        "name": "Yogur 0%",
        "brand": "Comunidad",
        "barcode": "7611111111111",
        "nutrition_basis": "per_100g",
        "kcal": 58,
        "protein_g": 10.0,
        "fat_g": 0.1,
        "carbs_g": 3.2,
    }

    first = client.post("/foods/community", json=base_payload, headers=auth_headers)
    assert first.status_code == 200

    second = client.post("/foods/community", json=base_payload, headers=auth_headers)
    assert second.status_code == 409


def test_search_foods_imports_openfoodfacts_for_barcode(monkeypatch, client, auth_headers):
    async def _mock_fetch(_ean: str):
        return {
            "barcode": "76199999",
            "name": "Barra OFF",
            "brand": "OFF",
            "image_url": "https://example.com/off.jpg",
            "nutrition_basis": NutritionBasis.per_100g,
            "serving_size_g": 30,
            "net_weight_g": 90,
            "kcal": 410,
            "protein_g": 8,
            "fat_g": 14,
            "sat_fat_g": 5,
            "carbs_g": 62,
            "sugars_g": 27,
            "fiber_g": 2,
            "salt_g": 0.4,
        }

    monkeypatch.setattr("app.api.routes.fetch_openfoodfacts_product", _mock_fetch)

    search = client.get("/foods/search?q=76199999", headers=auth_headers)
    assert search.status_code == 200
    payload = search.json()
    assert payload["results"]
    first = payload["results"][0]
    assert first["product"]["barcode"] == "76199999"
    assert first["badge"] == "Importado"
