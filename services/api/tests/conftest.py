from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import create_app


@pytest.fixture
def client(tmp_path) -> Iterator[TestClient]:
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    app = create_app()

    def _get_session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _get_session_override

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    email = f"tester-{uuid4().hex[:8]}@example.com"
    register_payload = {
        "email": email,
        "password": "supersecret123",
        "weight_kg": 78,
        "height_cm": 176,
        "age": 32,
        "sex": "male",
        "activity_level": "moderate",
        "goal_type": "maintain",
    }

    register_response = client.post("/auth/register", json=register_payload)
    assert register_response.status_code == 200
    code = register_response.json().get("debug_verification_code")
    assert code

    verify_response = client.post(
        "/auth/verify-email",
        json={"email": email, "code": code},
    )
    assert verify_response.status_code == 200

    token = verify_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
