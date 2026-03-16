from datetime import UTC, date, datetime, timedelta


def _create_product(client, auth_headers, barcode: str, name: str = "Producto base") -> int:
    response = client.post(
        "/products/from_label_photo",
        data={
            "barcode": barcode,
            "name": name,
            "brand": "Demo",
            "nutrition_basis": "per_100g",
            "label_text": "Por 100 g Energía 200 kcal Proteínas 10 g Grasas 5 g Carbohidratos 20 g",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] is True
    assert body["product"] is not None
    return int(body["product"]["id"])


def test_water_logs_day_summary_and_widget(client, auth_headers):
    now = datetime.now(UTC)
    today = now.date().isoformat()

    weight_log = client.post(
        "/body/weight-logs",
        json={"weight_kg": 77.4, "created_at": now.isoformat()},
        headers=auth_headers,
    )
    assert weight_log.status_code == 200

    water_1 = client.post("/water/logs", json={"ml": 350}, headers=auth_headers)
    water_2 = client.post("/water/logs", json={"ml": 500}, headers=auth_headers)
    assert water_1.status_code == 200
    assert water_2.status_code == 200

    day_summary = client.get(f"/days/{today}/summary", headers=auth_headers)
    assert day_summary.status_code == 200
    assert day_summary.json()["water_ml"] >= 850

    widget = client.get("/widget/summary/today", headers=auth_headers)
    assert widget.status_code == 200
    payload = widget.json()
    assert payload["water_ml"] >= 850
    assert payload["latest_weight_kg"] == 77.4
    assert "kcal_remaining" in payload


def test_favorites_flow(client, auth_headers):
    product_id = _create_product(client, auth_headers, "7844000011111", "Yogur natural")

    add_favorite = client.post(f"/favorites/products/{product_id}", headers=auth_headers)
    assert add_favorite.status_code == 200
    assert add_favorite.json()["favorited"] is True

    list_favorites = client.get("/favorites/products", headers=auth_headers)
    assert list_favorites.status_code == 200
    rows = list_favorites.json()
    assert rows
    assert any(row["product"]["id"] == product_id for row in rows)

    remove_favorite = client.delete(f"/favorites/products/{product_id}", headers=auth_headers)
    assert remove_favorite.status_code == 200
    assert remove_favorite.json()["favorited"] is False


def test_repeat_intakes_from_day(client, auth_headers):
    product_id = _create_product(client, auth_headers, "7844000011112", "Galleta avena")

    create_intake = client.post(
        "/intakes",
        json={"product_id": product_id, "method": "grams", "quantity_g": 85},
        headers=auth_headers,
    )
    assert create_intake.status_code == 200

    from_day = date.today().isoformat()
    to_day = (date.today() + timedelta(days=1)).isoformat()
    repeat = client.post(f"/intakes/repeat-from-day/{from_day}?to_day={to_day}", headers=auth_headers)
    assert repeat.status_code == 200
    body = repeat.json()
    assert body["copied"] >= 1
    assert body["from_day"] == from_day
    assert body["to_day"] == to_day

    target_summary = client.get(f"/days/{to_day}/summary", headers=auth_headers)
    assert target_summary.status_code == 200
    assert len(target_summary.json()["intakes"]) >= 1


def test_community_food_report_flags_product(client, auth_headers):
    create = client.post(
        "/foods/community",
        json={
            "name": "Snack de prueba",
            "brand": "Comunidad",
            "barcode": "7844000011113",
            "nutrition_basis": "per_100g",
            "kcal": 333,
            "protein_g": 7,
            "fat_g": 12,
            "carbs_g": 44,
        },
        headers=auth_headers,
    )
    assert create.status_code == 200
    product_id = create.json()["id"]

    last_payload = None
    for _ in range(5):
        response = client.post(f"/foods/{product_id}/report", headers=auth_headers)
        assert response.status_code == 200
        last_payload = response.json()

    assert last_payload is not None
    assert last_payload["report_count"] >= 5
    assert last_payload["status"] == "flagged"
    assert last_payload["is_hidden"] is True


def test_search_prioritizes_favorite_products(client, auth_headers):
    first = client.post(
        "/foods/community",
        json={
            "name": "Danone Natural Base",
            "brand": "Danone",
            "nutrition_basis": "per_100g",
            "kcal": 60,
            "protein_g": 4.1,
            "fat_g": 2.1,
            "carbs_g": 5.2,
        },
        headers=auth_headers,
    )
    second = client.post(
        "/foods/community",
        json={
            "name": "Danone Natural Protein",
            "brand": "Danone",
            "nutrition_basis": "per_100g",
            "kcal": 64,
            "protein_g": 5.0,
            "fat_g": 2.5,
            "carbs_g": 4.8,
        },
        headers=auth_headers,
    )
    assert first.status_code == 200
    assert second.status_code == 200

    second_id = second.json()["id"]
    favorite = client.post(f"/favorites/products/{second_id}", headers=auth_headers)
    assert favorite.status_code == 200

    search = client.get("/foods/search?q=danone", headers=auth_headers)
    assert search.status_code == 200
    rows = search.json()["results"]
    assert rows
    assert rows[0]["product"]["id"] == second_id
