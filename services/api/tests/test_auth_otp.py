from uuid import uuid4


def test_verify_otp_ok(client):
    email = f"otp-ok-{uuid4().hex[:8]}@example.com"
    register_response = client.post(
        "/auth/register",
        json={
            "username": f"otp_ok_{uuid4().hex[:6]}",
            "email": email,
            "password": "supersecret123",
            "sex": "male",
            "birth_date": "1992-02-14",
        },
    )
    assert register_response.status_code == 200
    code = register_response.json()["debug_verification_code"]

    verify_response = client.post(
        "/auth/verify",
        json={"email": email, "code": code},
    )
    assert verify_response.status_code == 200
    body = verify_response.json()
    assert body["user"]["email_verified"] is True


def test_verify_otp_fail_wrong_code(client):
    email = f"otp-fail-{uuid4().hex[:8]}@example.com"
    register_response = client.post(
        "/auth/register",
        json={
            "username": f"otp_fail_{uuid4().hex[:6]}",
            "email": email,
            "password": "supersecret123",
            "sex": "female",
            "birth_date": "1996-11-03",
        },
    )
    assert register_response.status_code == 200

    verify_response = client.post(
        "/auth/verify",
        json={"email": email, "code": "000000"},
    )
    assert verify_response.status_code == 400
    assert "Invalid verification code" in verify_response.json()["detail"]


def test_verify_otp_fail_expired(client, register_user, expire_latest_otp):
    expire_latest_otp(register_user["email"])

    verify_response = client.post(
        "/auth/verify",
        json={"email": register_user["email"], "code": register_user["code"]},
    )
    assert verify_response.status_code == 400
    assert "expired" in verify_response.json()["detail"].lower()
