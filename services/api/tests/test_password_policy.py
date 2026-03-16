from __future__ import annotations

from uuid import uuid4


def test_register_rejects_common_password(client):
    response = client.post(
        "/auth/register",
        json={
            "username": f"common_{uuid4().hex[:8]}",
            "email": f"common-{uuid4().hex[:8]}@example.com",
            "password": "password",
            "sex": "male",
            "birth_date": "1990-01-01",
        },
    )

    assert response.status_code == 422
    assert "común" in response.json()["detail"].lower()


def test_register_rejects_case_variant_common_password(client):
    response = client.post(
        "/auth/register",
        json={
            "username": f"case_{uuid4().hex[:8]}",
            "email": f"common-case-{uuid4().hex[:8]}@example.com",
            "password": "Password123",
            "sex": "female",
            "birth_date": "1991-01-01",
        },
    )

    assert response.status_code == 422
    assert "común" in response.json()["detail"].lower()


def test_register_accepts_non_common_password(client):
    response = client.post(
        "/auth/register",
        json={
            "username": f"rare_{uuid4().hex[:8]}",
            "email": f"rare-{uuid4().hex[:8]}@example.com",
            "password": "T6!zqR9$m2x1",
            "sex": "male",
            "birth_date": "1989-01-01",
        },
    )

    assert response.status_code == 200
