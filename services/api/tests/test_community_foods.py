from sqlmodel import Session

from app.api.routes import _recover_threshold_filtered_candidates
from app.models import NutritionBasis, Product
from app.services.openfoodfacts import OpenFoodFactsClientError


def _register_ready_user(client, *, email: str, password: str = "supersecret123") -> tuple[dict[str, str], int]:
    local_part = email.split("@")[0].lower().replace("-", "_").replace("+", "_").replace(".", "_")
    username = f"user_{local_part[:20]}"
    register = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email,
            "password": password,
            "sex": "male",
            "birth_date": "1993-08-17",
        },
    )
    assert register.status_code == 200
    code = register.json()["debug_verification_code"]

    verify = client.post("/auth/verify", json={"email": email, "code": code})
    assert verify.status_code == 200
    token = verify.json()["access_token"]
    user_id = verify.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}

    profile = client.post(
        "/profile",
        headers=headers,
        json={
            "weight_kg": 70,
            "height_cm": 175,
            "age": 30,
            "sex": "male",
            "activity_level": "moderate",
            "goal_type": "maintain",
        },
    )
    assert profile.status_code == 200

    goals = client.post(
        "/goals/2026-02-26",
        headers=headers,
        json={
            "kcal_goal": 2200,
            "protein_goal": 140,
            "fat_goal": 70,
            "carbs_goal": 230,
        },
    )
    assert goals.status_code == 200

    return headers, user_id


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
    assert first["origin"] == "local"


