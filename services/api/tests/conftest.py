from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import get_settings
from app.database import get_session
from app.main import create_app
from app.models import PendingRegistration
from app.services.rate_limit import rate_limiter


@pytest.fixture
def engine(tmp_path):
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(autouse=True)
def media_storage_env(tmp_path, monkeypatch):
    monkeypatch.setenv("SOCIAL_MEDIA_STORAGE_DIR", str(tmp_path / "social-media"))
    monkeypatch.setenv("MEAL_ANALYSIS_STORAGE_DIR", str(tmp_path / "meal-analysis"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client(engine) -> Iterator[TestClient]:
    rate_limiter.reset()
    app = create_app()

    def _get_session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _get_session_override

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def register_user(client: TestClient) -> dict[str, str]:
    email = f"tester-{uuid4().hex[:8]}@example.com"
    register_response = client.post(
        "/auth/register",
        json={
            "username": f"tester_{uuid4().hex[:8]}",
            "email": email,
            "password": "supersecret123",
            "sex": "male",
            "birth_date": "1993-01-15",
        },
    )
    assert register_response.status_code == 200
    code = register_response.json().get("debug_verification_code")
    assert code

    return {"email": email, "password": "supersecret123", "code": code}


@pytest.fixture
def verified_auth_headers(client: TestClient, register_user: dict[str, str]) -> dict[str, str]:
    verify_response = client.post("/auth/verify", json={"email": register_user["email"], "code": register_user["code"]})
    assert verify_response.status_code == 200

    token = verify_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers(
    client: TestClient,
    verified_auth_headers: dict[str, str],
) -> dict[str, str]:
    profile_response = client.post(
        "/profile",
        headers=verified_auth_headers,
        json={
            "weight_kg": 78,
            "height_cm": 176,
            "age": 32,
            "sex": "male",
            "activity_level": "moderate",
            "goal_type": "maintain",
            "waist_cm": 87,
            "neck_cm": 38,
        },
    )
    assert profile_response.status_code == 200

    goal_response = client.post(
        f"/goals/{date.today().isoformat()}",
        headers=verified_auth_headers,
        json={
            "kcal_goal": 2200,
            "protein_goal": 145,
            "fat_goal": 70,
            "carbs_goal": 240,
        },
    )
    assert goal_response.status_code == 200
    return verified_auth_headers


@pytest.fixture
def expire_latest_otp(engine):
    def _expire(email: str) -> None:
        with Session(engine) as session:
            target = session.exec(
                select(PendingRegistration)
                .where(PendingRegistration.email == email)
                .order_by(PendingRegistration.created_at.desc())
            )
            record = target.first()
            assert record is not None
            record.expires_at = datetime.now(UTC) - timedelta(minutes=1)
            session.add(record)
            session.commit()

    return _expire
