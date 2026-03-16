from app.models import NutritionBasis


def test_lookup_local_product(client, auth_headers):
    payload = {
        "barcode": "12345678",
        "name": "Yogur griego",
        "brand": "Marca X",
        "nutrition_basis": NutritionBasis.per_100g.value,
        "label_text": "Por 100 g Energía 120 kcal Proteínas 8 g Grasas 4 g Carbohidratos 10 g",
    }

    create_response = client.post("/products/from_label_photo", data=payload, headers=auth_headers)
    assert create_response.status_code == 200
    assert create_response.json()["created"] is True

    lookup = client.get("/products/by_barcode/12345678", headers=auth_headers)
    assert lookup.status_code == 200
    body = lookup.json()
    assert body["source"] == "local"
    assert body["product"]["name"] == "Yogur griego"


def test_lookup_openfoodfacts_import(monkeypatch, client, auth_headers):
    async def _mock_fetch(_ean: str):
        return {
            "barcode": "76111111",
            "name": "Barrita",
            "brand": "Demo",
            "image_url": "https://images.openfoodfacts.org/images/products/761/111/11/front_es.3.400.jpg",
            "nutrition_basis": NutritionBasis.per_100g,
            "serving_size_g": 30,
            "net_weight_g": 90,
            "kcal": 420,
            "protein_g": 10,
            "fat_g": 15,
            "sat_fat_g": 4,
            "carbs_g": 60,
            "sugars_g": 20,
            "fiber_g": 3,
            "salt_g": 0.3,
        }

    monkeypatch.setattr("app.api.routes.fetch_openfoodfacts_product", _mock_fetch)

    response = client.get("/products/by_barcode/76111111", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "openfoodfacts_imported"
    assert body["product"]["barcode"] == "76111111"
    assert body["product"]["image_url"] is not None


def test_label_photo_missing_fields(client, auth_headers):
    payload = {
        "name": "Producto incompleto",
        "label_text": "Por 100 g Energía 180 kcal Proteínas 5 g",
    }

    response = client.post("/products/from_label_photo", data=payload, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["created"] is False
    assert "fat_g" in body["missing_fields"]
    assert "carbs_g" in body["missing_fields"]


def test_local_manual_product_does_not_mix_with_openfoodfacts_image(monkeypatch, client, auth_headers):
    payload = {
        "barcode": "99001122",
        "name": "Producto manual",
        "brand": "Casa",
        "nutrition_basis": NutritionBasis.per_100g.value,
        "label_text": "Por 100 g Energía 250 kcal Proteínas 11 g Grasas 9 g Carbohidratos 30 g",
    }
    create_response = client.post("/products/from_label_photo", data=payload, headers=auth_headers)
    assert create_response.status_code == 200
    assert create_response.json()["created"] is True

    async def _fail_if_called(_ean: str):
        raise AssertionError("OpenFoodFacts should not be called for label/manual product")

    monkeypatch.setattr("app.api.routes.fetch_openfoodfacts_product", _fail_if_called)

    lookup = client.get("/products/by_barcode/99001122", headers=auth_headers)
    assert lookup.status_code == 200
    body = lookup.json()
    assert body["source"] == "local"
    assert body["product"]["name"] == "Producto manual"
    assert body["product"]["image_url"] is None


def test_correct_product_from_label_photo_preview_and_confirm(client, auth_headers):
    payload = {
        "barcode": "88001122",
        "name": "Galletas",
        "brand": "Demo",
        "nutrition_basis": NutritionBasis.per_100g.value,
        "label_text": "Por 100 g Energía 450 kcal Proteínas 6 g Grasas 16 g Carbohidratos 70 g",
    }
    create_response = client.post("/products/from_label_photo", data=payload, headers=auth_headers)
    assert create_response.status_code == 200
    created = create_response.json()["product"]
    product_id = created["id"]

    preview = client.post(
        f"/products/{product_id}/correct-from-label-photo",
        data={
            "label_text": "Por 100 g Energía 390 kcal Proteínas 8 g Grasas 10 g Carbohidratos 66 g",
        },
        headers=auth_headers,
    )
    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["updated"] is False
    assert preview_body["current"]["kcal"] == 450.0
    assert preview_body["detected"]["kcal"] == 390.0

    confirm = client.post(
        f"/products/{product_id}/correct-from-label-photo",
        data={
            "confirm_update": "true",
            "label_text": "Por 100 g Energía 390 kcal Proteínas 8 g Grasas 10 g Carbohidratos 66 g",
        },
        headers=auth_headers,
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["updated"] is True
    assert body["product"]["kcal"] == 390.0
    assert body["product"]["source"] == "local_verified"
    assert body["product"]["is_verified"] is True
    assert body["product"]["verified_at"] is not None


def test_local_verified_product_is_not_refreshed_from_openfoodfacts(monkeypatch, client, auth_headers):
    payload = {
        "barcode": "99112233",
        "name": "Producto fijo",
        "brand": "Local",
        "nutrition_basis": NutritionBasis.per_100g.value,
        "label_text": "Por 100 g Energía 210 kcal Proteínas 9 g Grasas 8 g Carbohidratos 25 g",
    }
    create_response = client.post("/products/from_label_photo", data=payload, headers=auth_headers)
    assert create_response.status_code == 200

    calls = {"count": 0}

    async def _mock_fetch(_ean: str):
        calls["count"] += 1
        return {
            "barcode": "99112233",
            "name": "Producto externo",
            "brand": "OFF",
            "image_url": "https://example.com/off.jpg",
            "nutrition_basis": NutritionBasis.per_100g,
            "serving_size_g": 20,
            "net_weight_g": 100,
            "kcal": 999,
            "protein_g": 1,
            "fat_g": 1,
            "sat_fat_g": 1,
            "carbs_g": 1,
            "sugars_g": 1,
            "fiber_g": 1,
            "salt_g": 1,
        }

    monkeypatch.setattr("app.api.routes.fetch_openfoodfacts_product", _mock_fetch)

    lookup = client.get("/products/by_barcode/99112233", headers=auth_headers)
    assert lookup.status_code == 200
    body = lookup.json()
    assert calls["count"] == 0
    assert body["product"]["name"] == "Producto fijo"
    assert body["product"]["kcal"] == 210.0


def test_product_data_quality_verified_and_imported(monkeypatch, client, auth_headers):
    local_payload = {
        "barcode": "33001122",
        "name": "Local verificado",
        "brand": "Casa",
        "nutrition_basis": NutritionBasis.per_100g.value,
        "label_text": "Por 100 g Energía 120 kcal Proteínas 11 g Grasas 2 g Carbohidratos 14 g",
    }
    local_create = client.post("/products/from_label_photo", data=local_payload, headers=auth_headers)
    assert local_create.status_code == 200
    local_product_id = local_create.json()["product"]["id"]

    local_quality = client.get(f"/products/{local_product_id}/data-quality", headers=auth_headers)
    assert local_quality.status_code == 200
    assert local_quality.json()["status"] == "verified"

    async def _mock_fetch(_ean: str):
        return {
            "barcode": "44001122",
            "name": "Importado OFF",
            "brand": "OFF",
            "image_url": None,
            "nutrition_basis": NutritionBasis.per_100g,
            "serving_size_g": 40,
            "net_weight_g": 160,
            "kcal": 500,
            "protein_g": 7,
            "fat_g": 24,
            "sat_fat_g": 9,
            "carbs_g": 62,
            "sugars_g": 31,
            "fiber_g": 1,
            "salt_g": 0.5,
        }

    monkeypatch.setattr("app.api.routes.fetch_openfoodfacts_product", _mock_fetch)
    imported_lookup = client.get("/products/by_barcode/44001122", headers=auth_headers)
    assert imported_lookup.status_code == 200
    imported_product_id = imported_lookup.json()["product"]["id"]

    imported_quality = client.get(f"/products/{imported_product_id}/data-quality", headers=auth_headers)
    assert imported_quality.status_code == 200
    assert imported_quality.json()["status"] == "imported"


def test_correct_product_uses_ai_when_key_available(monkeypatch, client, auth_headers):
    save_key = client.post(
        "/user/ai-key",
        json={"provider": "openai", "api_key": "sk-test-key-1234567890abcd"},
        headers=auth_headers,
    )
    assert save_key.status_code == 200

    payload = {
        "barcode": "77110022",
        "name": "Cereal",
        "brand": "Demo",
        "nutrition_basis": NutritionBasis.per_100g.value,
        "label_text": "Por 100 g Energía 410 kcal Proteínas 8 g Grasas 11 g Carbohidratos 66 g",
    }
    create_response = client.post("/products/from_label_photo", data=payload, headers=auth_headers)
    assert create_response.status_code == 200
    product_id = create_response.json()["product"]["id"]

    async def _mock_ai_extract(*, api_key: str, label_text: str, photo_files: list, basis_hint):
        del label_text, photo_files, basis_hint
        assert api_key.startswith("sk-")
        return {
            "nutrition": {
                "kcal": 392.0,
                "protein_g": 9.0,
                "fat_g": 8.0,
                "sat_fat_g": 1.2,
                "carbs_g": 69.0,
                "sugars_g": 17.0,
                "fiber_g": 4.0,
                "salt_g": 0.3,
                "nutrition_basis": NutritionBasis.per_100g,
                "serving_size_g": None,
            },
            "questions": [],
            "analysis_method": "ai_vision",
        }

    monkeypatch.setattr("app.api.routes.extract_label_nutrition_with_ai", _mock_ai_extract)

    preview = client.post(
        f"/products/{product_id}/correct-from-label-photo",
        data={"label_text": "tabla nutricional actualizada"},
        headers=auth_headers,
    )
    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["analysis_method"] == "ai_vision"
    assert preview_body["warnings"] == []
    assert preview_body["detected"]["kcal"] == 392.0

    confirm = client.post(
        f"/products/{product_id}/correct-from-label-photo",
        data={"confirm_update": "true", "label_text": "tabla nutricional actualizada"},
        headers=auth_headers,
    )
    assert confirm.status_code == 200
    confirmed = confirm.json()
    assert confirmed["updated"] is True
    assert confirmed["analysis_method"] == "ai_vision"
    assert confirmed["product"]["kcal"] == 392.0
