from datetime import date


def test_meal_photo_questions(client, auth_headers):
    response = client.post(
        "/meal-photo-estimate/questions",
        data={
            "description": "arroz con pollo",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["questions"], list)
    assert "pollo" in body["detected_ingredients"]


def test_meal_photo_preview_and_commit(client, auth_headers):
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
    assert preview_body["intake"] is None
    assert preview_body["preview_nutrients"]["kcal"] > 0

    commit = client.post(
        "/intakes/from-meal-photo-estimate",
        data={
            "description": "arroz con pollo y mayonesa",
            "portion_size": "medium",
            "has_added_fats": "true",
            "quantity_note": "1 plato",
            "adjust_percent": "0",
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

    summary = client.get(f"/days/{date.today().isoformat()}/summary", headers=auth_headers)
    assert summary.status_code == 200
    intakes = summary.json()["intakes"]
    assert any(item.get("source_method") == "meal_photo" for item in intakes)
