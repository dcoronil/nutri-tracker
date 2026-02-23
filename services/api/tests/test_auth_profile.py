from datetime import date
from uuid import uuid4


def test_register_verify_login_and_analysis(client):
    email = f"new-{uuid4().hex[:8]}@example.com"

    register_payload = {
        "email": email,
        "password": "supersecret123",
        "weight_kg": 82,
        "height_cm": 180,
        "age": 31,
        "sex": "male",
        "activity_level": "moderate",
        "goal_type": "lose",
        "waist_cm": 90,
        "neck_cm": 39,
    }

    register_response = client.post("/auth/register", json=register_payload)
    assert register_response.status_code == 200
    code = register_response.json()["debug_verification_code"]

    verify_response = client.post(
        "/auth/verify-email",
        json={"email": email, "code": code},
    )
    assert verify_response.status_code == 200
    token = verify_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    login_response = client.post(
        "/auth/login",
        json={"email": email, "password": "supersecret123"},
    )
    assert login_response.status_code == 200

    profile_response = client.get("/me/profile", headers=headers)
    assert profile_response.status_code == 200
    profile = profile_response.json()
    assert profile["bmi"] > 0
    assert profile["bmi_category"] in {"Bajo peso", "Saludable", "Sobrepeso", "Obesidad"}

    analysis_response = client.get(f"/me/analysis?day={date.today().isoformat()}", headers=headers)
    assert analysis_response.status_code == 200
    analysis = analysis_response.json()
    assert analysis["recommended_goal"]["kcal_goal"] > 0