def test_search_foods_uses_openfoodfacts_text_search(monkeypatch, client, auth_headers):
    async def _fail_fetch(_ean: str):
        raise AssertionError("Barcode endpoint should not be used for text queries")

    async def _mock_search(query: str, *, limit: int = 20, rescue_mode: bool = False):
        assert query == "danone"
        assert limit >= 20
        return [
            {
                "barcode": "8410000000001",
                "name": "Danone Natural",
                "brand": "Danone",
                "image_url": "https://example.com/danone.jpg",
                "nutrition_basis": NutritionBasis.per_100g,
                "kcal": 64,
                "protein_g": 4.3,
                "fat_g": 2.8,
                "carbs_g": 5.1,
            }
        ]

    monkeypatch.setattr("app.api.routes.fetch_openfoodfacts_product", _fail_fetch)
    monkeypatch.setattr("app.api.routes.search_openfoodfacts_products", _mock_search)

    response = client.get("/foods/search?q=danone", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["results"]
    first = payload["results"][0]
    assert first["product"]["name"] == "Danone Natural"
    assert first["product"]["brand"] == "Danone"
    assert first["product"]["image_url"] == "https://example.com/danone.jpg"
    assert first["badge"] == "Importado"
    assert first["origin"] == "openfoodfacts_remote"


def test_search_foods_fuzzy_typo_matches_local_product(client, auth_headers):
    create = client.post(
        "/foods/community",
        json={
            "name": "Danone Natural Proteico",
            "brand": "Danone",
            "nutrition_basis": "per_100g",
            "kcal": 66,
            "protein_g": 5.1,
            "fat_g": 2.9,
            "carbs_g": 4.6,
        },
        headers=auth_headers,
    )
    assert create.status_code == 200

    response = client.get("/foods/search?q=danonne", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["results"]
    assert any(item["product"]["name"] == "Danone Natural Proteico" for item in payload["results"])


def test_search_foods_returns_public_community_from_other_user(client, auth_headers):
    other_headers, other_user_id = _register_ready_user(client, email="other-user@example.com")
    created = client.post(
        "/foods/community",
        json={
            "name": "Yogur Griego Comunidad",
            "brand": "Marca Vecina",
            "nutrition_basis": "per_100g",
            "kcal": 95,
            "protein_g": 9.0,
            "fat_g": 4.0,
            "carbs_g": 5.0,
        },
        headers=other_headers,
    )
    assert created.status_code == 200

    search = client.get("/foods/search?q=griego", headers=auth_headers)
    assert search.status_code == 200
    payload = search.json()
    assert payload["results"]
    assert any(
        item["product"]["name"] == "Yogur Griego Comunidad" and item["product"]["created_by_user_id"] == other_user_id
        for item in payload["results"]
    )


def test_search_foods_skips_remote_when_local_results_are_strong(monkeypatch, client, auth_headers):
    for index in range(6):
        response = client.post(
            "/foods/community",
            json={
                "name": f"Danone Natural {index}",
                "brand": "Danone",
                "nutrition_basis": "per_100g",
                "kcal": 62 + index,
                "protein_g": 4.0 + (index * 0.1),
                "fat_g": 2.0 + (index * 0.1),
                "carbs_g": 4.9,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def _unexpected_remote(*_args, **_kwargs):
        raise AssertionError("Remote text search should not run when local results are already strong")

    monkeypatch.setattr("app.api.routes.search_openfoodfacts_products", _unexpected_remote)

    search = client.get("/foods/search?q=danone", headers=auth_headers)
    assert search.status_code == 200
    rows = search.json()["results"]
    assert rows
    assert all(item["origin"] == "local" for item in rows[:6])


def test_search_foods_remote_results_prioritize_spain(monkeypatch, client, auth_headers):
    async def _mock_search(query: str, *, limit: int = 20, rescue_mode: bool = False):
        assert query == "danone"
        assert limit >= 16
        return [
            {
                "barcode": "4000000000001",
                "name": "Danone Nature FR",
                "brand": "Danone",
                "image_url": "https://example.com/fr.jpg",
                "nutrition_basis": NutritionBasis.per_100g,
                "kcal": 66,
                "protein_g": 4.1,
                "fat_g": 2.8,
                "carbs_g": 5.0,
                "lang": "fr",
                "countries_tags": ["en:france"],
                "countries": "France",
            },
            {
                "barcode": "8410000000002",
                "name": "Danone Natural ES",
                "brand": "Danone",
                "image_url": "https://example.com/es.jpg",
                "nutrition_basis": NutritionBasis.per_100g,
                "kcal": 64,
                "protein_g": 4.3,
                "fat_g": 2.7,
                "carbs_g": 5.1,
                "lang": "es",
                "countries_tags": ["en:spain"],
                "countries": "Spain",
            },
        ]

    monkeypatch.setattr("app.api.routes.search_openfoodfacts_products", _mock_search)

    search = client.get("/foods/search?q=danone", headers=auth_headers)
    assert search.status_code == 200
    rows = search.json()["results"]
    assert rows
    assert rows[0]["origin"] == "openfoodfacts_remote"
    assert rows[0]["product"]["barcode"] == "8410000000002"


def test_search_foods_does_not_mark_orphan_community_source_as_community(client, auth_headers, engine):
    with Session(engine) as session:
        product = Product(
            name="Danone Legacy Import",
            brand="Danone",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=67,
            protein_g=4.4,
            fat_g=2.9,
            carbs_g=5.2,
            source="community",
            created_by_user_id=None,
            data_confidence="openfoodfacts_imported",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(product)
        session.commit()
        session.refresh(product)
        product_id = product.id

    search = client.get("/foods/search?q=danone", headers=auth_headers)
    assert search.status_code == 200
    rows = search.json()["results"]
    orphan_row = next(item for item in rows if item["product"]["id"] == product_id)
    assert orphan_row["badge"] == "Importado"

    quality = client.get(f"/products/{product_id}/data-quality", headers=auth_headers)
    assert quality.status_code == 200
    assert quality.json()["label"] == "Importado"


def test_recover_threshold_filtered_candidates_returns_best_available_when_all_scores_are_low():
    low_a = Product(
        name="Proteico Suave",
        brand="Marca A",
        nutrition_basis=NutritionBasis.per_100g,
        kcal=78,
        protein_g=6.1,
        fat_g=1.2,
        carbs_g=8.4,
    )
    low_b = Product(
        name="Proteina Ligera",
        brand="Marca B",
        nutrition_basis=NutritionBasis.per_100g,
        kcal=82,
        protein_g=7.0,
        fat_g=1.3,
        carbs_g=7.8,
    )

    recovered = _recover_threshold_filtered_candidates(
        [(low_a, 11.0), (low_b, 13.5)],
        threshold=20.0,
        bounded_limit=20,
    )

    assert [product.name for product, _score in recovered] == ["Proteina Ligera", "Proteico Suave"]


def test_search_foods_prioritizes_exact_brand_match_for_single_word_queries(client, auth_headers):
    exact_brand = client.post(
        "/foods/community",
        json={
            "name": "Postre lacteo natural",
            "brand": "Danone",
            "nutrition_basis": "per_100g",
            "kcal": 69,
            "protein_g": 4.8,
            "fat_g": 2.7,
            "carbs_g": 6.1,
        },
        headers=auth_headers,
    )
    assert exact_brand.status_code == 200
    exact_id = exact_brand.json()["id"]

    noisy_name = client.post(
        "/foods/community",
        json={
            "name": "Danone-style topping dulce",
            "brand": "Otra Marca",
            "nutrition_basis": "per_100g",
            "kcal": 145,
            "protein_g": 1.2,
            "fat_g": 4.2,
            "carbs_g": 24.0,
        },
        headers=auth_headers,
    )
    assert noisy_name.status_code == 200

    response = client.get("/foods/search?q=danone", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert rows[0]["product"]["id"] == exact_id


def test_search_foods_does_not_promote_verified_zero_match_items(engine, client, auth_headers):
    with Session(engine) as session:
        yogurt = Product(
            name="Yogur griego premium",
            brand="Kaiku",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=82,
            protein_g=8.0,
            fat_g=2.3,
            carbs_g=5.1,
            source="local_verified",
            is_verified=True,
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        meat = Product(
            name="Carne picada magra",
            brand="Carniceria Central",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=163,
            protein_g=20.4,
            fat_g=8.1,
            carbs_g=0.0,
            source="manual",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(yogurt)
        session.add(meat)
        session.commit()
        session.refresh(yogurt)
        session.refresh(meat)

    response = client.get("/foods/search?q=carne", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert rows[0]["product"]["name"] == "Carne picada magra"
    assert all(item["product"]["name"] != "Yogur griego premium" for item in rows)


def test_search_foods_prefers_generic_short_circuit_when_query_is_common_and_local_is_irrelevant(
    monkeypatch, engine, client, auth_headers
):
    with Session(engine) as session:
        yogurt = Product(
            name="Yogur natural premium",
            brand="Kaiku",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=72,
            protein_g=6.2,
            fat_g=2.0,
            carbs_g=4.8,
            source="local_verified",
            is_verified=True,
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(yogurt)
        session.commit()

    async def _unexpected_remote(*_args, **_kwargs):
        raise AssertionError("Remote text search should not run when generic local fallback already covers the query")

    monkeypatch.setattr("app.api.routes.search_openfoodfacts_products", _unexpected_remote)

    response = client.get("/foods/search?q=coca cola", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert rows[0]["origin"] == "local"
    assert rows[0]["badge"] == "Generico"
    assert rows[0]["product"]["name"] == "Coca Cola"
    assert all(item["product"]["name"] != "Yogur natural premium" for item in rows)


def test_search_foods_multi_token_query_does_not_match_single_weak_token(engine, client, auth_headers):
    with Session(engine) as session:
        product = Product(
            name="Protein Chocolate Flavoured Shake",
            brand="Arla",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=73,
            protein_g=25.0,
            fat_g=1.0,
            carbs_g=4.0,
            source="openfoodfacts",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(product)
        session.commit()

    response = client.get("/foods/search?q=coca cola", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert all(item["product"]["name"] != "Protein Chocolate Flavoured Shake" for item in rows)


def test_search_foods_single_token_fuzzy_match_does_not_promote_unrelated_word(engine, client, auth_headers):
    with Session(engine) as session:
        product = Product(
            name="Estimación: plato de pasta con carne picada",
            brand=None,
            nutrition_basis=NutritionBasis.per_100g,
            kcal=210,
            protein_g=11.0,
            fat_g=6.0,
            carbs_g=28.0,
            source="manual",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(product)
        session.commit()

    response = client.get("/foods/search?q=platano", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert all(item["product"]["name"] != "Estimación: plato de pasta con carne picada" for item in rows)


def test_search_foods_prefers_local_head_when_single_result_is_already_clear(
    monkeypatch, engine, client, auth_headers
):
    with Session(engine) as session:
        product = Product(
            name="Pan integral de molde",
            brand="Marca Local",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=251,
            protein_g=8.4,
            fat_g=3.2,
            carbs_g=45.0,
            source="manual",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(product)
        session.commit()

    async def _unexpected_remote(*_args, **_kwargs):
        raise AssertionError("Remote text search should not run when the single local head is already strong")

    monkeypatch.setattr("app.api.routes.search_openfoodfacts_products", _unexpected_remote)

    response = client.get("/foods/search?q=pan", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert rows[0]["origin"] == "local"
    assert rows[0]["badge"] == "Generico"
    assert any(item["product"]["name"] == "Pan integral de molde" for item in rows)


def test_search_foods_skips_openfoodfacts_when_single_local_result_is_high_relevance(
    monkeypatch, engine, client, auth_headers
):
    with Session(engine) as session:
        product = Product(
            name="Pechuga de pollo",
            brand="Mercado Local",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=118,
            protein_g=23.0,
            fat_g=2.0,
            carbs_g=0.0,
            source="manual",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(product)
        session.commit()

    async def _unexpected_remote(*_args, **_kwargs):
        raise AssertionError("Remote text search should not run when the local head is already strong")

    monkeypatch.setattr("app.api.routes.search_openfoodfacts_products", _unexpected_remote)

    response = client.get("/foods/search?q=pollo", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert rows[0]["product"]["name"] == "Pechuga de pollo"


def test_search_foods_returns_generic_fallback_when_local_and_off_fail(monkeypatch, client, auth_headers):
    async def _failing_remote(*_args, **_kwargs):
        raise OpenFoodFactsClientError("OFF unavailable")

    monkeypatch.setattr("app.api.routes.search_openfoodfacts_products", _failing_remote)

    response = client.get("/foods/search?q=pan", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert rows[0]["badge"] == "Generico"
    assert rows[0]["origin"] == "local"
    assert rows[0]["product"]["source"] == "generic"


def test_search_foods_short_circuits_to_generic_before_trying_off(monkeypatch, client, auth_headers):
    async def _unexpected_remote(*_args, **_kwargs):
        raise AssertionError("Remote text search should not run when generic local fallback already covers the query")

    monkeypatch.setattr("app.api.routes.search_openfoodfacts_products", _unexpected_remote)

    response = client.get("/foods/search?q=pan", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert rows[0]["badge"] == "Generico"


def test_search_foods_basic_query_huevo_only_keeps_direct_variants(engine, client, auth_headers):
    with Session(engine) as session:
        indirect = Product(
            name="Galletas con huevo",
            brand="Marca Horno",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=430,
            protein_g=6.0,
            fat_g=15.0,
            carbs_g=67.0,
            source="manual",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        direct = Product(
            name="Huevo campero L",
            brand="Huevos del Sur",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=145,
            protein_g=12.5,
            fat_g=10.0,
            carbs_g=0.8,
            source="manual",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(indirect)
        session.add(direct)
        session.commit()

    response = client.get("/foods/search?q=huevo", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert any(item["product"]["name"] == "Huevo campero L" for item in rows)
    assert all(item["product"]["name"] != "Galletas con huevo" for item in rows)


def test_search_foods_basic_query_aceite_excludes_products_where_it_is_only_an_ingredient(engine, client, auth_headers):
    with Session(engine) as session:
        indirect = Product(
            name="Atun en aceite de oliva",
            brand="Conservas",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=195,
            protein_g=24.0,
            fat_g=10.0,
            carbs_g=0.0,
            source="manual",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        direct = Product(
            name="Aceite de oliva suave",
            brand="Almazara",
            nutrition_basis=NutritionBasis.per_100g,
            kcal=884,
            protein_g=0.0,
            fat_g=100.0,
            carbs_g=0.0,
            source="manual",
            is_public=True,
            is_hidden=False,
            status="approved",
        )
        session.add(indirect)
        session.add(direct)
        session.commit()

    response = client.get("/foods/search?q=aceite", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert any(item["product"]["name"] == "Aceite de oliva suave" for item in rows)
    assert all(item["product"]["name"] != "Atun en aceite de oliva" for item in rows)
