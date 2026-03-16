from datetime import UTC, datetime, timedelta


def test_body_weight_and_summary_flow(client, auth_headers):
    now = datetime.now(UTC)

    weight_payloads = [
        {"weight_kg": 80.4, "created_at": (now - timedelta(days=13)).isoformat()},
        {"weight_kg": 80.1, "created_at": (now - timedelta(days=9)).isoformat()},
        {"weight_kg": 79.6, "created_at": (now - timedelta(days=6)).isoformat()},
        {"weight_kg": 79.2, "created_at": (now - timedelta(days=2)).isoformat()},
    ]

    for payload in weight_payloads:
        response = client.post("/body/weight-logs", json=payload, headers=auth_headers)
        assert response.status_code == 200

    list_response = client.get("/body/weight-logs", headers=auth_headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) >= 4

    measurement_response = client.post(
        "/body/measurement-logs",
        json={
            "waist_cm": 86,
            "neck_cm": 38,
            "chest_cm": 101,
            "arm_cm": 34,
            "thigh_cm": 55,
        },
        headers=auth_headers,
    )
    assert measurement_response.status_code == 200

    summary_response = client.get("/body/summary", headers=auth_headers)
    assert summary_response.status_code == 200
    summary = summary_response.json()

    assert summary["latest_weight_kg"] > 0
    assert summary["weekly_change_kg"] is not None
    assert summary["bmi"] is not None
    assert isinstance(summary["trend_points"], list)
    assert isinstance(summary["hints"], list)
