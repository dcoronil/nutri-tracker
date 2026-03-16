from datetime import date

from app.models import NutritionBasis


def _create_product(client, auth_headers):
    payload = {
        "barcode": "75000001",
        "name": "Leche",
        "brand": "Demo",
        "nutrition_basis": NutritionBasis.per_100ml.value,
        "label_text": "Por 100 ml Energía 60 kcal Proteínas 3 g Grasas 3 g Carbohidratos 5 g",
    }
    response = client.post("/products/from_label_photo", data=payload, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["created"] is True
    return body["product"]["id"]


def test_create_intake_and_summary(client, auth_headers):
    product_id = _create_product(client, auth_headers)

    goal_payload = {
        "kcal_goal": 2000,
        "protein_goal": 120,
        "fat_goal": 70,
        "carbs_goal": 220,
    }
    goal_response = client.post(
        f"/goals/{date.today().isoformat()}",
        json=goal_payload,
        headers=auth_headers,
    )
    assert goal_response.status_code == 200
    assert "realistic" in goal_response.json()["feedback"]

    intake_payload = {
        "product_id": product_id,
        "method": "grams",
        "quantity_g": 250,
    }

    intake_response = client.post("/intakes", json=intake_payload, headers=auth_headers)
    assert intake_response.status_code == 200
    intake_body = intake_response.json()
    assert intake_body["nutrients"]["kcal"] == 150.0

    summary_response = client.get(
        f"/days/{date.today().isoformat()}/summary",
        headers=auth_headers,
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()

    assert summary["consumed"]["kcal"] == 150.0
    assert summary["consumed"]["protein_g"] == 7.5
    assert summary["remaining"]["kcal"] == 1850.0

    calendar_response = client.get(
        f"/calendar/{date.today().strftime('%Y-%m')}",
        headers=auth_headers,
    )
    assert calendar_response.status_code == 200
    days = calendar_response.json()["days"]
    assert len(days) >= 1
